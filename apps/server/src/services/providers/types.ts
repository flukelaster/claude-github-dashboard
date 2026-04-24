export type ProviderName = "github" | "gitlab";

export interface AuthResult {
  ok: boolean;
  user?: string;
  rateLimit?: { limit: number; remaining: number; resetAt: string };
  error?: string;
}

export interface ProviderCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  committerEmail: string | null;
  authoredAt: string;
  committedAt: string;
  additions: number;
  deletions: number;
  branch: string | null;
}

export interface ProviderPullRequest {
  number: number;
  title: string;
  state: string;
  authorLogin: string | null;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  reviewCount: number;
}

export interface ProviderLanguage {
  name: string;
  bytes: number;
  color: string | null;
}

export interface ProviderRepoInfo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  description: string | null;
  htmlUrl: string;
}

export interface FetchResult<T> {
  items: T[];
  error: string | null;
  notFound: boolean;
  rateLimitRemaining: number | null;
}

export interface GitProvider {
  readonly name: ProviderName;
  hasToken(): Promise<boolean>;
  testAuth(): Promise<AuthResult>;
  fetchCommits(
    owner: string,
    name: string,
    opts: { since: Date }
  ): Promise<FetchResult<ProviderCommit>>;
  fetchPullRequests(
    owner: string,
    name: string,
    opts: { since: Date; limit?: number }
  ): Promise<FetchResult<ProviderPullRequest>>;
  fetchLanguages(owner: string, name: string): Promise<FetchResult<ProviderLanguage>>;
  listAccessibleRepos(opts?: {
    search?: string;
    perPage?: number;
  }): Promise<ProviderRepoInfo[]>;
  parseUrl(url: string): { owner: string; name: string } | null;
}
