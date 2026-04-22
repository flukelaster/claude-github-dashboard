import { sql } from "drizzle-orm";
import { subDays, formatISO, startOfDay } from "date-fns";
import type { DailyBucket, ForecastResponse, HeatmapCell, OverviewResponse } from "@cgd/shared";
import { db } from "../db/client.js";

function rangeStart(days: number): string {
  return startOfDay(subDays(new Date(), days)).toISOString();
}

export async function getOverview(days: number): Promise<OverviewResponse> {
  const since = rangeStart(days);
  const row = db
    .all<{
      total_cost: number | null;
      input_tokens: number | null;
      output_tokens: number | null;
      cache_read: number | null;
      cache_write_5m: number | null;
      cache_write_1h: number | null;
      session_count: number;
    }>(sql`
      SELECT
        COALESCE(SUM(cost_usd), 0) AS total_cost,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read,
        COALESCE(SUM(cache_write_5m_tokens), 0) AS cache_write_5m,
        COALESCE(SUM(cache_write_1h_tokens), 0) AS cache_write_1h,
        COUNT(*) AS session_count
      FROM sessions
      WHERE started_at >= ${since}
    `)[0];

  const commitsRow = db
    .all<{ commit_count: number; ai_count: number; loc_attributed: number }>(sql`
      SELECT
        COUNT(*) AS commit_count,
        SUM(CASE WHEN is_ai_assisted = 1 THEN 1 ELSE 0 END) AS ai_count,
        COALESCE(SUM(CASE WHEN is_ai_assisted = 1 THEN additions + deletions ELSE 0 END), 0) AS loc_attributed
      FROM commits
      WHERE authored_at >= ${since}
    `)[0];

  const totalCost = row?.total_cost ?? 0;
  const sessionCount = row?.session_count ?? 0;
  const commitCount = commitsRow?.commit_count ?? 0;
  const aiCount = commitsRow?.ai_count ?? 0;
  const locAttributed = commitsRow?.loc_attributed ?? 0;

  return {
    rangeDays: days,
    totalCostUsd: totalCost,
    totalInputTokens: row?.input_tokens ?? 0,
    totalOutputTokens: row?.output_tokens ?? 0,
    totalCacheReadTokens: row?.cache_read ?? 0,
    totalCacheWriteTokens: (row?.cache_write_5m ?? 0) + (row?.cache_write_1h ?? 0),
    sessionCount,
    commitCount,
    aiAssistedCommitCount: aiCount,
    aiAssistedRatio: commitCount > 0 ? aiCount / commitCount : 0,
    locAttributed,
    costPerLoc: locAttributed > 0 ? totalCost / locAttributed : null,
  };
}

export async function getDailyUsage(days: number): Promise<DailyBucket[]> {
  const since = rangeStart(days);
  // Day buckets from messages (more granular than sessions)
  const rows = db.all<{
    day: string;
    model: string | null;
    cost: number;
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  }>(sql`
    SELECT
      substr(ts, 1, 10) AS day,
      model,
      COALESCE(SUM(cost_usd), 0) AS cost,
      COALESCE(SUM(input_tokens), 0) AS input,
      COALESCE(SUM(output_tokens), 0) AS output,
      COALESCE(SUM(cache_read_tokens), 0) AS cache_read,
      COALESCE(SUM(cache_write_tokens), 0) AS cache_write
    FROM messages
    WHERE ts >= ${since}
    GROUP BY day, model
    ORDER BY day ASC
  `);

  const byDay = new Map<string, DailyBucket>();
  for (const r of rows) {
    let b = byDay.get(r.day);
    if (!b) {
      b = {
        date: r.day,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        byModel: {},
      };
      byDay.set(r.day, b);
    }
    b.costUsd += r.cost;
    b.inputTokens += r.input;
    b.outputTokens += r.output;
    b.cacheReadTokens += r.cache_read;
    b.cacheWriteTokens += r.cache_write;
    const m = r.model ?? "unknown";
    const mb = b.byModel[m] ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 };
    mb.costUsd += r.cost;
    mb.inputTokens += r.input;
    mb.outputTokens += r.output;
    b.byModel[m] = mb;
  }

  // Fill missing days with zeros
  const out: DailyBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = formatISO(subDays(new Date(), i), { representation: "date" });
    out.push(
      byDay.get(d) ?? {
        date: d,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        byModel: {},
      }
    );
  }
  return out;
}

