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
import { getProvider } from "../services/providers/index.js";
import { settingsRoutes } from "./settings.js";

export const api = new Hono();

function parseDays(raw: string): number {
  const m = /^(\d+)d$/.exec(raw);
  if (!m) return 30;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 30;
  return Math.min(365, Math.max(1, n));
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
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
  const limit = clampInt(c.req.query("limit"), 50, 1, 200);
  const offset = clampInt(c.req.query("offset"), 0, 0, 1_000_000);
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
  return c.json({ hasToken: await getProvider("github").hasToken() });
});

api.post("/sync", async (c) => {
  runFullSync().catch(() => {});
  return c.json({ started: true, status: getStatus() });
});

api.get("/sync/status", (c) => c.json(getStatus()));

const SSE_MAX_STREAMS = 8;
let activeStreams = 0;

api.get("/sync/stream", (c) => {
  if (activeStreams >= SSE_MAX_STREAMS) {
    return c.json({ error: "too many concurrent streams" }, 503);
  }
  activeStreams++;
  return streamSSE(c, async (stream) => {
    const push = (evt: SyncEvent) =>
      stream.writeSSE({ event: evt.type, data: JSON.stringify(evt) });
    let alive = true;
    const unsub = subscribe((evt) => {
      void push(evt);
    });
    const cleanup = () => {
      if (!alive) return;
      alive = false;
      unsub();
      activeStreams = Math.max(0, activeStreams - 1);
    };
    stream.onAbort(cleanup);
    try {
      await push({ type: "progress", source: "init", message: "connected" });
      while (alive) {
        await stream.sleep(15_000);
        if (!alive) break;
        try {
          await stream.writeSSE({ event: "ping", data: "keepalive" });
        } catch {
          break;
        }
      }
    } finally {
      cleanup();
    }
  });
});

api.route("/settings", settingsRoutes);
