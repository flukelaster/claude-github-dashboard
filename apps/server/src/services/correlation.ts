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

interface SessionCandidate {
  id: string;
  projectPath: string;
  startedAt: string;
  endedAt: string;
  gitBranch: string | null;
  editedFiles: Set<string>;
}

function timeProximityScore(sessionLastMs: number, commitMs: number): number {
  const diffMin = Math.abs(commitMs - sessionLastMs) / 60_000;
  if (diffMin <= 10) return 15;
  if (diffMin <= 30) return 10;
  if (diffMin <= 60) return 6;
  if (diffMin <= 180) return 3;
  return 0;
}

function fileOverlapRatio(sessionFiles: Set<string>, commitFiles: string[]): number {
  if (commitFiles.length === 0 || sessionFiles.size === 0) return 0;
  let hits = 0;
  for (const f of commitFiles) {
    if (sessionFiles.has(f)) hits++;
    else {
      // match by basename fallback
      const base = f.split(/[\\/]+/).pop();
      if (base) {
        for (const s of sessionFiles) {
          if (s.endsWith("/" + base) || s.endsWith("\\" + base) || s === base) {
            hits++;
            break;
          }
        }
      }
    }
  }
  return hits / commitFiles.length;
}

async function loadSessionCandidates(
  repoPath: string,
  commitIso: string
): Promise<SessionCandidate[]> {
  // Session must: cwd matches repo path, startedAt <= commit, endedAt >= commit - 2h
  const commitMs = new Date(commitIso).getTime();
  const windowStart = new Date(commitMs - 2 * 3600_000).toISOString();
  const candidates = db.all<{
    id: string;
    project_path: string;
    started_at: string;
    ended_at: string;
    git_branch: string | null;
  }>(sql`
    SELECT id, project_path, started_at, ended_at, git_branch
    FROM sessions
    WHERE project_path LIKE ${repoPath + "%"}
      AND started_at <= ${commitIso}
      AND ended_at >= ${windowStart}
  `);

  const result: SessionCandidate[] = [];
  for (const c of candidates) {
    const files = new Set<string>();
    const msgRows = db.all<{ files_touched_json: string | null }>(sql`
      SELECT files_touched_json FROM messages WHERE session_id = ${c.id} AND files_touched_json IS NOT NULL
    `);
    for (const m of msgRows) {
      if (!m.files_touched_json) continue;
      try {
        const arr = JSON.parse(m.files_touched_json) as string[];
        for (const f of arr) files.add(f);
      } catch {
        // skip
      }
    }
    result.push({
      id: c.id,
      projectPath: c.project_path,
      startedAt: c.started_at,
      endedAt: c.ended_at,
      gitBranch: c.git_branch,
      editedFiles: files,
    });
  }
  return result;
}

export async function correlate(): Promise<CorrelationStats> {
  const t0 = Date.now();
  const stats: CorrelationStats = {
    commitsProcessed: 0,
    linksCreated: 0,
    aiAssistedMarked: 0,
    durationMs: 0,
  };

  const repoRows = await db.select().from(repos).all();
  for (const r of repoRows) {
    const repoCommits = await db
      .select()
      .from(commits)
      .where(eq(commits.repoId, r.id))
      .all();

    for (const cmt of repoCommits) {
      stats.commitsProcessed++;
      const candidates = await loadSessionCandidates(r.localPath, cmt.committedAt);
      if (candidates.length === 0) continue;

      let filesChanged: string[] = [];
      try {
        filesChanged = cmt.filesChangedJson ? (JSON.parse(cmt.filesChangedJson) as string[]) : [];
      } catch {
        filesChanged = [];
      }

      const commitMs = new Date(cmt.committedAt).getTime();
      let bestLinked = false;

      for (const s of candidates) {
        const sessionLastMs = new Date(s.endedAt).getTime();
        let score = 0;
        const reasons: Record<string, number> = {};

        if (cmt.coAuthoredClaude) {
          score += 50;
          reasons.coAuthor = 50;
        }
        const overlap = fileOverlapRatio(s.editedFiles, filesChanged);
        if (overlap >= 0.5) {
          score += 30;
          reasons.fileOverlap = 30;
        } else if (overlap >= 0.2) {
          score += 15;
          reasons.partialFileOverlap = 15;
        }
        const tp = timeProximityScore(sessionLastMs, commitMs);
        score += tp;
        if (tp > 0) reasons.timeProximity = tp;
        if (s.gitBranch && cmt.branch && s.gitBranch === cmt.branch) {
          score += 5;
          reasons.branchMatch = 5;
        }

        if (score < SCORE_THRESHOLD) continue;
        const confidence = score >= CONFIDENCE_HIGH ? "high" : "medium";
        const attribution = Math.min(1, overlap > 0 ? overlap : 0.5);

        await db
          .insert(sessionCommitLinks)
          .values({
            sessionId: s.id,
            repoId: r.id,
            commitSha: cmt.sha,
            score,
            confidence,
            attributionRatio: attribution,
            reasonJson: JSON.stringify(reasons),
          })
          .onConflictDoUpdate({
            target: [sessionCommitLinks.sessionId, sessionCommitLinks.repoId, sessionCommitLinks.commitSha],
            set: {
              score,
              confidence,
              attributionRatio: attribution,
              reasonJson: JSON.stringify(reasons),
            },
          });
        stats.linksCreated++;
        bestLinked = bestLinked || confidence === "high" || (confidence === "medium" && overlap >= 0.5);
      }

      if (bestLinked || cmt.coAuthoredClaude) {
        await db
          .update(commits)
          .set({ isAiAssisted: true })
          .where(and(eq(commits.repoId, r.id), eq(commits.sha, cmt.sha)));
        stats.aiAssistedMarked++;
      }
    }
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}
