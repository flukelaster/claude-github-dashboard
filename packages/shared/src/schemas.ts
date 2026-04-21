import { z } from "zod";

// Claude JSONL message shape (fail-open: extra fields allowed, unknown shapes skipped)
export const ClaudeUsageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation: z
      .object({
        ephemeral_5m_input_tokens: z.number().optional(),
        ephemeral_1h_input_tokens: z.number().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

export const ClaudeMessageSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    usage: ClaudeUsageSchema.optional(),
  })
  .partial()
  .passthrough();

export const ClaudeToolUseResultSchema = z
  .object({
    filePath: z.string().optional(),
    file_path: z.string().optional(),
  })
  .partial()
  .passthrough();

export const ClaudeEventSchema = z
  .object({
    sessionId: z.string().optional(),
    type: z.string().optional(),
    timestamp: z.string().optional(),
    cwd: z.string().optional(),
    gitBranch: z.string().optional(),
    message: ClaudeMessageSchema.optional(),
    toolUseResult: ClaudeToolUseResultSchema.optional(),
  })
  .partial()
  .passthrough();

export type ClaudeEvent = z.infer<typeof ClaudeEventSchema>;

export const OverviewResponseSchema = z.object({
  rangeDays: z.number(),
  totalCostUsd: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCacheReadTokens: z.number(),
  totalCacheWriteTokens: z.number(),
  sessionCount: z.number(),
  commitCount: z.number(),
  aiAssistedCommitCount: z.number(),
  aiAssistedRatio: z.number(),
  locAttributed: z.number(),
  costPerLoc: z.number().nullable(),
});
export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;

export const DailyBucketSchema = z.object({
  date: z.string(),
  costUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  byModel: z.record(
    z.string(),
    z.object({ costUsd: z.number(), inputTokens: z.number(), outputTokens: z.number() })
  ),
});
export type DailyBucket = z.infer<typeof DailyBucketSchema>;

export const HeatmapCellSchema = z.object({
  dow: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  value: z.number(),
});
export type HeatmapCell = z.infer<typeof HeatmapCellSchema>;

export const ForecastResponseSchema = z.object({
  rangeDays: z.number(),
  avgDailyCost: z.number(),
  last7DailyCost: z.number(),
  projectedMonthlyCost: z.number(),
  runway: z.array(z.object({ date: z.string(), projectedCostUsd: z.number() })),
});
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

export const SyncStatusSchema = z.object({
  running: z.boolean(),
  source: z.string().nullable(),
  filesScanned: z.number(),
  eventsIngested: z.number(),
  sessionsUpserted: z.number(),
  lastRunAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
