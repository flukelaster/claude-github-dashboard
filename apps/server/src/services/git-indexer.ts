import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { subDays } from "date-fns";
import { eq, sql } from "drizzle-orm";
import simpleGit, { type SimpleGit } from "simple-git";
import { hasClaudeCoAuthor } from "@cgd/shared";
import { db } from "../db/client.js";
import { commits, repos } from "../db/schema.js";

export interface GitIndexStats {
  reposDiscovered: number;
  reposIndexed: number;
  commitsIngested: number;
  durationMs: number;
}

function resolveGitRoot(path: string): string | null {
  if (!path) return null;
  if (!existsSync(path)) return null;
  let cur = resolve(path);
  while (true) {
    const gitDir = resolve(cur, ".git");
    if (existsSync(gitDir)) {
      const s = statSync(gitDir);
      if (s.isDirectory() || s.isFile()) return cur;
    }
    const parent = resolve(cur, "..");
    if (parent === cur) return null;
    cur = parent;
  }
}

async function discoverRepos(): Promise<string[]> {
  // Pull all cwd from sessions, dedupe, resolve to git root
  const rows = db.all<{ project_path: string }>(
    sql`SELECT DISTINCT project_path FROM sessions WHERE project_path IS NOT NULL AND project_path != ''`
  );
  const roots = new Set<string>();
  for (const r of rows) {
    const root = resolveGitRoot(r.project_path);
    if (root) roots.add(root);
  }
  return [...roots];
}

async function upsertRepo(localPath: string): Promise<number> {
  const existing = await db.select().from(repos).where(eq(repos.localPath, localPath)).get();
  if (existing) return existing.id;
  const git = simpleGit(localPath);
  let defaultBranch: string | null = null;
  let owner: string | null = null;
  let name: string | null = null;
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    const url = origin?.refs.fetch ?? origin?.refs.push ?? "";
    const parsed = parseGithubUrl(url);
    if (parsed) {
      owner = parsed.owner;
      name = parsed.name;
    }
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    defaultBranch = branch.trim() || null;
  } catch {
    // noop
  }
  const inserted = await db
    .insert(repos)
    .values({ localPath, githubOwner: owner, githubName: name, defaultBranch, lastSyncedAt: null })
    .returning({ id: repos.id });
  return inserted[0]!.id;
}

function parseGithubUrl(url: string): { owner: string; name: string } | null {
  if (!url) return null;
  const m =
    /github\.com[/:]([^/]+)\/([^/.\s]+)(?:\.git)?$/.exec(url) ??
    /github\.com[/:]([^/]+)\/([^/.\s]+)/.exec(url);
  if (!m || !m[1] || !m[2]) return null;
  return { owner: m[1], name: m[2].replace(/\.git$/, "") };
}

async function indexRepoCommits(
  repoId: number,
  localPath: string,
  sinceDays: number
): Promise<number> {
  const git: SimpleGit = simpleGit(localPath);
  const since = subDays(new Date(), sinceDays).toISOString();

  // Use `git log` with numstat for additions/deletions
  // Format: SHA|author|email|authoredISO|committer|cemail|committedISO|subject
  // Then numstat lines follow until next commit
  let raw: string;
  try {
    raw = await git.raw([
      "log",
      `--since=${since}`,
      "--numstat",
      "--pretty=format:__COMMIT__%H|%an|%ae|%aI|%cn|%ce|%cI|%D|%B%n__END__",
      "--no-merges",
    ]);
  } catch {
    return 0;
  }
  if (!raw.trim()) return 0;

  const blocks = raw.split("__COMMIT__").filter((b) => b.trim());
  let count = 0;
  for (const block of blocks) {
    const endIdx = block.indexOf("__END__");
    if (endIdx === -1) continue;
    const header = block.substring(0, endIdx);
    const rest = block.substring(endIdx + "__END__".length).trim();

    const firstNewline = header.indexOf("\n");
    const metaLine = firstNewline === -1 ? header : header.substring(0, firstNewline);
    const messageBody = firstNewline === -1 ? "" : header.substring(firstNewline + 1);

    const parts = metaLine.split("|");
    if (parts.length < 8) continue;
    const [sha, an, ae, aI, cn, ce, cI, refs] = parts;
    const subject = parts.slice(8).join("|");
    if (!sha) continue;
    const message = `${subject}\n${messageBody}`.trim();

    let additions = 0;
    let deletions = 0;
    const files: string[] = [];
    for (const line of rest.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      const m = /^(\d+|-)\s+(\d+|-)\s+(.+)$/.exec(s);
      if (!m) continue;
      const add = m[1] === "-" ? 0 : Number(m[1]);
      const del = m[2] === "-" ? 0 : Number(m[2]);
      additions += add;
      deletions += del;
      if (m[3]) files.push(m[3]);
    }

    const coClaude = hasClaudeCoAuthor(message);
    const branch = refs && refs.trim() ? refs.trim().split(",")[0]?.trim() ?? null : null;

    await db
      .insert(commits)
      .values({
        sha,
        repoId,
        authorName: an ?? null,
        authorEmail: ae ?? null,
        authoredAt: aI ?? new Date().toISOString(),
        committerEmail: ce ?? null,
        committedAt: cI ?? aI ?? new Date().toISOString(),
        message,
        additions,
        deletions,
        filesChangedJson: JSON.stringify(files),
        coAuthoredClaude: coClaude,
        isAiAssisted: coClaude, // correlation engine refines this later
        branch,
      })
      .onConflictDoUpdate({
        target: [commits.repoId, commits.sha],
        set: {
          message,
          additions,
          deletions,
          filesChangedJson: JSON.stringify(files),
          coAuthoredClaude: coClaude,
        },
      });
    count++;
  }

  await db
    .update(repos)
    .set({ lastSyncedAt: new Date().toISOString() })
    .where(eq(repos.id, repoId));

  return count;
}

export async function syncGit(opts: { sinceDays?: number; skipCommits?: boolean } = {}): Promise<GitIndexStats> {
  const t0 = Date.now();
  const sinceDays = opts.sinceDays ?? 90;
  const stats: GitIndexStats = {
    reposDiscovered: 0,
    reposIndexed: 0,
    commitsIngested: 0,
    durationMs: 0,
  };

  const roots = await discoverRepos();
  stats.reposDiscovered = roots.length;

  for (const root of roots) {
    const repoId = await upsertRepo(root);
    const existingRepo = await db.select().from(repos).where(eq(repos.id, repoId)).get();
    if (existingRepo?.optedOut) continue;
    // skipCommits applies only to repos that HAVE a GitHub remote (since GitHub will handle those).
    // Repos without a remote always fall back to local git for commit data.
    const shouldSkip = opts.skipCommits && !!existingRepo?.githubOwner && !!existingRepo?.githubName;
    if (!shouldSkip) {
      const c = await indexRepoCommits(repoId, root, sinceDays);
      stats.commitsIngested += c;
    }
    stats.reposIndexed++;
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}
