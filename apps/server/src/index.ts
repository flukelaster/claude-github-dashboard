import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { api } from "./routes/api.js";
import { runFullSync } from "./services/sync.js";

const app = new Hono();

app.use(logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "DELETE"],
    allowHeaders: ["Content-Type", "X-CGD-Local"],
  })
);

// Require custom header on state-changing routes. Browser preflight blocks
// cross-origin requests that set this header unless CORS allows it, which is
// our allowlist — so other origins (including localhost:OTHER_PORT) cannot
// forge POST/DELETE against /api/settings/github/token or /api/sync.
app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "POST" || method === "DELETE") {
    if (c.req.header("X-CGD-Local") !== "1") {
      return c.json({ error: "missing X-CGD-Local header" }, 403);
    }
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));
app.route("/api", api);

const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.CGD_HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`[cgd/server] listening ${hostname}:${info.port}`);
});

// Auto-sync on boot (non-blocking). Disable via CGD_AUTO_SYNC=0 (e.g. during
// tests / hot-reload). Debounced against recent runs to avoid hammering
// GitHub on every `tsx watch` restart.
const AUTO_SYNC_MIN_GAP_MS = 5 * 60_000;
if (process.env.CGD_AUTO_SYNC !== "0") {
  const { getStatus } = await import("./services/sync.js");
  const last = getStatus().lastRunAt;
  const stale =
    !last || Date.now() - new Date(last).getTime() > AUTO_SYNC_MIN_GAP_MS;
  if (stale) {
    runFullSync().catch((e) => console.error("[cgd/server] initial sync failed:", e));
  } else {
    console.log(`[cgd/server] skipping auto-sync (last run at ${last})`);
  }
}
