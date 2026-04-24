import { Gitlab } from "@gitbeaker/rest";
import { getSecret } from "../keychain.js";
import type {
  AuthResult,
  FetchResult,
  GitProvider,
  ProviderCommit,
  ProviderLanguage,
  ProviderPullRequest,
  ProviderRepoInfo,
} from "./types.js";

const TOKEN_KEY = "gitlab_pat";
const DEFAULT_HOST = "https://gitlab.com";

async function getToken(): Promise<string | null> {
  return getSecret(TOKEN_KEY);
}

async function getClient(): Promise<InstanceType<typeof Gitlab> | null> {
  const token = await getToken();
  if (!token) return null;
  return new Gitlab({ host: DEFAULT_HOST, token });
}

// GitLab projects are referenced by either numeric id or URL-encoded full path
// (e.g. "group/subgroup/project"). Gitbeaker accepts either. We pass the full
// path as-is; the client handles encoding.
function projectPath(owner: string, name: string): string {
  return `${owner}/${name}`;
}

function notFoundFromError(msg: string): boolean {
  return /404|Not Found|does not exist/i.test(msg);
}

// ─── testAuth ─────────────────────────────────────────────────────────────────
async function testAuth(): Promise<AuthResult> {
  const client = await getClient();
  if (!client) return { ok: false, error: "no token configured" };
  try {
    const me = await client.Users.showCurrentUser();
    return {
      ok: true,
      user: me.username,
      // GitLab doesn't expose a uniform rate-limit header on all endpoints; omit
      // for now. The public gitlab.com limit is 2,000 req/min/user — generous.
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── fetchCommits ─────────────────────────────────────────────────────────────
async function fetchCommits(
  owner: string,
  name: string,
  opts: { since: Date }
): Promise<FetchResult<ProviderCommit>> {
  const client = await getClient();
  if (!client) return { items: [], error: "no gitlab token", notFound: false, rateLimitRemaining: null };

  const path = projectPath(owner, name);
  try {
    // withStats=true returns additions/deletions per commit. all() paginates
    // automatically up to maxPages; cap at 1000 commits (10 pages × 100).
    const rows = await client.Commits.all(path, {
      since: opts.since.toISOString(),
      withStats: true,
      perPage: 100,
      maxPages: 10,
      refName: undefined,
    });

    // Determine default branch to tag commits with.
    let defaultBranch: string | null = null;
    try {
      const proj = await client.Projects.show(path);
      defaultBranch = (proj.default_branch as string | null) ?? null;
    } catch {
      // non-fatal
    }

    const items: ProviderCommit[] = rows.map((c) => {
      const stats = (c as unknown as { stats?: { additions: number; deletions: number } }).stats;
      const rawMessage = (c.message ?? c.title ?? "").toString();
      const message = rawMessage.length > 64 * 1024 ? rawMessage.slice(0, 64 * 1024) : rawMessage;
      return {
        sha: c.id,
        message,
        authorName: (c.author_name as string | null) ?? null,
        authorEmail: (c.author_email as string | null) ?? null,
        committerEmail: (c.committer_email as string | null) ?? null,
        authoredAt: c.authored_date as string,
        committedAt: c.committed_date as string,
        additions: stats?.additions ?? 0,
        deletions: stats?.deletions ?? 0,
        branch: defaultBranch,
      };
    });
    return { items, error: null, notFound: false, rateLimitRemaining: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], error: msg, notFound: notFoundFromError(msg), rateLimitRemaining: null };
  }
}

// ─── fetchPullRequests (Merge Requests) ───────────────────────────────────────
async function fetchPullRequests(
  owner: string,
  name: string,
  opts: { since: Date; limit?: number }
): Promise<FetchResult<ProviderPullRequest>> {
  const client = await getClient();
  if (!client) return { items: [], error: "no gitlab token", notFound: false, rateLimitRemaining: null };

  const path = projectPath(owner, name);
  const limit = opts.limit ?? 50;
  try {
    const rows = await client.MergeRequests.all({
      projectId: path,
      perPage: limit,
      maxPages: 1,
      orderBy: "updated_at",
      sort: "desc",
    });
    const items: ProviderPullRequest[] = [];
    for (const mr of rows) {
      const createdAt = mr.created_at as string;
      const mergedAt = (mr.merged_at as string | null) ?? null;
      if (new Date(createdAt) < opts.since && !mergedAt) continue;
      // Normalize state: GitLab returns "opened"/"closed"/"merged".
      const state = (mr.state as string).toLowerCase() === "opened" ? "open" : (mr.state as string).toLowerCase();
      items.push({
        number: mr.iid as number,
        title: (mr.title as string) ?? "",
        state,
        authorLogin: (mr.author as { username?: string } | null)?.username ?? null,
        createdAt,
        mergedAt,
        closedAt: (mr.closed_at as string | null) ?? null,
        // REST list endpoint omits diff stats; fetching per-MR stats is N+1.
        // Skip for now; dashboard falls back to local git data for LOC counts.
        additions: 0,
        deletions: 0,
        reviewCount: 0,
      });
      if (items.length >= limit) break;
    }
    return { items, error: null, notFound: false, rateLimitRemaining: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], error: msg, notFound: notFoundFromError(msg), rateLimitRemaining: null };
  }
}

// ─── fetchLanguages ───────────────────────────────────────────────────────────
async function fetchLanguages(
  owner: string,
  name: string
): Promise<FetchResult<ProviderLanguage>> {
  const client = await getClient();
  if (!client) return { items: [], error: "no gitlab token", notFound: false, rateLimitRemaining: null };

  const path = projectPath(owner, name);
  try {
    // Returns Record<string, number> where number is percentage of total (0-100).
    // No absolute byte counts in the GitLab API, so we synthesize a pseudo-byte
    // count by scaling percentages × 1,000,000 to feed the same UI pipeline.
    const langs = (await client.Projects.showLanguages(path)) as Record<string, number>;
    const items: ProviderLanguage[] = Object.entries(langs).map(([lang, pct]) => ({
      name: lang,
      bytes: Math.round(pct * 10_000), // pct × 10k keeps relative proportions
      color: null, // GitLab API omits colors; UI falls back to dot icon
    }));
    return { items, error: null, notFound: false, rateLimitRemaining: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], error: msg, notFound: notFoundFromError(msg), rateLimitRemaining: null };
  }
}

