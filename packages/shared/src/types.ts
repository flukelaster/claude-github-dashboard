export type ConfidenceTier = "high" | "medium" | "low";

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
