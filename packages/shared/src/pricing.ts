// Anthropic API pricing snapshot (USD per 1M tokens).
// Source: https://platform.claude.com/docs/en/docs/about-claude/pricing (fetched 2026-04-21).
// Cache write 5m = 1.25x base input, cache write 1h = 2x base input, cache read = 0.1x base input.

export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

// Opus 4.5 / 4.6 / 4.7 — new lower pricing ($5/$25)
const OPUS_NEW: ModelPricing = {
  input: 5,
  output: 25,
  cacheWrite5m: 6.25,
  cacheWrite1h: 10,
  cacheRead: 0.5,
};

// Opus 4 / 4.1 / 3 — legacy pricing ($15/$75)
const OPUS_LEGACY: ModelPricing = {
  input: 15,
  output: 75,
  cacheWrite5m: 18.75,
  cacheWrite1h: 30,
  cacheRead: 1.5,
};

// Sonnet 4 / 4.5 / 4.6 / 3.7
const SONNET: ModelPricing = {
  input: 3,
  output: 15,
  cacheWrite5m: 3.75,
  cacheWrite1h: 6,
  cacheRead: 0.3,
};

// Haiku 4.5
const HAIKU_45: ModelPricing = {
  input: 1,
  output: 5,
  cacheWrite5m: 1.25,
  cacheWrite1h: 2,
  cacheRead: 0.1,
};

// Haiku 3.5
const HAIKU_35: ModelPricing = {
  input: 0.8,
  output: 4,
  cacheWrite5m: 1,
  cacheWrite1h: 1.6,
  cacheRead: 0.08,
};

// Haiku 3
const HAIKU_3: ModelPricing = {
  input: 0.25,
  output: 1.25,
  cacheWrite5m: 0.3,
  cacheWrite1h: 0.5,
  cacheRead: 0.03,
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus — new pricing
  "claude-opus-4-7": OPUS_NEW,
  "claude-opus-4-6": OPUS_NEW,
  "claude-opus-4-5": OPUS_NEW,

  // Opus — legacy pricing
  "claude-opus-4-1": OPUS_LEGACY,
  "claude-opus-4": OPUS_LEGACY,
  "claude-3-opus": OPUS_LEGACY,

  // Sonnet
  "claude-sonnet-4-6": SONNET,
  "claude-sonnet-4-5": SONNET,
  "claude-sonnet-4": SONNET,
  "claude-3-5-sonnet": SONNET,
  "claude-3-7-sonnet": SONNET,

  // Haiku
  "claude-haiku-4-5": HAIKU_45,
  "claude-haiku-4": HAIKU_45,
  "claude-3-5-haiku": HAIKU_35,
  "claude-3-haiku": HAIKU_3,
};

export function resolveModel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip provider prefix / date suffix / context tag
  // e.g. "claude-sonnet-4-6-20250929" → "claude-sonnet-4-6"
  // e.g. "claude-opus-4-7[1m]" → "claude-opus-4-7"
  const cleaned = raw.replace(/\[.+?\]$/, "").replace(/-\d{8}$/, "");

  if (MODEL_PRICING[cleaned]) return cleaned;

  // Fallback match by family prefix (longest match wins)
  const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (cleaned.startsWith(k)) return k;
  }
  return null;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  cacheRead?: number;
}

export function computeCost(model: string | null | undefined, usage: TokenUsage): number {
  const resolved = resolveModel(model);
  if (!resolved) return 0;
  const p = MODEL_PRICING[resolved];
  if (!p) return 0;
  const perToken = (dollarsPerMillion: number) => dollarsPerMillion / 1_000_000;

  return (
    usage.input * perToken(p.input) +
    usage.output * perToken(p.output) +
    (usage.cacheWrite5m ?? 0) * perToken(p.cacheWrite5m) +
    (usage.cacheWrite1h ?? 0) * perToken(p.cacheWrite1h) +
    (usage.cacheRead ?? 0) * perToken(p.cacheRead)
  );
}
