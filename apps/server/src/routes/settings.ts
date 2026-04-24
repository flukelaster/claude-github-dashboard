import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { deleteSecret, getBackend, getSecret, setSecret } from "../services/keychain.js";
import { getAllProviders, getProvider, isProviderName, type ProviderName } from "../services/providers/index.js";

const ROI_KEY = "roi_config";

const roiInput = z.object({
  role: z.enum(["junior", "mid", "senior", "lead", "custom"]),
  hourlyRate: z.number().min(1).max(1_000_000),
  locPerHour: z.number().min(1).max(10_000),
  currency: z.enum(["USD", "THB"]).default("USD"),
  fxRateToUsd: z.number().min(0.001).max(100_000).default(1),
});

export type RoiConfig = z.infer<typeof roiInput>;

const ROI_DEFAULT: RoiConfig = { role: "senior", hourlyRate: 825, locPerHour: 70, currency: "THB", fxRateToUsd: 35 };

export const settingsRoutes = new Hono();

// ─── Provider token regexes ───────────────────────────────────────────────────
const TOKEN_REGEX: Record<ProviderName, RegExp> = {
  github: /^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,255})$/,
  gitlab: /^glpat-[A-Za-z0-9_-]{20,}$/,
};

const KEYCHAIN_KEY: Record<ProviderName, string> = {
  github: "github_pat",
  gitlab: "gitlab_pat",
};

const PROVIDER_LABEL: Record<ProviderName, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

function providerTokenInput(name: ProviderName) {
  return z.object({
    token: z
      .string()
      .regex(TOKEN_REGEX[name], `expected a valid ${PROVIDER_LABEL[name]} personal access token`),
  });
}

// ─── New provider-aware endpoints ─────────────────────────────────────────────
settingsRoutes.get("/providers", async (c) => {
  const providers = getAllProviders();
  const [backend, ...tokens] = await Promise.all([
    getBackend(),
    ...providers.map((p) => getSecret(KEYCHAIN_KEY[p.name])),
  ]);
  const out = providers.map((p, i) => {
    const token = tokens[i] as string | null;
    return {
      name: p.name,
      label: PROVIDER_LABEL[p.name],
      hasToken: !!token,
      preview: token ? `…${token.slice(-4)}` : null,
    };
  });
  return c.json({ providers: out, backend });
});

settingsRoutes.get("/providers/:name/token", async (c) => {
  const name = c.req.param("name");
  if (!isProviderName(name)) return c.json({ error: "unknown provider" }, 404);
  const t = await getSecret(KEYCHAIN_KEY[name]);
  return c.json({
    hasToken: !!t,
    preview: t ? `…${t.slice(-4)}` : null,
  });
});

settingsRoutes.post("/providers/:name/token", async (c) => {
  const name = c.req.param("name");
  if (!isProviderName(name)) return c.json({ error: "unknown provider" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = providerTokenInput(name).safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid token" }, 400);
  await setSecret(KEYCHAIN_KEY[name], parsed.data.token);
  return c.json({ ok: true });
});

settingsRoutes.delete("/providers/:name/token", async (c) => {
  const name = c.req.param("name");
  if (!isProviderName(name)) return c.json({ error: "unknown provider" }, 404);
  await deleteSecret(KEYCHAIN_KEY[name]);
  return c.json({ ok: true });
});

settingsRoutes.get("/providers/:name/test", async (c) => {
  const name = c.req.param("name");
  if (!isProviderName(name)) return c.json({ error: "unknown provider" }, 404);
  const provider = getProvider(name);
  const result = await provider.testAuth();
  return c.json(result);
});

// ─── ROI config ───────────────────────────────────────────────────────────────
settingsRoutes.get("/roi", async (c) => {
  const row = db.select().from(settings).where(eq(settings.key, ROI_KEY)).get();
  if (!row) return c.json(ROI_DEFAULT);
  try {
    return c.json(JSON.parse(row.value) as RoiConfig);
  } catch {
    return c.json(ROI_DEFAULT);
  }
});

settingsRoutes.post("/roi", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = roiInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid roi config" }, 400);
  db.insert(settings)
    .values({ key: ROI_KEY, value: JSON.stringify(parsed.data) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(parsed.data) } })
    .run();
  return c.json({ ok: true });
});
