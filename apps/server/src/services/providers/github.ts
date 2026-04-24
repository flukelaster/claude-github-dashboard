import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
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
import { errMsg, isNotFound } from "./utils.js";

const TOKEN_KEY = "github_pat";

async function getToken(): Promise<string | null> {
  return getSecret(TOKEN_KEY);
}

function authedGraphql(token: string) {
  return graphql.defaults({ headers: { authorization: `Bearer ${token}` } });
}

// ─── Commit fetch (GraphQL, paginated) ────────────────────────────────────────
interface CommitNode {
  oid: string;
  messageHeadline: string;
  messageBody: string;
  additions: number;
  deletions: number;
  changedFilesIfAvailable: number | null;
  authoredDate: string;
  committedDate: string;
  author: { name: string | null; email: string | null; user: { login: string } | null } | null;
  committer: { email: string | null } | null;
}

interface CommitHistoryResponse {
  repository: {
    defaultBranchRef: {
      name: string;
      target: {
        history: {
          totalCount: number;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: CommitNode[];
        };
      };
    } | null;
  };
  rateLimit: { remaining: number; resetAt: string };
}

async function fetchCommits(
  owner: string,
  name: string,
  opts: { since: Date }
): Promise<FetchResult<ProviderCommit>> {
  const token = await getToken();
  if (!token) return { items: [], error: "no github token", notFound: false, rateLimitRemaining: null };
  const gh = authedGraphql(token);

  let cursor: string | null = null;
  let prevCursor: string | null = null;
  const collected: ProviderCommit[] = [];
  const sinceIso = opts.since.toISOString();
  let rateLimitRemaining: number | null = null;

  for (let page = 0; page < 50; page++) {
    try {
      const resp: CommitHistoryResponse = await gh<CommitHistoryResponse>(
        `query($owner:String!, $name:String!, $since:GitTimestamp!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            defaultBranchRef {
              name
              target {
                ... on Commit {
                  history(first:100, since:$since, after:$cursor) {
                    totalCount
                    pageInfo { hasNextPage endCursor }
                    nodes {
                      oid messageHeadline messageBody
                      additions deletions changedFilesIfAvailable
                      authoredDate committedDate
                      author { name email user { login } }
                      committer { email }
                    }
                  }
                }
              }
            }
          }
          rateLimit { remaining resetAt }
        }`,
        { owner, name, since: sinceIso, cursor }
      );
      rateLimitRemaining = resp.rateLimit.remaining;
      const history = resp.repository.defaultBranchRef?.target?.history;
      if (!history) {
        return {
          items: collected,
          error: "no defaultBranchRef",
          notFound: false,
          rateLimitRemaining,
        };
      }
      const branch = resp.repository.defaultBranchRef?.name ?? null;
      for (const node of history.nodes) {
        const rawMessage = `${node.messageHeadline}\n${node.messageBody ?? ""}`.trim();
        const message = rawMessage.length > 64 * 1024 ? rawMessage.slice(0, 64 * 1024) : rawMessage;
        collected.push({
          sha: node.oid,
          message,
          authorName: node.author?.name ?? null,
          authorEmail: node.author?.email ?? null,
          committerEmail: node.committer?.email ?? null,
          authoredAt: node.authoredDate,
          committedAt: node.committedDate,
          additions: node.additions,
          deletions: node.deletions,
          branch,
        });
      }
      if (!history.pageInfo.hasNextPage) break;
      const next = history.pageInfo.endCursor;
      if (next === prevCursor || next === cursor) {
        return { items: collected, error: "cursor stalled", notFound: false, rateLimitRemaining };
      }
      prevCursor = cursor;
      cursor = next;
      if (rateLimitRemaining != null && rateLimitRemaining < 50) {
        return {
          items: collected,
          error: "rate limit low — paused",
          notFound: false,
          rateLimitRemaining,
        };
      }
    } catch (e) {
      const msg = errMsg(e);
      return { items: collected, error: msg, notFound: isNotFound(msg), rateLimitRemaining };
    }
  }
  return { items: collected, error: null, notFound: false, rateLimitRemaining };
}

// ─── PR fetch (GraphQL) ───────────────────────────────────────────────────────
interface PRNode {
  number: number;
  title: string;
  state: string;
  author: { login: string } | null;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  reviews: { totalCount: number };
}
interface PRSearchResponse {
  repository: {
    defaultBranchRef: { name: string } | null;
    pullRequests: { nodes: PRNode[] };
  };
  rateLimit: { remaining: number; resetAt: string };
}

