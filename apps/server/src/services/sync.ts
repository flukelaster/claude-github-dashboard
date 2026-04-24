import { scrubSecrets, type SyncStatus } from "@cgd/shared";
import { syncClaude } from "./claude-parser.js";
import { syncGit } from "./git-indexer.js";
import { getActiveProviders } from "./providers/index.js";
import { syncProvider } from "./provider-sync.js";
import { syncLanguageLoc } from "./language-loc.js";
import { correlate } from "./correlation.js";

type Listener = (evt: SyncEvent) => void;

export type SyncEvent =
  | { type: "start"; source: string; at: string }
  | { type: "progress"; source: string; message: string }
  | { type: "done"; source: string; at: string; stats: Record<string, number | string> }
  | { type: "error"; source: string; at: string; message: string };

const listeners = new Set<Listener>();
let status: SyncStatus = {
  running: false,
  source: null,
  filesScanned: 0,
  eventsIngested: 0,
  sessionsUpserted: 0,
  lastRunAt: null,
  lastError: null,
};

function emit(evt: SyncEvent) {
  const safe =
    evt.type === "error" ? { ...evt, message: scrubSecrets(evt.message) } : evt;
  for (const l of listeners) l(safe);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getStatus(): SyncStatus {
  return { ...status };
}

export async function runFullSync(): Promise<SyncStatus> {
  if (status.running) return getStatus();
  status = { ...status, running: true, lastError: null };
  const errors: string[] = [];

  // 1. Claude JSONL
  try {
    status.source = "claude_jsonl";
    emit({ type: "start", source: "claude_jsonl", at: new Date().toISOString() });
    const s = await syncClaude();
    status.filesScanned = s.filesScanned;
    status.eventsIngested = s.eventsIngested;
    status.sessionsUpserted = s.sessionsUpserted;
    emit({
      type: "done",
      source: "claude_jsonl",
      at: new Date().toISOString(),
      stats: {
        filesScanned: s.filesScanned,
        eventsIngested: s.eventsIngested,
        sessionsUpserted: s.sessionsUpserted,
        durationMs: s.durationMs,
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    errors.push(`claude: ${m}`);
    emit({ type: "error", source: "claude_jsonl", at: new Date().toISOString(), message: m });
  }

  // 2. Git indexer — always runs (fallback for repos remote provider can't see).
  //    Provider sync (step 3) overwrites local commits per-repo when it succeeds.
  const activeProviders = await getActiveProviders();
  try {
    status.source = "git";
    emit({ type: "start", source: "git", at: new Date().toISOString() });
    const g = await syncGit({ sinceDays: 90 });
    emit({
      type: "done",
      source: "git",
      at: new Date().toISOString(),
      stats: {
        reposDiscovered: g.reposDiscovered,
        reposIndexed: g.reposIndexed,
        commitsIngested: g.commitsIngested,
        durationMs: g.durationMs,
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    errors.push(`git: ${m}`);
    emit({ type: "error", source: "git", at: new Date().toISOString(), message: m });
  }

  // 3. Remote providers — authoritative when token set (commits + PRs via provider API)
  if (activeProviders.length === 0) {
    emit({
      type: "progress",
      source: "providers",
      message: "skipped — no provider tokens configured (Settings → Providers)",
    });
  } else {
    // Independent API hosts with separate rate-limit buckets — run providers
    // in parallel. Status source reflects the fan-out rather than any one.
    status.source = "providers";
    await Promise.all(
      activeProviders.map(async (p) => {
        emit({ type: "start", source: p.name, at: new Date().toISOString() });
        try {
          const r = await syncProvider(p, { sinceDays: 90 });
          emit({
            type: "done",
            source: p.name,
            at: new Date().toISOString(),
            stats: {
              reposSynced: r.reposSynced,
              prsUpserted: r.prsUpserted,
              commitsUpserted: r.commitsUpserted,
              languagesUpserted: r.languagesUpserted,
              rateLimitRemaining: r.rateLimitRemaining ?? -1,
              errors: r.errors.length,
              durationMs: r.durationMs,
            },
          });
          if (r.errors.length) errors.push(`${p.name}: ${r.errors.slice(0, 3).join("; ")}`);
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          emit({ type: "error", source: p.name, at: new Date().toISOString(), message: m });
        }
      })
    );
  }

  // 4. Language LOC — walk local filesystem, count lines per language.
  //    Runs regardless of GitHub token since it's pure local scan.
  try {
    status.source = "language_loc";
    emit({ type: "start", source: "language_loc", at: new Date().toISOString() });
    const l = await syncLanguageLoc();
    emit({
      type: "done",
      source: "language_loc",
      at: new Date().toISOString(),
      stats: {
        reposScanned: l.reposScanned,
        filesScanned: l.filesScanned,
        totalLoc: l.totalLoc,
        durationMs: l.durationMs,
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    errors.push(`language_loc: ${m}`);
    emit({ type: "error", source: "language_loc", at: new Date().toISOString(), message: m });
  }

  // 5. Correlation
  try {
    status.source = "correlation";
    emit({ type: "start", source: "correlation", at: new Date().toISOString() });
    const c = await correlate();
    emit({
      type: "done",
      source: "correlation",
      at: new Date().toISOString(),
      stats: {
        commitsProcessed: c.commitsProcessed,
        linksCreated: c.linksCreated,
        aiAssistedMarked: c.aiAssistedMarked,
        durationMs: c.durationMs,
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    errors.push(`correlation: ${m}`);
    emit({ type: "error", source: "correlation", at: new Date().toISOString(), message: m });
  }

  status = {
    ...status,
    running: false,
    source: null,
    lastRunAt: new Date().toISOString(),
    lastError: errors.length ? scrubSecrets(errors.join(" | ")) : null,
  };
  return getStatus();
}
