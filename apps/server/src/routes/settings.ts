import { Hono } from "hono";
import { graphql } from "@octokit/graphql";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { scrubSecrets } from "@cgd/shared";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { deleteSecret, getBackend, getSecret, setSecret } from "../services/keychain.js";

const ROI_KEY = "roi_config";

const roiInput = z.object({
  role: z.enum(["junior", "mid", "senior", "lead", "custom"]),
  hourlyRate: z.number().min(1).max(1_000_000),
  locPerHour: z.number().min(1).max(10_000),
  currency: z.enum(["USD", "THB"]).default("USD"),
  fxRateToUsd: z.number().min(0.001).max(100_000).default(1),
});

export type RoiConfig = z.infer<typeof roiInput>;

const ROI_DEFAULT: RoiConfig = { role: "senior", hourlyRate: 105, locPerHour: 70, currency: "USD", fxRateToUsd: 1 };

export const settingsRoutes = new Hono();

settingsRoutes.get("/github/token", async (c) => {
  const t = await getSecret("github_pat");
  const backend = await getBackend();
  return c.json({
    hasToken: !!t,
    preview: t ? `…${t.slice(-4)}` : null,
    backend,
  });
});

// Accept classic (ghp_…) and fine-grained (github_pat_…) tokens.
const tokenInput = z.object({
  token: z
    .string()
    .regex(
      /^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,255})$/,
      "expected ghp_… (40 chars) or github_pat_…"
    ),
});

settingsRoutes.post("/github/token", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = tokenInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid token" }, 400);
  await setSecret("github_pat", parsed.data.token);
  return c.json({ ok: true });
});

settingsRoutes.delete("/github/token", async (c) => {
  await deleteSecret("github_pat");
  return c.json({ ok: true });
});

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

interface ViewerResponse {
  viewer: { login: string; name: string | null; avatarUrl: string; url: string };
  rateLimit: { remaining: number; limit: number; resetAt: string };
}

settingsRoutes.get("/github/test", async (c) => {
  const token = await getSecret("github_pat");
  if (!token) return c.json({ ok: false, error: "no token configured" }, 400);
  try {
    const gh = graphql.defaults({ headers: { authorization: `Bearer ${token}` } });
    const resp = await gh<ViewerResponse>(
      `query { viewer { login name avatarUrl url } rateLimit { remaining limit resetAt } }`
    );
    return c.json({
      ok: true,
      login: resp.viewer.login,
      name: resp.viewer.name,
      avatarUrl: resp.viewer.avatarUrl,
      profileUrl: resp.viewer.url,
      rateLimit: resp.rateLimit,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: scrubSecrets(raw) }, 200);
  }
});
