export type ConfidenceTier = "high" | "medium" | "low";

export const METRICS = ["cost", "commits", "sessions"] as const;
export type Metric = (typeof METRICS)[number];

export const CLAUDE_CO_AUTHOR_RE = /co-authored-by:[^\n]*?([^<\n]+)<([^>]+)>/gi;

export function hasClaudeCoAuthor(message: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  if (!lower.includes("co-authored-by")) return false;
  return /co-authored-by:[^\n]*(claude|anthropic)/i.test(message);
}

// Prevent a leaked token (ghp_…, github_pat_…) from reaching error fields,
// SSE payloads, or any response body surfaced on /api/sync/status.
const SECRET_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /gho_[A-Za-z0-9]{36,}/g,
  /ghu_[A-Za-z0-9]{36,}/g,
  /ghs_[A-Za-z0-9]{36,}/g,
  /ghr_[A-Za-z0-9]{36,}/g,
];

export function scrubSecrets(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

export interface SessionSummary {
  id: string;
  projectPath: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  primaryModel: string | null;
  gitBranch: string | null;
}

export interface RepoSummary {
  id: number;
  localPath: string;
  githubOwner: string | null;
  githubName: string | null;
  defaultBranch: string | null;
  commitCount: number;
  totalLoc: number;
  aiAssistedCount: number;
  avgCostPerCommit: number | null;
}