// ─── listAccessibleRepos ──────────────────────────────────────────────────────
async function listAccessibleRepos(opts?: {
  search?: string;
  perPage?: number;
}): Promise<ProviderRepoInfo[]> {
  const client = await getClient();
  if (!client) return [];
  const perPage = Math.min(opts?.perPage ?? 100, 100);
  try {
    const rows = await client.Projects.all({
      membership: true,
      simple: false,
      perPage,
      maxPages: 10,
      orderBy: "last_activity_at",
      sort: "desc",
      search: opts?.search,
    });
    const out: ProviderRepoInfo[] = [];
    for (const p of rows) {
      // path_with_namespace: "group/subgroup/project"
      const fullName = p.path_with_namespace as string;
      const lastSlash = fullName.lastIndexOf("/");
      const owner = lastSlash >= 0 ? fullName.slice(0, lastSlash) : "";
      const name = lastSlash >= 0 ? fullName.slice(lastSlash + 1) : fullName;
      out.push({
        owner,
        name,
        fullName,
        private: (p.visibility as string) !== "public",
        defaultBranch: (p.default_branch as string | null) ?? null,
        description: (p.description as string | null) ?? null,
        htmlUrl: p.web_url as string,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ─── parseUrl ─────────────────────────────────────────────────────────────────
// gitlab.com/group/subgroup/project → owner="group/subgroup", name="project"
// gitlab.com/group/project          → owner="group",          name="project"
function parseUrl(url: string): { owner: string; name: string } | null {
  let clean = url.trim();
  clean = clean.replace(/\.git$/, "").replace(/\/$/, "");
  // Strip GitLab trailing segments like "/-/tree/main" or "/-/issues"
  clean = clean.replace(/\/-\/.*$/, "");

  // HTTPS: https://gitlab.com/a/b[/c...]
  const https = clean.match(/^https?:\/\/([^/]*gitlab[^/]*)\/(.+)$/i);
  if (https) {
    const path = https[2]!;
    return splitPath(path);
  }

  // SSH: git@gitlab.com:group/project or git@gitlab.com:group/subgroup/project
  const ssh = clean.match(/^git@([^:]*gitlab[^:]*):(.+)$/i);
  if (ssh) {
    return splitPath(ssh[2]!);
  }

  // Shorthand: group/subgroup/project
  if (clean.includes("/")) return splitPath(clean);

  return null;
}

function splitPath(path: string): { owner: string; name: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const name = parts[parts.length - 1]!;
  const owner = parts.slice(0, -1).join("/");
  return { owner, name };
}

// ─── Provider instance ────────────────────────────────────────────────────────
export const gitlabProvider: GitProvider = {
  name: "gitlab",
  hasToken: async () => (await getToken()) != null,
  testAuth,
  fetchCommits,
  fetchPullRequests,
  fetchLanguages,
  listAccessibleRepos,
  parseUrl,
};
