import { Hono } from "hono";
import { z } from "zod";
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
