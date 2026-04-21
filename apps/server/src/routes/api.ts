import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  getDailyUsage,
  getForecast,
  getHeatmap,
  getLanguages,
  getLocDaily,
  getOverview,
  getProductivity,
  getRepoDetail,
  getRepos,
  getSessions,
} from "../services/analytics.js";
import { getStatus, runFullSync, subscribe, type SyncEvent } from "../services/sync.js";
import { hasGitHubToken } from "../services/github-client.js";
import { settingsRoutes } from "./settings.js";

export const api = new Hono();

function parseDays(raw: string): number {
  const m = /^(\d+)d$/.exec(raw);
  if (!m) return 30;
  const n = Number(m[1]);
  return Math.min(365, Math.max(1, isFinite(n) ? n : 30));
}

api.get("/overview", async (c) => {
  const days = parseDays(c.req.query("range") ?? "30d");
  return c.json(await getOverview(days));
});

api.get("/usage/daily", async (c) => {
  const days = parseDays(c.req.query("range") ?? "90d");
  return c.json(await getDailyUsage(days));
});

api.get("/heatmap", async (c) => {
  const days = parseDays(c.req.query("range") ?? "30d");
  const metricRaw = c.req.query("metric") ?? "cost";
  const allowed = ["cost", "commits", "sessions"] as const;
  const m = (allowed as readonly string[]).includes(metricRaw)
    ? (metricRaw as "cost" | "commits" | "sessions")
    : "cost";
  return c.json(await getHeatmap(days, m));
});

api.get("/forecast", async (c) => {
  const days = parseDays(c.req.query("range") ?? "30d");
  return c.json(await getForecast(days));
});

api.get("/productivity", async (c) => {
  const days = parseDays(c.req.query("range") ?? "30d");
  return c.json(await getProductivity(days));
});

api.get("/sessions", async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? "50")));
  const offset = Math.max(0, Number(c.req.query("offset") ?? "0"));
  return c.json(await getSessions({ limit, offset }));
});

api.get("/repos", async (c) => {
  return c.json(await getRepos());
});

api.get("/languages", async (c) => {
  return c.json(await getLanguages());
});

api.get("/loc/daily", async (c) => {
  const days = parseDays(c.req.query("range") ?? "30d");
  return c.json(await getLocDaily(days));
});

api.get("/repos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!isFinite(id)) return c.json({ error: "bad id" }, 400);
  const days = parseDays(c.req.query("range") ?? "90d");
  const detail = await getRepoDetail(id, days);
  if (!detail) return c.json({ error: "not found" }, 404);
  return c.json(detail);
});

api.get("/github/status", async (c) => {
  return c.json({ hasToken: await hasGitHubToken() });
});

api.post("/sync", async (c) => {
  runFullSync().catch(() => {});
  return c.json({ started: true, status: getStatus() });
});

api.get("/sync/status", (c) => c.json(getStatus()));

api.get("/sync/stream", (c) => {
  return streamSSE(c, async (stream) => {
    const push = (evt: SyncEvent) =>
      stream.writeSSE({ event: evt.type, data: JSON.stringify(evt) });
    await push({ type: "progress", source: "init", message: "connected" });
    const unsub = subscribe((evt) => {
      void push(evt);
    });
    let alive = true;
    stream.onAbort(() => {
      alive = false;
      unsub();
    });
    while (alive) {
      await stream.sleep(15_000);
      if (alive) await stream.writeSSE({ event: "ping", data: "keepalive" });
    }
  });
});

api.route("/settings", settingsRoutes);
