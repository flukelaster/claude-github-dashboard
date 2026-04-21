import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { commits, repos, sessionCommitLinks } from "../db/schema.js";

export interface CorrelationStats {
  commitsProcessed: number;
  linksCreated: number;
  aiAssistedMarked: number;
  durationMs: number;
}

const CONFIDENCE_HIGH = 70;
const CONFIDENCE_MEDIUM = 40;
const SCORE_THRESHOLD = CONFIDENCE_MEDIUM;

interface SessionRow {
  id: string;
  projectPath: string;
  startedAt: string;
  endedAtMs: number;
  gitBranch: string | null;
  editedFiles: Set<string>;
  editedBasenames: Set<string>;
}

function timeProximityScore(sessionLastMs: number, commitMs: number): number {
  const diffMin = Math.abs(commitMs - sessionLastMs) / 60_000;
  if (diffMin <= 10) return 15;
  if (diffMin <= 30) return 10;
  if (diffMin <= 60) return 6;
  if (diffMin <= 180) return 3;
  return 0;
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx === -1 ? p : p.slice(idx + 1);
}

function fileOverlapRatio(session: SessionRow, commitFiles: string[]): number {
  if (commitFiles.length === 0 || session.editedFiles.size === 0) return 0;
  let hits = 0;
  for (const f of commitFiles) {
    if (session.editedFiles.has(f)) {
      hits++;
      continue;
    }
    const base = basename(f);
    if (base && session.editedBasenames.has(base)) hits++;
  }
  return hits / commitFiles.length;
}

export async function correlate(): Promise<CorrelationStats> {
  const t0 = Date.now();
  const stats: CorrelationStats = {
    commitsProcessed: 0,
    linksCreated: 0,
    aiAssistedMarked: 0,
    durationMs: 0,
  };

  const sessionRows = db.all<{
    id: string;
    project_path: string;
    started_at: string;
    ended_at: string;
    git_branch: string | null;
  }>(sql`
    SELECT id, project_path, started_at, ended_at, git_branch
    FROM sessions
    WHERE project_path IS NOT NULL AND project_path != ''
  `);

  const messageFiles = db.all<{ session_id: string; files_touched_json: string }>(sql`
    SELECT session_id, files_touched_json
    FROM messages
    WHERE files_touched_json IS NOT NULL
  `);
  const filesBySession = new Map<string, { paths: Set<string>; basenames: Set<string> }>();
  for (const row of messageFiles) {
    try {
      const arr = JSON.parse(row.files_touched_json) as string[];
      let entry = filesBySession.get(row.session_id);
      if (!entry) {
        entry = { paths: new Set(), basenames: new Set() };
        filesBySession.set(row.session_id, entry);
      }
      for (const f of arr) {
        entry.paths.add(f);
        const b = basename(f);
        if (b) entry.basenames.add(b);
      }
    } catch {
      // skip
    }
  }

  const sessions: SessionRow[] = sessionRows.map((s) => {
    const files = filesBySession.get(s.id);
    return {
      id: s.id,
      projectPath: s.project_path,
      startedAt: s.started_at,
      endedAtMs: new Date(s.ended_at).getTime(),
      gitBranch: s.git_branch,
      editedFiles: files?.paths ?? new Set(),
      editedBasenames: files?.basenames ?? new Set(),
    };
  });

  const linkBatch: (typeof sessionCommitLinks.$inferInsert)[] = [];
  const aiAssistedShasByRepo = new Map<number, string[]>();
  const BATCH = 500;

  async function flushLinks() {
    if (linkBatch.length === 0) return;
    await db
      .insert(sessionCommitLinks)
      .values(linkBatch)
      .onConflictDoUpdate({
        target: [
          sessionCommitLinks.sessionId,
          sessionCommitLinks.repoId,
          sessionCommitLinks.commitSha,
        ],
        set: {
          score: sql`excluded.score`,
          confidence: sql`excluded.confidence`,
          attributionRatio: sql`excluded.attribution_ratio`,
          reasonJson: sql`excluded.reason_json`,
        },
      });
    stats.linksCreated += linkBatch.length;
    linkBatch.length = 0;
  }

  const repoRows = await db.select().from(repos).all();
  for (const r of repoRows) {
    const repoSessions = sessions.filter((s) =>
      s.projectPath && s.projectPath.startsWith(r.localPath)
    );
    if (repoSessions.length === 0) continue;

    const repoCommits = await db
      .select()
      .from(commits)
      .where(eq(commits.repoId, r.id))
      .all();

    const aiShas: string[] = [];

    for (const cmt of repoCommits) {
      stats.commitsProcessed++;
      const commitMs = new Date(cmt.committedAt).getTime();
      const windowStart = commitMs - 2 * 3600_000;
      const candidates = repoSessions.filter(
        (s) =>
          new Date(s.startedAt).getTime() <= commitMs && s.endedAtMs >= windowStart
      );
      if (candidates.length === 0) {
        if (cmt.coAuthoredClaude) aiShas.push(cmt.sha);
        continue;
      }

      let filesChanged: string[] = [];
      try {
        filesChanged = cmt.filesChangedJson
          ? (JSON.parse(cmt.filesChangedJson) as string[])
          : [];
      } catch {
        filesChanged = [];
      }

      let bestLinked = false;

      for (const s of candidates) {
        const reasons: Record<string, number> = {};
        let score = 0;

        if (cmt.coAuthoredClaude) {
          score += 50;
          reasons.coAuthor = 50;
        }
        const overlap = fileOverlapRatio(s, filesChanged);
        if (overlap >= 0.5) {
          score += 30;
          reasons.fileOverlap = 30;
        } else if (overlap >= 0.2) {
          score += 15;
          reasons.partialFileOverlap = 15;
        }
        const tp = timeProximityScore(s.endedAtMs, commitMs);
        if (tp > 0) {
          score += tp;
          reasons.timeProximity = tp;
        }
        if (s.gitBranch && cmt.branch && s.gitBranch === cmt.branch) {
          score += 5;
          reasons.branchMatch = 5;
        }

        if (score < SCORE_THRESHOLD) continue;

        const confidence = score >= CONFIDENCE_HIGH ? "high" : "medium";
        const attribution = Math.min(1, overlap > 0 ? overlap : 0.5);

        linkBatch.push({
          sessionId: s.id,
          repoId: r.id,
          commitSha: cmt.sha,
          score,
          confidence,
          attributionRatio: attribution,
          reasonJson: JSON.stringify(reasons),
        });
        if (linkBatch.length >= BATCH) await flushLinks();

        bestLinked =
          bestLinked ||
          confidence === "high" ||
          (confidence === "medium" && overlap >= 0.5);
      }

      if (bestLinked || cmt.coAuthoredClaude) aiShas.push(cmt.sha);
    }

    if (aiShas.length) aiAssistedShasByRepo.set(r.id, aiShas);
  }

  await flushLinks();

  for (const [repoId, shas] of aiAssistedShasByRepo) {
    for (let i = 0; i < shas.length; i += BATCH) {
      const chunk = shas.slice(i, i + BATCH);
      await db
        .update(commits)
        .set({ isAiAssisted: true })
        .where(and(eq(commits.repoId, repoId), sql`${commits.sha} IN ${chunk}`));
      stats.aiAssistedMarked += chunk.length;
    }
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}
