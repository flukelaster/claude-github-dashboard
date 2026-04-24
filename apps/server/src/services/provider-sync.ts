import { and, eq } from "drizzle-orm";
import { subDays } from "date-fns";
import { hasClaudeCoAuthor, scrubSecrets } from "@cgd/shared";
import { db } from "../db/client.js";
import { commits, pullRequests, repoLanguages, repos } from "../db/schema.js";
import type { GitProvider } from "./providers/types.js";

export interface ProviderSyncStats {
  provider: string;
  reposSynced: number;
  prsUpserted: number;
  commitsUpserted: number;
  languagesUpserted: number;
  rateLimitRemaining: number | null;
  errors: string[];
  durationMs: number;
}

/**
 * Provider-agnostic sync: for every repo with a remote owner/name configured for this
 * provider, replace local commit data with remote data, upsert PRs/MRs, and refresh
 * language stats.
 *
 * Phase 1: only GitHub repos (provider col doesn't exist yet — all rows with
 * github_owner/github_name are implicitly GitHub). Phase 2 adds provider column.
 */
export async function syncProvider(
  provider: GitProvider,
  opts: { sinceDays?: number } = {}
): Promise<ProviderSyncStats> {
  const t0 = Date.now();
  const stats: ProviderSyncStats = {
    provider: provider.name,
    reposSynced: 0,
    prsUpserted: 0,
    commitsUpserted: 0,
    languagesUpserted: 0,
    rateLimitRemaining: null,
    errors: [],
    durationMs: 0,
  };

  if (!(await provider.hasToken())) {
    stats.errors.push(`no ${provider.name} token configured`);
    stats.durationMs = Date.now() - t0;
    return stats;
  }

  const since = subDays(new Date(), opts.sinceDays ?? 90);
  const allRepos = await db.select().from(repos).all();

  // Phase 1: GitHub is the only provider, matches any row with github_owner/github_name.
  // Phase 2: filter by repos.provider === provider.name and read remote_owner/remote_name.
  const eligible = allRepos.filter(
    (r) => provider.name === "github" && r.githubOwner && r.githubName && !r.optedOut
  );

  // Dedupe by remote full name — prefer the shortest local_path (canonical clone).
  const seen = new Map<string, (typeof eligible)[number]>();
  for (const r of eligible) {
    const key = `${r.githubOwner}/${r.githubName}`.toLowerCase();
    const prev = seen.get(key);
    if (!prev || r.localPath.length < prev.localPath.length) seen.set(key, r);
  }
  // Mark duplicates opted-out.
  for (const r of eligible) {
    const key = `${r.githubOwner}/${r.githubName}`.toLowerCase();
    const canonical = seen.get(key);
    if (canonical && canonical.id !== r.id) {
      await db.update(repos).set({ optedOut: true }).where(eq(repos.id, r.id));
    }
  }

  for (const r of seen.values()) {
    const owner = r.githubOwner!;
    const name = r.githubName!;
    const label = `${owner}/${name}`;

    // ── Commits ──
    const commitResult = await provider.fetchCommits(owner, name, { since });
    if (commitResult.rateLimitRemaining != null) stats.rateLimitRemaining = commitResult.rateLimitRemaining;
    if (commitResult.notFound) {
      stats.errors.push(
        `${label}: token cannot access (SSO / permissions / renamed) — keeping local git data`
      );
    } else {
      // Authoritative: wipe local commits for this repo, replace with remote data.
      await db.delete(commits).where(and(eq(commits.repoId, r.id))).execute();
      for (const c of commitResult.items) {
        const coClaude = hasClaudeCoAuthor(c.message);
        await db
          .insert(commits)
          .values({
            sha: c.sha,
            repoId: r.id,
            authorName: c.authorName,
            authorEmail: c.authorEmail,
            authoredAt: c.authoredAt,
            committerEmail: c.committerEmail,
            committedAt: c.committedAt,
            message: c.message,
            additions: c.additions,
            deletions: c.deletions,
            filesChangedJson: null,
            coAuthoredClaude: coClaude,
            isAiAssisted: coClaude,
            branch: c.branch,
          })
          .onConflictDoUpdate({
            target: [commits.repoId, commits.sha],
            set: {
              message: c.message,
              additions: c.additions,
              deletions: c.deletions,
              coAuthoredClaude: coClaude,
              authorName: c.authorName,
              authorEmail: c.authorEmail,
            },
          });
        stats.commitsUpserted++;
      }
      if (commitResult.error) {
        stats.errors.push(scrubSecrets(`${label} commits: ${commitResult.error}`));
      }
    }

    // ── Languages ──
    const langResult = await provider.fetchLanguages(owner, name);
    if (langResult.rateLimitRemaining != null) stats.rateLimitRemaining = langResult.rateLimitRemaining;
    if (!langResult.notFound && !langResult.error) {
      await db.delete(repoLanguages).where(eq(repoLanguages.repoId, r.id)).execute();
      for (const lang of langResult.items) {
        await db.insert(repoLanguages).values({
          repoId: r.id,
          language: lang.name,
          bytes: lang.bytes,
          color: lang.color,
        });
        stats.languagesUpserted++;
      }
    } else if (langResult.error && !langResult.notFound) {
      stats.errors.push(scrubSecrets(`${label} langs: ${langResult.error}`));
    }

    // ── Pull requests / Merge requests ──
    const prResult = await provider.fetchPullRequests(owner, name, { since });
    if (prResult.rateLimitRemaining != null) stats.rateLimitRemaining = prResult.rateLimitRemaining;
    if (!prResult.notFound) {
      for (const pr of prResult.items) {
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
            authorLogin: pr.authorLogin,
            createdAt: pr.createdAt,
            mergedAt: pr.mergedAt,
            closedAt: pr.closedAt,
            additions: pr.additions,
            deletions: pr.deletions,
            reviewCount: pr.reviewCount,
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
              reviewCount: pr.reviewCount,
              timeToMergeMinutes: tm,
            },
          });
        stats.prsUpserted++;
      }
    }
    if (prResult.error && !prResult.notFound) {
      stats.errors.push(scrubSecrets(`${label}: ${prResult.error}`));
    }

    await db.update(repos).set({ lastSyncedAt: new Date().toISOString() }).where(eq(repos.id, r.id));
    stats.reposSynced++;
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}