export async function getHeatmap(
  days: number,
  metric: "cost" | "commits" | "sessions"
): Promise<HeatmapCell[]> {
  const since = rangeStart(days);
  const QUERIES = {
    cost: sql`
      SELECT
        CAST(strftime('%w', ts) AS INTEGER) AS dow,
        CAST(strftime('%H', ts) AS INTEGER) AS hour,
        COALESCE(SUM(cost_usd), 0) AS value
      FROM messages WHERE ts >= ${since} GROUP BY dow, hour`,
    sessions: sql`
      SELECT
        CAST(strftime('%w', started_at) AS INTEGER) AS dow,
        CAST(strftime('%H', started_at) AS INTEGER) AS hour,
        COUNT(*) AS value
      FROM sessions WHERE started_at >= ${since} GROUP BY dow, hour`,
    commits: sql`
      SELECT
        CAST(strftime('%w', authored_at) AS INTEGER) AS dow,
        CAST(strftime('%H', authored_at) AS INTEGER) AS hour,
        COUNT(*) AS value
      FROM commits WHERE authored_at >= ${since} GROUP BY dow, hour`,
  };
  const rows = db.all<{ dow: number; hour: number; value: number }>(QUERIES[metric]);

  const cells = new Map<string, number>();
  for (const r of rows) cells.set(`${r.dow}-${r.hour}`, r.value);
  const out: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      out.push({ dow: d, hour: h, value: cells.get(`${d}-${h}`) ?? 0 });
    }
  }
  return out;
}

export async function getForecast(days: number): Promise<ForecastResponse> {
  const daily = await getDailyUsage(days);
  const total = daily.reduce((s, d) => s + d.costUsd, 0);
  const avg = daily.length > 0 ? total / daily.length : 0;
  const last7 = daily.slice(-7);
  const last7Avg = last7.length > 0 ? last7.reduce((s, d) => s + d.costUsd, 0) / last7.length : 0;
  const rate = last7Avg > 0 ? last7Avg : avg;
  const runway: ForecastResponse["runway"] = [];
  let cum = 0;
  for (let i = 1; i <= 30; i++) {
    cum += rate;
    const date = formatISO(new Date(Date.now() + i * 86400000), { representation: "date" });
    runway.push({ date, projectedCostUsd: cum });
  }
  return {
    rangeDays: days,
    avgDailyCost: avg,
    last7DailyCost: last7Avg,
    projectedMonthlyCost: rate * 30,
    runway,
  };
}

export async function getSessions(opts: { limit: number; offset: number }): Promise<
  {
    id: string;
    projectPath: string;
    startedAt: string;
    endedAt: string;
    costUsd: number;
    messageCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    primaryModel: string | null;
    gitBranch: string | null;
  }[]
