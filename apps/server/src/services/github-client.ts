import { graphql } from "@octokit/graphql";
import { and, eq } from "drizzle-orm";
import { subDays } from "date-fns";
import { hasClaudeCoAuthor, scrubSecrets } from "@cgd/shared";
import { db } from "../db/client.js";
import { commits, pullRequests, repoLanguages, repos } from "../db/schema.js";
import { getSecret } from "./keychain.js";

export interface GitHubSyncStats {
  reposSynced: number;
  prsUpserted: number;
  commitsUpserted: number;
  languagesUpserted: number;
  rateLimitRemaining: number | null;
  errors: string[];
  durationMs: number;
}


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

async function getToken(): Promise<string | null> {
  return getSecret("github_pat");
}

async function fetchCommitsForRepo(
  gh: typeof graphql,
  owner: string,
  name: string,
  since: Date,
  onRateLimit: (rem: number) => void
): Promise<{
  nodes: Array<CommitNode & { branch: string | null }>;
  error: string | null;
  notFound: boolean;
}> {
  let cursor: string | null = null;
  let prevCursor: string | null = null;
  const collected: Array<CommitNode & { branch: string | null }> = [];
  const sinceIso = since.toISOString();
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
      onRateLimit(resp.rateLimit.remaining);
      const history = resp.repository.defaultBranchRef?.target?.history;
      if (!history) return { nodes: collected, error: "no defaultBranchRef", notFound: false };

      const branch = resp.repository.defaultBranchRef?.name ?? null;
      for (const node of history.nodes) collected.push({ ...node, branch });

      if (!history.pageInfo.hasNextPage) break;
      const next = history.pageInfo.endCursor;
      if (next === prevCursor || next === cursor) {
        return { nodes: collected, error: "cursor stalled", notFound: false };
      }
      prevCursor = cursor;
      cursor = next;
      if (resp.rateLimit.remaining < 50) {
        return { nodes: collected, error: "rate limit low — paused", notFound: false };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const notFound = /Could not resolve to a Repository/i.test(msg) || /Not Found/i.test(msg);
      return { nodes: collected, error: msg, notFound };
    }
  }
  return { nodes: collected, error: null, notFound: false };
}