async function fetchPullRequests(
  owner: string,
  name: string,
  opts: { since: Date; limit?: number }
): Promise<FetchResult<ProviderPullRequest>> {
  const token = await getToken();
  if (!token) return { items: [], error: "no github token", notFound: false, rateLimitRemaining: null };
  const gh = authedGraphql(token);
  const limit = opts.limit ?? 50;

  try {
    const resp = await gh<PRSearchResponse>(
      `query($owner:String!, $name:String!, $limit:Int!) {
        repository(owner:$owner, name:$name) {
          defaultBranchRef { name }
          pullRequests(first:$limit, orderBy:{field:UPDATED_AT, direction:DESC}) {
            nodes {
              number title state
              author { login }
              createdAt mergedAt closedAt
              additions deletions
              reviews(first:1) { totalCount }
            }
          }
        }
        rateLimit { remaining resetAt }
      }`,
      { owner, name, limit }
    );
    const items: ProviderPullRequest[] = [];
    for (const pr of resp.repository.pullRequests.nodes) {
      if (new Date(pr.createdAt) < opts.since && !pr.mergedAt) continue;
      items.push({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        authorLogin: pr.author?.login ?? null,
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        closedAt: pr.closedAt,
        additions: pr.additions,
        deletions: pr.deletions,
        reviewCount: pr.reviews.totalCount,
      });
    }
    return { items, error: null, notFound: false, rateLimitRemaining: resp.rateLimit.remaining };
  } catch (e) {
    const msg = errMsg(e);
    return { items: [], error: msg, notFound: isNotFound(msg), rateLimitRemaining: null };
  }
}

// ─── Languages ────────────────────────────────────────────────────────────────
async function fetchLanguages(
  owner: string,
  name: string
): Promise<FetchResult<ProviderLanguage>> {
  const token = await getToken();
  if (!token) return { items: [], error: "no github token", notFound: false, rateLimitRemaining: null };
  const gh = authedGraphql(token);

  try {
    const resp = await gh<{
      repository: { languages: { edges: { size: number; node: { name: string; color: string | null } }[] } };
      rateLimit: { remaining: number };
    }>(
      `query($owner:String!, $name:String!) {
        repository(owner:$owner, name:$name) {
          languages(first:30, orderBy:{field:SIZE, direction:DESC}) {
            edges { size node { name color } }
          }
        }
        rateLimit { remaining }
      }`,
      { owner, name }
    );
    const items: ProviderLanguage[] = resp.repository.languages.edges.map((e) => ({
      name: e.node.name,
      bytes: e.size,
      color: e.node.color,
    }));
    return { items, error: null, notFound: false, rateLimitRemaining: resp.rateLimit.remaining };
  } catch (e) {
    const msg = errMsg(e);
    return { items: [], error: msg, notFound: isNotFound(msg), rateLimitRemaining: null };
  }
}

// ─── Test auth ────────────────────────────────────────────────────────────────
async function testAuth(): Promise<AuthResult> {
  const token = await getToken();
  if (!token) return { ok: false, error: "no token configured" };
  try {
    const octo = new Octokit({ auth: token });
    const me = await octo.rest.users.getAuthenticated();
    const rl = await octo.rest.rateLimit.get();
    return {
      ok: true,
      user: me.data.login,
      rateLimit: {
        limit: rl.data.resources.core.limit,
        remaining: rl.data.resources.core.remaining,
        resetAt: new Date(rl.data.resources.core.reset * 1000).toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

// ─── List accessible repos (for repo selection UI) ────────────────────────────
async function listAccessibleRepos(opts?: {
  search?: string;
  perPage?: number;
}): Promise<ProviderRepoInfo[]> {
  const token = await getToken();
  if (!token) return [];
  const octo = new Octokit({ auth: token });
  const perPage = Math.min(opts?.perPage ?? 100, 100);
  const out: ProviderRepoInfo[] = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const resp = await octo.rest.repos.listForAuthenticatedUser({
        per_page: perPage,
        page,
        sort: "updated",
        affiliation: "owner,collaborator,organization_member",
      });
      for (const r of resp.data) {
        if (opts?.search && !r.full_name.toLowerCase().includes(opts.search.toLowerCase())) continue;
        out.push({
          owner: r.owner.login,
          name: r.name,
          fullName: r.full_name,
          private: r.private,
          defaultBranch: r.default_branch ?? null,
          description: r.description ?? null,
          htmlUrl: r.html_url,
        });
      }
      if (resp.data.length < perPage) break;
    }
  } catch {
    // Return whatever was collected so far
  }
  return out;
}

// ─── URL parsing ──────────────────────────────────────────────────────────────
function parseUrl(url: string): { owner: string; name: string } | null {
  const clean = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  // HTTPS: https://github.com/owner/name
  const https = clean.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (https) return { owner: https[1]!, name: https[2]! };
  // SSH: git@github.com:owner/name
  const ssh = clean.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (ssh) return { owner: ssh[1]!, name: ssh[2]! };
  // owner/name shorthand
  const short = clean.match(/^([^/]+)\/([^/]+)$/);
  if (short) return { owner: short[1]!, name: short[2]! };
  return null;
}

// ─── Provider instance ────────────────────────────────────────────────────────
export const githubProvider: GitProvider = {
  name: "github",
  hasToken: async () => (await getToken()) != null,
  testAuth,
  fetchCommits,
  fetchPullRequests,
  fetchLanguages,
  listAccessibleRepos,
  parseUrl,
};
