import type {
  DailyBucket,
  ForecastResponse,
  HeatmapCell,
  OverviewResponse,
  SyncStatus,
} from "@cgd/shared";

const BASE = "/api";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "POST" || method === "DELETE") headers["X-CGD-Local"] = "1";
  const r = await fetch(BASE + path, { ...init, headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

export const api = {
  overview: (range: string) => j<OverviewResponse>(`/overview?range=${range}`),
  usageDaily: (range: string) => j<DailyBucket[]>(`/usage/daily?range=${range}`),
  heatmap: (range: string, metric: "cost" | "commits" | "sessions") =>
    j<HeatmapCell[]>(`/heatmap?range=${range}&metric=${metric}`),
  forecast: (range: string) => j<ForecastResponse>(`/forecast?range=${range}`),
  sessions: (limit = 50, offset = 0) =>
    j<
      {
        id: string;
        projectPath: string;
        startedAt: string;
        endedAt: string;
        costUsd: number;
        messageCount: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        primaryModel: string | null;
        gitBranch: string | null;
      }[]
    >(`/sessions?limit=${limit}&offset=${offset}`),
  repos: () =>
    j<
      {
        id: number;
        localPath: string;
        githubOwner: string | null;
        githubName: string | null;
        defaultBranch: string | null;
        commitCount: number;
        totalLoc: number;
        additions: number;
        deletions: number;
        netLoc: number;
        aiAssistedCount: number;
        aiAdditions: number;
        aiDeletions: number;
        lastSyncedAt: string | null;
      }[]
    >(`/repos`),
  productivity: (range: string) =>
    j<{
      rangeDays: number;
      totalCost: number;
      totalLoc: number;
      locPerDollar: number | null;
      daily: { date: string; costUsd: number; loc: number; locPerDollar: number | null }[];
    }>(`/productivity?range=${range}`),
  repoDetail: (id: number, range: string) =>
    j<{
      repo: {
        id: number;
        localPath: string;
        githubOwner: string | null;
        githubName: string | null;
        lastSyncedAt: string | null;
        totals: { additions: number; deletions: number; netLoc: number; commitCount: number };
        windowTotals: {
          additions: number;
          deletions: number;
          netLoc: number;
          commitCount: number;
          aiAdditions: number;
          aiDeletions: number;
          aiCommitCount: number;
        };
      };
      commits: {
        sha: string;
        authoredAt: string;
        message: string | null;
        authorName: string | null;
        additions: number;
        deletions: number;
        isAiAssisted: boolean;
        coAuthoredClaude: boolean;
        linkedSessions: { sessionId: string; score: number; confidence: string }[];
      }[];
      prs: {
        number: number;
        title: string | null;
        state: string | null;
        authorLogin: string | null;
        createdAt: string | null;
        mergedAt: string | null;
        additions: number;
        deletions: number;
        reviewCount: number;
        timeToMergeMinutes: number | null;
      }[];
    }>(`/repos/${id}?range=${range}`),
  githubStatus: () => j<{ hasToken: boolean }>(`/github/status`),
  locDaily: (range: string) =>
    j<
      {
        date: string;
        additions: number;
        deletions: number;
        net: number;
        aiAdditions: number;
        aiDeletions: number;
        commitCount: number;
      }[]
    >(`/loc/daily?range=${range}`),
  languages: () =>
    j<{
      totalBytes: number;
      totalLoc: number;
      languages: {
        language: string;
        color: string | null;
        bytes: number;
        loc: number;
        ratio: number;
        locRatio: number;
        perRepo: { repoId: number; localPath: string; bytes: number; loc: number }[];
      }[];
      byRepo: {
        repoId: number;
        localPath: string;
        githubOwner: string | null;
        githubName: string | null;
        totalBytes: number;
        totalLoc: number;
        languages: {
          language: string;
          color: string | null;
          bytes: number;
          loc: number;
          ratio: number;
          locRatio: number;
        }[];
      }[];
    }>(`/languages`),
  getGithubToken: () =>
    j<{ hasToken: boolean; preview: string | null; backend: "keytar" | "memory" }>(
      `/settings/github/token`
    ),
  setGithubToken: (token: string) =>
    j<{ ok: boolean }>(`/settings/github/token`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  deleteGithubToken: () => j<{ ok: boolean }>(`/settings/github/token`, { method: "DELETE" }),
  testGithubConnection: () =>
    j<{
      ok: boolean;
      login?: string;
      name?: string | null;
      avatarUrl?: string;
      profileUrl?: string;
      rateLimit?: { remaining: number; limit: number; resetAt: string };
      error?: string;
    }>(`/settings/github/test`),
  sync: () => j<{ started: boolean; status: SyncStatus }>(`/sync`, { method: "POST" }),
  syncStatus: () => j<SyncStatus>(`/sync/status`),
};

export function fmtUsd(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtNum(n: number, digits = 0): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtCompact(n: number): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

export function fmtPct(n: number, digits = 1): string {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
