import { createReadStream, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ClaudeEventSchema, type ClaudeEvent, computeCost, resolveModel } from "@cgd/shared";
import { db } from "../db/client.js";
import { messages, sessions, syncState } from "../db/schema.js";

const CLAUDE_PROJECTS_DIR = resolve(homedir(), ".claude/projects");

export interface ParseStats {
  filesScanned: number;
  eventsIngested: number;
  sessionsUpserted: number;
  skippedLines: number;
  durationMs: number;
}

interface SessionAgg {
  id: string;
  projectPath: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  costUsd: number;
  modelCounts: Record<string, number>;
  gitBranch: string | null;
}

function unslugProjectPath(slug: string): string {
  // ~/.claude/projects/ slug format: path with `/` replaced by `-`
  // We can't perfectly reverse since `-` is ambiguous, but we attempt reasonable reconstruction.
  if (slug.startsWith("-")) return slug.replace(/-/g, "/");
  return slug;
}

function extractTokens(ev: ClaudeEvent): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
} {
  const u = ev.message?.usage;
  if (!u) return { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
  const w5m = u.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const totalCacheWrite = u.cache_creation_input_tokens ?? 0;
  // If detailed breakdown missing, treat entire cache_creation as 5m ephemeral
  const resolved5m = w5m || (totalCacheWrite && !w1h ? totalCacheWrite : w5m);
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite5m: resolved5m,
    cacheWrite1h: w1h,
  };
}

function extractFilePath(ev: ClaudeEvent): string | null {
  const r = ev.toolUseResult;
  if (!r) return null;
  return r.filePath ?? r.file_path ?? null;
}

async function listSessionFiles(): Promise<string[]> {
  const out: string[] = [];
  let projects;
  try {
    projects = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const dir = resolve(CLAUDE_PROJECTS_DIR, p.name);
    const files = await readdir(dir, { withFileTypes: true });
    for (const f of files) {
      if (f.isFile() && f.name.endsWith(".jsonl")) {
        out.push(resolve(dir, f.name));
      }
    }
  }
  return out;
}