> {
  return db.all(sql`
    SELECT id, project_path AS projectPath, started_at AS startedAt, ended_at AS endedAt,
           cost_usd AS costUsd, message_count AS messageCount,
           input_tokens AS inputTokens, output_tokens AS outputTokens,
           cache_read_tokens AS cacheReadTokens,
           primary_model AS primaryModel, git_branch AS gitBranch
    FROM sessions
    ORDER BY started_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);
}

export async function getRepos(): Promise<
  {
    id: number;
    localPath: string;
    githubOwner: string | null;
    githubName: string | null;
    defaultBranch: string | null;
    commitCount: number;
    totalLoc: number;
    additions: number;
    deletions: number;
    netLoc: number;
    aiAssistedCount: number;
    aiAdditions: number;
    aiDeletions: number;
    avgCostPerCommit: number | null;
    lastSyncedAt: string | null;
  }[]
> {
  return db.all(sql`
    SELECT
      r.id,
      r.local_path AS localPath,
      r.github_owner AS githubOwner,
      r.github_name AS githubName,
      r.default_branch AS defaultBranch,
      r.last_synced_at AS lastSyncedAt,
      COALESCE(c.commit_count, 0) AS commitCount,
      COALESCE(c.total_loc, 0) AS totalLoc,
      COALESCE(c.adds, 0) AS additions,
      COALESCE(c.dels, 0) AS deletions,
      COALESCE(c.adds - c.dels, 0) AS netLoc,
      COALESCE(c.ai_count, 0) AS aiAssistedCount,
      COALESCE(c.ai_adds, 0) AS aiAdditions,
      COALESCE(c.ai_dels, 0) AS aiDeletions,
      NULL AS avgCostPerCommit
    FROM repos r
    LEFT JOIN (
      SELECT
        repo_id,
        COUNT(*) AS commit_count,
        SUM(additions + deletions) AS total_loc,
        SUM(additions) AS adds,
        SUM(deletions) AS dels,
        SUM(CASE WHEN is_ai_assisted = 1 THEN 1 ELSE 0 END) AS ai_count,
        SUM(CASE WHEN is_ai_assisted = 1 THEN additions ELSE 0 END) AS ai_adds,
        SUM(CASE WHEN is_ai_assisted = 1 THEN deletions ELSE 0 END) AS ai_dels
      FROM commits
      GROUP BY repo_id
    ) c ON c.repo_id = r.id
    WHERE r.opted_out = 0
    ORDER BY r.local_path
  `);
}

export async function getRepoDetail(id: number, days: number): Promise<
  | {
      repo: {
        id: number;
        localPath: string;
        githubOwner: string | null;
        githubName: string | null;
        lastSyncedAt: string | null;
        totals: { additions: number; deletions: number; netLoc: number; commitCount: number };
        windowTotals: {
          additions: number;
          deletions: number;
          netLoc: number;
          commitCount: number;
          aiAdditions: number;
          aiDeletions: number;
          aiCommitCount: number;
        };
      };
      commits: {
        sha: string;
        authoredAt: string;
        message: string | null;
        authorName: string | null;
        additions: number;
        deletions: number;
        isAiAssisted: boolean;
        coAuthoredClaude: boolean;
        linkedSessions: { sessionId: string; score: number; confidence: string }[];
      }[];
      prs: {
        number: number;
        title: string | null;
        state: string | null;
        authorLogin: string | null;
        createdAt: string | null;
        mergedAt: string | null;
        additions: number;
        deletions: number;
        reviewCount: number;
        timeToMergeMinutes: number | null;
      }[];
    }
  | null
> {
  const repo = db.all<{
    id: number;
    local_path: string;
    github_owner: string | null;
    github_name: string | null;
    last_synced_at: string | null;
  }>(sql`SELECT id, local_path, github_owner, github_name, last_synced_at FROM repos WHERE id = ${id}`)[0];
  if (!repo) return null;
  const since = rangeStart(days);
  const commitRows = db.all<{
    sha: string;
    authored_at: string;
    message: string | null;
    author_name: string | null;
    additions: number;
    deletions: number;
    is_ai_assisted: number;
    co_authored_claude: number;
  }>(sql`
    SELECT sha, authored_at, message, author_name, additions, deletions, is_ai_assisted, co_authored_claude
    FROM commits
    WHERE repo_id = ${id} AND authored_at >= ${since}
    ORDER BY authored_at DESC
    LIMIT 200
  `);
  const shas = commitRows.map((r) => r.sha);
  const links = shas.length
    ? db.all<{
        commit_sha: string;
        session_id: string;
        score: number;
        confidence: string;
      }>(sql`
        SELECT commit_sha, session_id, score, confidence
        FROM session_commit_links
        WHERE repo_id = ${id} AND commit_sha IN ${shas}
      `)
    : [];
  const linksBySha = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksBySha.get(l.commit_sha) ?? [];
    arr.push(l);
    linksBySha.set(l.commit_sha, arr);
  }

  const prs = db.all<{
    number: number;
    title: string | null;
    state: string | null;
    author_login: string | null;
    created_at: string | null;
    merged_at: string | null;
    additions: number;
    deletions: number;
    review_count: number;
    time_to_merge_minutes: number | null;
  }>(sql`
    SELECT number, title, state, author_login, created_at, merged_at, additions, deletions, review_count, time_to_merge_minutes
    FROM pull_requests
    WHERE repo_id = ${id}
    ORDER BY COALESCE(merged_at, created_at) DESC
    LIMIT 100
  `);

  const aggRow = db.all<{
    total_adds: number;
    total_dels: number;
    total_count: number;
    adds: number;
    dels: number;
    count: number;
    ai_adds: number;
    ai_dels: number;
    ai_count: number;
  }>(sql`
    SELECT
      COALESCE(SUM(additions),0) AS total_adds,
      COALESCE(SUM(deletions),0) AS total_dels,
      COUNT(*) AS total_count,
      COALESCE(SUM(CASE WHEN authored_at >= ${since} THEN additions ELSE 0 END),0) AS adds,
      COALESCE(SUM(CASE WHEN authored_at >= ${since} THEN deletions ELSE 0 END),0) AS dels,
      COALESCE(SUM(CASE WHEN authored_at >= ${since} THEN 1 ELSE 0 END),0) AS count,
      COALESCE(SUM(CASE WHEN authored_at >= ${since} AND is_ai_assisted=1 THEN additions ELSE 0 END),0) AS ai_adds,
      COALESCE(SUM(CASE WHEN authored_at >= ${since} AND is_ai_assisted=1 THEN deletions ELSE 0 END),0) AS ai_dels,
      COALESCE(SUM(CASE WHEN authored_at >= ${since} AND is_ai_assisted=1 THEN 1 ELSE 0 END),0) AS ai_count
    FROM commits WHERE repo_id = ${id}
  `)[0] ?? {
    total_adds: 0,
    total_dels: 0,
    total_count: 0,
    adds: 0,
    dels: 0,
    count: 0,
    ai_adds: 0,
    ai_dels: 0,
    ai_count: 0,
  };
  const totals = { adds: aggRow.total_adds, dels: aggRow.total_dels, count: aggRow.total_count };
  const windowRow = {
    adds: aggRow.adds,
    dels: aggRow.dels,
    count: aggRow.count,
    ai_adds: aggRow.ai_adds,
    ai_dels: aggRow.ai_dels,
    ai_count: aggRow.ai_count,
  };

  return {
    repo: {
      id: repo.id,
      localPath: repo.local_path,
      githubOwner: repo.github_owner,
      githubName: repo.github_name,
      lastSyncedAt: repo.last_synced_at,
      totals: {
        additions: totals.adds,
        deletions: totals.dels,
        netLoc: totals.adds - totals.dels,
        commitCount: totals.count,
      },
      windowTotals: {
        additions: windowRow.adds,
        deletions: windowRow.dels,
        netLoc: windowRow.adds - windowRow.dels,
        commitCount: windowRow.count,
        aiAdditions: windowRow.ai_adds,
        aiDeletions: windowRow.ai_dels,
        aiCommitCount: windowRow.ai_count,
      },
    },
    commits: commitRows.map((r) => ({
      sha: r.sha,
      authoredAt: r.authored_at,
      message: r.message,
      authorName: r.author_name,
      additions: r.additions,
      deletions: r.deletions,
      isAiAssisted: !!r.is_ai_assisted,
      coAuthoredClaude: !!r.co_authored_claude,
      linkedSessions: (linksBySha.get(r.sha) ?? []).map((l) => ({
        sessionId: l.session_id,
        score: l.score,
        confidence: l.confidence,
      })),
    })),
    prs: prs.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      authorLogin: p.author_login,
      createdAt: p.created_at,
      mergedAt: p.merged_at,
      additions: p.additions,
      deletions: p.deletions,
      reviewCount: p.review_count,
      timeToMergeMinutes: p.time_to_merge_minutes,
    })),
  };
}

export interface LanguageBreakdown {
  language: string;
  color: string | null;
  bytes: number;
  loc: number;
  ratio: number;
  locRatio: number;
  perRepo: { repoId: number; localPath: string; bytes: number; loc: number }[];
}

export async function getLocDaily(days: number): Promise<
  {
    date: string;
    additions: number;
    deletions: number;
    net: number;
    aiAdditions: number;
    aiDeletions: number;
    commitCount: number;
  }[]
> {
  const since = rangeStart(days);
  const rows = db.all<{
    day: string;
    adds: number;
    dels: number;
    ai_adds: number;
    ai_dels: number;
    count: number;
  }>(sql`
    SELECT
      substr(authored_at, 1, 10) AS day,
      COALESCE(SUM(additions), 0) AS adds,
      COALESCE(SUM(deletions), 0) AS dels,
      COALESCE(SUM(CASE WHEN is_ai_assisted = 1 THEN additions ELSE 0 END), 0) AS ai_adds,
      COALESCE(SUM(CASE WHEN is_ai_assisted = 1 THEN deletions ELSE 0 END), 0) AS ai_dels,
      COUNT(*) AS count
    FROM commits
    WHERE authored_at >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `);

  const byDay = new Map<string, typeof rows[number]>();
  for (const r of rows) byDay.set(r.day, r);

  const out: ReturnType<typeof collectDays> = [];
  function collectDays() {
    const arr: {
      date: string;
      additions: number;
      deletions: number;
      net: number;
      aiAdditions: number;
      aiDeletions: number;
      commitCount: number;
    }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = formatISO(subDays(new Date(), i), { representation: "date" });
      const r = byDay.get(d);
      arr.push({
        date: d,
        additions: r?.adds ?? 0,
        deletions: r?.dels ?? 0,
        net: (r?.adds ?? 0) - (r?.dels ?? 0),
        aiAdditions: r?.ai_adds ?? 0,
        aiDeletions: r?.ai_dels ?? 0,
        commitCount: r?.count ?? 0,
      });
    }
    return arr;
  }
  out.push(...collectDays());
  return out;
}

export async function getLanguages(): Promise<{
  totalBytes: number;
  totalLoc: number;
  languages: LanguageBreakdown[];
  byRepo: {
    repoId: number;
    localPath: string;
    githubOwner: string | null;
    githubName: string | null;
    totalBytes: number;
    totalLoc: number;
    languages: { language: string; color: string | null; bytes: number; loc: number; ratio: number; locRatio: number }[];
  }[];
}> {
  const rows = db.all<{
    repo_id: number;
    language: string;
    bytes: number;
    loc_count: number;
    color: string | null;
    local_path: string;
    github_owner: string | null;
    github_name: string | null;
  }>(sql`
    SELECT rl.repo_id, rl.language, rl.bytes, rl.loc_count, rl.color,
           r.local_path, r.github_owner, r.github_name
    FROM repo_languages rl
    JOIN repos r ON r.id = rl.repo_id
    WHERE r.opted_out = 0 AND (rl.bytes > 0 OR rl.loc_count > 0)
    ORDER BY rl.bytes DESC, rl.loc_count DESC
  `);

  const aggregate = new Map<
    string,
    {
      language: string;
      color: string | null;
      bytes: number;
      loc: number;
      perRepo: Map<number, { localPath: string; bytes: number; loc: number }>;
    }
  >();
  const byRepo = new Map<
    number,
    {
      repoId: number;
      localPath: string;
      githubOwner: string | null;
      githubName: string | null;
      totalBytes: number;
      totalLoc: number;
      languages: { language: string; color: string | null; bytes: number; loc: number; ratio: number; locRatio: number }[];
    }
  >();

  for (const r of rows) {
    const agg = aggregate.get(r.language) ?? {
      language: r.language,
      color: r.color,
      bytes: 0,
      loc: 0,
      perRepo: new Map(),
    };
    agg.bytes += r.bytes;
    agg.loc += r.loc_count;
    agg.perRepo.set(r.repo_id, { localPath: r.local_path, bytes: r.bytes, loc: r.loc_count });
    aggregate.set(r.language, agg);

    const repo = byRepo.get(r.repo_id) ?? {
      repoId: r.repo_id,
      localPath: r.local_path,
      githubOwner: r.github_owner,
      githubName: r.github_name,
      totalBytes: 0,
      totalLoc: 0,
      languages: [],
    };
    repo.totalBytes += r.bytes;
    repo.totalLoc += r.loc_count;
    repo.languages.push({
      language: r.language,
      color: r.color,
      bytes: r.bytes,
      loc: r.loc_count,
      ratio: 0,
      locRatio: 0,
    });
    byRepo.set(r.repo_id, repo);
  }

  const totalBytes = [...aggregate.values()].reduce((s, a) => s + a.bytes, 0);
  const totalLoc = [...aggregate.values()].reduce((s, a) => s + a.loc, 0);

  const languages: LanguageBreakdown[] = [...aggregate.values()]
    .sort((a, b) => b.bytes - a.bytes || b.loc - a.loc)
    .map((a) => ({
      language: a.language,
      color: a.color,
      bytes: a.bytes,
      loc: a.loc,
      ratio: totalBytes > 0 ? a.bytes / totalBytes : 0,
      locRatio: totalLoc > 0 ? a.loc / totalLoc : 0,
      perRepo: [...a.perRepo.entries()]
        .map(([repoId, v]) => ({ repoId, localPath: v.localPath, bytes: v.bytes, loc: v.loc }))
        .sort((x, y) => y.bytes - x.bytes || y.loc - x.loc),
    }));

  const repoList = [...byRepo.values()]
    .map((r) => ({
      ...r,
      languages: r.languages
        .map((l) => ({
          ...l,
          ratio: r.totalBytes > 0 ? l.bytes / r.totalBytes : 0,
          locRatio: r.totalLoc > 0 ? l.loc / r.totalLoc : 0,
        }))
        .sort((a, b) => b.bytes - a.bytes || b.loc - a.loc),
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes || b.totalLoc - a.totalLoc);

  return { totalBytes, totalLoc, languages, byRepo: repoList };
}

export async function getProductivity(days: number): Promise<{
  rangeDays: number;
  totalCost: number;
  totalLoc: number;
  locPerDollar: number | null;
  daily: { date: string; costUsd: number; loc: number; locPerDollar: number | null }[];
}> {
  const since = rangeStart(days);

  const daily = db.all<{ day: string; cost: number; loc: number }>(sql`
    SELECT day, SUM(cost) AS cost, SUM(loc) AS loc FROM (
      SELECT substr(ts, 1, 10) AS day, SUM(cost_usd) AS cost, 0 AS loc
      FROM messages
      WHERE ts >= ${since}
      GROUP BY day
      UNION ALL
      SELECT substr(authored_at, 1, 10) AS day, 0 AS cost, SUM(CASE WHEN is_ai_assisted = 1 THEN additions + deletions ELSE 0 END) AS loc
      FROM commits
      WHERE authored_at >= ${since}
      GROUP BY day
    )
    GROUP BY day
    ORDER BY day ASC
  `);

  let totalCost = 0;
  let totalLoc = 0;
  const byDay = daily.map((d) => {
    totalCost += d.cost;
    totalLoc += d.loc;
    return {
      date: d.day,
      costUsd: d.cost,
      loc: d.loc,
      locPerDollar: d.cost > 0 ? d.loc / d.cost : null,
    };
  });

  return {
    rangeDays: days,
    totalCost,
    totalLoc,
    locPerDollar: totalCost > 0 ? totalLoc / totalCost : null,
    daily: byDay,
  };
}
