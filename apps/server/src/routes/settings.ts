import { Hono } from "hono";
import { z } from "zod";
import { deleteSecret, getSecret, setSecret } from "../services/keychain.js";

export const settingsRoutes = new Hono();

settingsRoutes.get("/github/token", async (c) => {
  const t = await getSecret("github_pat");
  return c.json({ hasToken: !!t, preview: t ? `${t.slice(0, 4)}…${t.slice(-4)}` : null });
});

const tokenInput = z.object({ token: z.string().min(10).max(200) });

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
