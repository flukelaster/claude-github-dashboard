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
 * language stats. Skips repos with sync_enabled=0 or opted_out=1.
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

  const eligible = allRepos.filter(
    (r) =>
      r.provider === provider.name &&
      r.remoteOwner &&
      r.remoteName &&
      !r.optedOut &&
      r.syncEnabled
  );

  // Dedupe by remote full name — prefer the shortest local_path (canonical clone).
  // Single pass: track the canonical row per key, push losers into a dup list.
  const seen = new Map<string, (typeof eligible)[number]>();
  const dupIds: number[] = [];
  for (const r of eligible) {
    const key = `${r.remoteOwner}/${r.remoteName}`.toLowerCase();
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, r);
    } else if (r.localPath.length < prev.localPath.length) {
      dupIds.push(prev.id);
      seen.set(key, r);
    } else {
      dupIds.push(r.id);
    }
  }
  await Promise.all(
    dupIds.map((id) => db.update(repos).set({ optedOut: true }).where(eq(repos.id, id)))
  );

  for (const r of seen.values()) {
    const owner = r.remoteOwner!;
    const name = r.remoteName!;
    const label = `${owner}/${name}`;

    // Commits, languages, and PRs/MRs are independent remote calls — fetch in parallel.
    const [commitResult, langResult, prResult] = await Promise.all([
      provider.fetchCommits(owner, name, { since }),
      provider.fetchLanguages(owner, name),
      provider.fetchPullRequests(owner, name, { since }),
    ]);
    for (const rl of [commitResult, langResult, prResult]) {
      if (rl.rateLimitRemaining != null) stats.rateLimitRemaining = rl.rateLimitRemaining;
    }

    // ── Commits ──
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