export async function syncGitHub(opts: { sinceDays?: number } = {}): Promise<GitHubSyncStats> {
  const t0 = Date.now();
  const stats: GitHubSyncStats = {
    reposSynced: 0,
    prsUpserted: 0,
    commitsUpserted: 0,
    languagesUpserted: 0,
    rateLimitRemaining: null,
    errors: [],
    durationMs: 0,
  };

  const token = await getToken();
  if (!token) {
    stats.errors.push("no github token configured");
    stats.durationMs = Date.now() - t0;
    return stats;
  }

  const gh = graphql.defaults({ headers: { authorization: `Bearer ${token}` } });
  const since = subDays(new Date(), opts.sinceDays ?? 90);

  const allRepos = await db
    .select()
    .from(repos)
    .all();

  // Dedupe repos that resolve to same GitHub owner/name (worktrees, clones, etc.).
  // Prefer the row whose local_path actually exists, then shortest path.
  const seenRemote = new Map<string, typeof allRepos[number]>();
  for (const r of allRepos) {
    if (!r.githubOwner || !r.githubName || r.optedOut) continue;
    const key = `${r.githubOwner}/${r.githubName}`.toLowerCase();
    const prev = seenRemote.get(key);
    if (!prev || r.localPath.length < prev.localPath.length) seenRemote.set(key, r);
  }
  // Mark duplicates opted-out so they stop appearing in analytics.
  for (const r of allRepos) {
    if (!r.githubOwner || !r.githubName) continue;
    const key = `${r.githubOwner}/${r.githubName}`.toLowerCase();
    const canonical = seenRemote.get(key);
    if (canonical && canonical.id !== r.id) {
      await db.update(repos).set({ optedOut: true }).where(eq(repos.id, r.id));
    }
  }

  for (const r of seenRemote.values()) {
    const cResult = await fetchCommitsForRepo(gh, r.githubOwner!, r.githubName!, since, (rem) => {
      stats.rateLimitRemaining = rem;
    });
    if (cResult.notFound) {
      stats.errors.push(
        `${r.githubOwner}/${r.githubName}: token cannot access (SSO / permissions / renamed) — keeping local git data`
      );
    } else {
      // Authoritative: wipe local commits for this repo and replace with GitHub data.
      await db
        .delete(commits)
        .where(and(eq(commits.repoId, r.id)))
        .execute();
      for (const node of cResult.nodes) {
        const rawMessage = `${node.messageHeadline}\n${node.messageBody ?? ""}`.trim();
        const message =
          rawMessage.length > 64 * 1024 ? rawMessage.slice(0, 64 * 1024) : rawMessage;
        const coClaude = hasClaudeCoAuthor(message);
        await db
          .insert(commits)
          .values({
            sha: node.oid,
            repoId: r.id,
            authorName: node.author?.name ?? null,
            authorEmail: node.author?.email ?? null,
            authoredAt: node.authoredDate,
            committerEmail: node.committer?.email ?? null,
            committedAt: node.committedDate,
            message,
            additions: node.additions,
            deletions: node.deletions,
            filesChangedJson: null,
            coAuthoredClaude: coClaude,
            isAiAssisted: coClaude,
            branch: node.branch,
          })
          .onConflictDoUpdate({
            target: [commits.repoId, commits.sha],
            set: {
              message,
              additions: node.additions,
              deletions: node.deletions,
              coAuthoredClaude: coClaude,
              authorName: node.author?.name ?? null,
              authorEmail: node.author?.email ?? null,
            },
          });
        stats.commitsUpserted++;
      }
      if (cResult.error) stats.errors.push(scrubSecrets(`${r.githubOwner}/${r.githubName} commits: ${cResult.error}`));
    }

    // Languages — lightweight single query, safe even if commits fetch failed.
    try {
      const langResp = await gh<{
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
        { owner: r.githubOwner!, name: r.githubName! }
      );
      stats.rateLimitRemaining = langResp.rateLimit.remaining;
      await db.delete(repoLanguages).where(eq(repoLanguages.repoId, r.id)).execute();
      for (const edge of langResp.repository.languages.edges) {
        await db.insert(repoLanguages).values({
          repoId: r.id,
          language: edge.node.name,
          bytes: edge.size,
          color: edge.node.color,
        });
        stats.languagesUpserted++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Could not resolve to a Repository/i.test(msg)) {
        stats.errors.push(scrubSecrets(`${r.githubOwner}/${r.githubName} langs: ${msg}`));
      }
    }

    try {
      const resp = await gh<PRSearchResponse>(
        `
        query($owner:String!, $name:String!) {
          repository(owner:$owner, name:$name) {
            defaultBranchRef { name }
            pullRequests(first:50, orderBy:{field:UPDATED_AT, direction:DESC}) {
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
        }
      `,
        { owner: r.githubOwner, name: r.githubName }
      );

      stats.rateLimitRemaining = resp.rateLimit.remaining;

      for (const pr of resp.repository.pullRequests.nodes) {
        if (new Date(pr.createdAt) < since && !pr.mergedAt) continue;
        const tm =
          pr.mergedAt && pr.createdAt
            ? Math.round((new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) / 60_000)
            : null;
        await db
          .insert(pullRequests)
          .values({
            repoId: r.id,
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
            timeToMergeMinutes: tm,
          })
          .onConflictDoUpdate({
            target: [pullRequests.repoId, pullRequests.number],
            set: {
              title: pr.title,
              state: pr.state,
              mergedAt: pr.mergedAt,
              closedAt: pr.closedAt,
              additions: pr.additions,
              deletions: pr.deletions,
              reviewCount: pr.reviews.totalCount,
              timeToMergeMinutes: tm,
            },
          });
        stats.prsUpserted++;
      }

      await db.update(repos).set({ lastSyncedAt: new Date().toISOString() }).where(eq(repos.id, r.id));
      stats.reposSynced++;
    } catch (e) {
      stats.errors.push(scrubSecrets(`${r.githubOwner}/${r.githubName}: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}

export async function hasGitHubToken(): Promise<boolean> {
  return (await getToken()) != null;
}
