import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    projectPath: text("project_path").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWrite5mTokens: integer("cache_write_5m_tokens").notNull().default(0),
    cacheWrite1hTokens: integer("cache_write_1h_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    primaryModel: text("primary_model"),
    gitBranch: text("git_branch"),
  },
  (t) => [
    index("sessions_started_at").on(t.startedAt),
    index("sessions_project_path").on(t.projectPath),
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    messageUid: text("message_uid"),
    ts: text("ts").notNull(),
    type: text("type"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    filesTouchedJson: text("files_touched_json"),
  },
  (t) => [
    index("messages_session_id").on(t.sessionId),
    index("messages_ts").on(t.ts),
    index("messages_message_uid").on(t.messageUid),
  ]
);

export const repos = sqliteTable(
  "repos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    localPath: text("local_path").notNull().unique(),
    githubOwner: text("github_owner"),
    githubName: text("github_name"),
    defaultBranch: text("default_branch"),
    lastSyncedAt: text("last_synced_at"),
    optedOut: integer("opted_out", { mode: "boolean" }).notNull().default(false),
  }
);

export const commits = sqliteTable(
  "commits",
  {
    sha: text("sha").notNull(),
    repoId: integer("repo_id").notNull(),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    authoredAt: text("authored_at").notNull(),
    committerEmail: text("committer_email"),
    committedAt: text("committed_at").notNull(),
    message: text("message"),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    filesChangedJson: text("files_changed_json"),
    coAuthoredClaude: integer("co_authored_claude", { mode: "boolean" }).notNull().default(false),
    isAiAssisted: integer("is_ai_assisted", { mode: "boolean" }).notNull().default(false),
    prNumber: integer("pr_number"),
    branch: text("branch"),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.sha] }),
    index("commits_authored_at").on(t.authoredAt),
    index("commits_repo_authored").on(t.repoId, t.authoredAt),
  ]
);

export const pullRequests = sqliteTable(
  "pull_requests",
  {
    repoId: integer("repo_id").notNull(),
    number: integer("number").notNull(),
    title: text("title"),
    state: text("state"),
    authorLogin: text("author_login"),
    createdAt: text("created_at"),
    mergedAt: text("merged_at"),
    closedAt: text("closed_at"),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    timeToMergeMinutes: integer("time_to_merge_minutes"),
    aiAssistedCommitCount: integer("ai_assisted_commit_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.number] })]
);

export const sessionCommitLinks = sqliteTable(
  "session_commit_links",
  {
    sessionId: text("session_id").notNull(),
    repoId: integer("repo_id").notNull(),
    commitSha: text("commit_sha").notNull(),
    score: integer("score").notNull(),
    confidence: text("confidence").notNull(),
    attributionRatio: real("attribution_ratio").notNull().default(1),
    reasonJson: text("reason_json"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.repoId, t.commitSha] }),
    index("scl_commit").on(t.repoId, t.commitSha),
  ]
);

export const syncState = sqliteTable(
  "sync_state",
  {
    source: text("source").notNull(),
    key: text("key").notNull(),
    byteOffset: integer("byte_offset").notNull().default(0),
    etag: text("etag"),
    lastSyncedAt: text("last_synced_at"),
  },
  (t) => [primaryKey({ columns: [t.source, t.key] })]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const repoLanguages = sqliteTable(
  "repo_languages",
  {
    repoId: integer("repo_id").notNull(),
    language: text("language").notNull(),
    bytes: integer("bytes").notNull().default(0),
    locCount: integer("loc_count").notNull().default(0),
    color: text("color"),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.language] }),
    index("repo_languages_repo").on(t.repoId),
  ]
);