async function readIncrementally(
  filePath: string,
  fromOffset: number
): Promise<{ lines: string[]; nextOffset: number }> {
  const size = statSync(filePath).size;
  if (fromOffset >= size) return { lines: [], nextOffset: size };
  return new Promise((res, rej) => {
    const stream = createReadStream(filePath, { start: fromOffset, encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    const lines: string[] = [];
    rl.on("line", (line) => {
      if (line.trim().length > 0) lines.push(line);
    });
    rl.on("close", () => res({ lines, nextOffset: size }));
    rl.on("error", rej);
    stream.on("error", rej);
  });
}

function pickPrimaryModel(counts: Record<string, number>): string | null {
  let best: string | null = null;
  let max = 0;
  for (const [m, c] of Object.entries(counts)) {
    if (c > max) {
      max = c;
      best = m;
    }
  }
  return best;
}

export async function syncClaude(): Promise<ParseStats> {
  const t0 = Date.now();
  const stats: ParseStats = {
    filesScanned: 0,
    eventsIngested: 0,
    sessionsUpserted: 0,
    skippedLines: 0,
    durationMs: 0,
  };

  const files = await listSessionFiles();

  const aggs = new Map<string, SessionAgg>();
  let msgRows: (typeof messages.$inferInsert)[] = [];

  // Claude Code replays the same assistant messages on session resume / compaction.
  // Each replay carries the same message.id → dedupe by that.
  // Within-run dedupe handled by this Set; cross-run dedupe by the INSERT OR IGNORE
  // (unique index on message_uid) at the flush call.
  const seenUids = new Set<string>();

  const MSG_FLUSH = 100;
  async function flushMessages() {
    if (msgRows.length === 0) return;
    await db.insert(messages).values(msgRows).onConflictDoNothing();
    msgRows = [];
  }

  for (const file of files) {
    stats.filesScanned++;
    const offsetRow = await db
      .select()
      .from(syncState)
      .where(and(eq(syncState.source, "claude_jsonl"), eq(syncState.key, file)))
      .get();

    const { lines, nextOffset } = await readIncrementally(file, offsetRow?.byteOffset ?? 0);
    if (lines.length === 0) {
      // still update timestamp
      if (!offsetRow) {
        await db.insert(syncState).values({
          source: "claude_jsonl",
          key: file,
          byteOffset: nextOffset,
          lastSyncedAt: new Date().toISOString(),
        }).onConflictDoNothing();
      }
      continue;
    }

    let msgIdx = 0;
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        stats.skippedLines++;
        continue;
      }
      const check = ClaudeEventSchema.safeParse(parsed);
      if (!check.success) {
        stats.skippedLines++;
        continue;
      }
      const ev = check.data;
      if (!ev.sessionId || !ev.timestamp) {
        stats.skippedLines++;
        continue;
      }

      const tokens = extractTokens(ev);
      const model = resolveModel(ev.message?.model ?? null);

      // Dedupe by message.id. If a usage-bearing event has a message.id we've seen before,
      // zero out the tokens/cost (but still count it toward messageCount) so we don't
      // inflate totals from resumed/compacted sessions.
      const msgUid = ev.message?.id ?? null;
      const isDupeUsage = !!msgUid && seenUids.has(msgUid);
      const hasAnyUsage =
        tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h > 0;
      if (hasAnyUsage && !isDupeUsage && msgUid) {
        seenUids.add(msgUid);
      }
      if (isDupeUsage) {
        tokens.input = 0;
        tokens.output = 0;
        tokens.cacheRead = 0;
        tokens.cacheWrite5m = 0;
        tokens.cacheWrite1h = 0;
      }
      const cost = computeCost(model, {
        input: tokens.input,
        output: tokens.output,
        cacheRead: tokens.cacheRead,
        cacheWrite5m: tokens.cacheWrite5m,
        cacheWrite1h: tokens.cacheWrite1h,
      });

      // Only count messages that have any token usage OR are user messages (for message_count)
      const hasUsage =
        tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h > 0;

      let agg = aggs.get(ev.sessionId);
      if (!agg) {
        agg = {
          id: ev.sessionId,
          projectPath: ev.cwd ?? "",
          startedAt: ev.timestamp,
          endedAt: ev.timestamp,
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          costUsd: 0,
          modelCounts: {},
          gitBranch: ev.gitBranch ?? null,
        };
        aggs.set(ev.sessionId, agg);
      }
      if (ev.cwd && !agg.projectPath) agg.projectPath = ev.cwd;
      if (ev.gitBranch && !agg.gitBranch) agg.gitBranch = ev.gitBranch;
      if (ev.timestamp < agg.startedAt) agg.startedAt = ev.timestamp;
      if (ev.timestamp > agg.endedAt) agg.endedAt = ev.timestamp;
      agg.messageCount++;
      agg.inputTokens += tokens.input;
      agg.outputTokens += tokens.output;
      agg.cacheReadTokens += tokens.cacheRead;
      agg.cacheWrite5mTokens += tokens.cacheWrite5m;
      agg.cacheWrite1hTokens += tokens.cacheWrite1h;
      agg.costUsd += cost;
      if (model) agg.modelCounts[model] = (agg.modelCounts[model] ?? 0) + 1;

      if (hasUsage || ev.type === "assistant" || ev.type === "user") {
        const filePath = extractFilePath(ev);
        msgRows.push({
          id: `${ev.sessionId}:${ev.timestamp}:${msgIdx++}`,
          sessionId: ev.sessionId,
          messageUid: msgUid,
          ts: ev.timestamp,
          type: ev.type ?? null,
          model: model ?? null,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          cacheReadTokens: tokens.cacheRead,
          cacheWriteTokens: tokens.cacheWrite5m + tokens.cacheWrite1h,
          costUsd: cost,
          filesTouchedJson: filePath ? JSON.stringify([filePath]) : null,
        });
        if (msgRows.length >= MSG_FLUSH) await flushMessages();
      }
      stats.eventsIngested++;
    }

    const nowIso = new Date().toISOString();
    await db
      .insert(syncState)
      .values({
        source: "claude_jsonl",
        key: file,
        byteOffset: nextOffset,
        lastSyncedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: [syncState.source, syncState.key],
        set: { byteOffset: nextOffset, lastSyncedAt: nowIso },
      });

  }

  await flushMessages();

  const aggIds = [...aggs.keys()];
  if (aggIds.length > 0) {
    const existingRows =
      aggIds.length > 0
        ? await db.select().from(sessions).where(inArray(sessions.id, aggIds)).all()
        : [];
    const existingById = new Map(existingRows.map((r) => [r.id, r]));

    const merged: (typeof sessions.$inferInsert)[] = [];
    for (const agg of aggs.values()) {
      const existing = existingById.get(agg.id);
      if (existing) {
        merged.push({
          ...existing,
          projectPath: existing.projectPath || agg.projectPath,
          startedAt: existing.startedAt < agg.startedAt ? existing.startedAt : agg.startedAt,
          endedAt: existing.endedAt > agg.endedAt ? existing.endedAt : agg.endedAt,
          messageCount: existing.messageCount + agg.messageCount,
          inputTokens: existing.inputTokens + agg.inputTokens,
          outputTokens: existing.outputTokens + agg.outputTokens,
          cacheReadTokens: existing.cacheReadTokens + agg.cacheReadTokens,
          cacheWrite5mTokens: existing.cacheWrite5mTokens + agg.cacheWrite5mTokens,
          cacheWrite1hTokens: existing.cacheWrite1hTokens + agg.cacheWrite1hTokens,
          costUsd: existing.costUsd + agg.costUsd,
          primaryModel: existing.primaryModel ?? pickPrimaryModel(agg.modelCounts),
          gitBranch: existing.gitBranch ?? agg.gitBranch,
        });
      } else {
        merged.push({
          id: agg.id,
          projectPath: agg.projectPath,
          startedAt: agg.startedAt,
          endedAt: agg.endedAt,
          messageCount: agg.messageCount,
          inputTokens: agg.inputTokens,
          outputTokens: agg.outputTokens,
          cacheReadTokens: agg.cacheReadTokens,
          cacheWrite5mTokens: agg.cacheWrite5mTokens,
          cacheWrite1hTokens: agg.cacheWrite1hTokens,
          costUsd: agg.costUsd,
          primaryModel: pickPrimaryModel(agg.modelCounts),
          gitBranch: agg.gitBranch,
        });
      }
    }

    for (const row of merged) {
      await db
        .insert(sessions)
        .values(row)
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            projectPath: row.projectPath,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            messageCount: row.messageCount,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            cacheReadTokens: row.cacheReadTokens,
            cacheWrite5mTokens: row.cacheWrite5mTokens,
            cacheWrite1hTokens: row.cacheWrite1hTokens,
            costUsd: row.costUsd,
            primaryModel: row.primaryModel,
            gitBranch: row.gitBranch,
          },
        });
    }
    stats.sessionsUpserted = merged.length;
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}

export { CLAUDE_PROJECTS_DIR, unslugProjectPath };
