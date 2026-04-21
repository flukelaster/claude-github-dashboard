import { Hono } from "hono";
import { graphql } from "@octokit/graphql";
import { z } from "zod";
import { scrubSecrets } from "@cgd/shared";
import { deleteSecret, getBackend, getSecret, setSecret } from "../services/keychain.js";

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
