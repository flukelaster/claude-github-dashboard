import type { SyncStatus } from "@cgd/shared";
import { syncClaude } from "./claude-parser.js";
import { syncGit } from "./git-indexer.js";
import { hasGitHubToken, syncGitHub } from "./github-client.js";
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
  for (const l of listeners) l(evt);
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

  // 2. Git indexer — always runs (fallback for repos GitHub can't see).
  //    GitHub sync (step 3) overwrites local commits per-repo when it succeeds.
  const githubActive = await hasGitHubToken();
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

  // 3. GitHub — authoritative when token set (commits + PRs via GraphQL)
  if (githubActive) {
    try {
      status.source = "github";
      emit({ type: "start", source: "github", at: new Date().toISOString() });
      const gh = await syncGitHub({ sinceDays: 90 });
      emit({
        type: "done",
        source: "github",
        at: new Date().toISOString(),
        stats: {
          reposSynced: gh.reposSynced,
          prsUpserted: gh.prsUpserted,
          commitsUpserted: gh.commitsUpserted,
          languagesUpserted: gh.languagesUpserted,
          rateLimitRemaining: gh.rateLimitRemaining ?? -1,
          errors: gh.errors.length,
          durationMs: gh.durationMs,
        },
      });
      if (gh.errors.length) errors.push(`github: ${gh.errors.slice(0, 3).join("; ")}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      emit({ type: "error", source: "github", at: new Date().toISOString(), message: m });
    }
  } else {
    emit({
      type: "progress",
      source: "github",
      message: "skipped — no token configured (Settings → GitHub)",
    });
  }

  // 4. Correlation
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
    lastError: errors.length ? errors.join(" | ") : null,
  };
  return getStatus();
}
