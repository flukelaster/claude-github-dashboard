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
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "DELETE"],
  })
);

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));
app.route("/api", api);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[cgd/server] listening :${info.port}`);
});

// Auto-sync on boot (non-blocking). Disable via CGD_AUTO_SYNC=0 (e.g. during tests / hot-reload).
if (process.env.CGD_AUTO_SYNC !== "0") {
  runFullSync().catch((e) => console.error("[cgd/server] initial sync failed:", e));
}
