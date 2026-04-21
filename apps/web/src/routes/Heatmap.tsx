import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "../components/PageHeader";
import RangePicker from "../components/RangePicker";
import EmptyState from "../components/EmptyState";
import { api, fmtNum, fmtUsd } from "../lib/api";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Metric = "cost" | "sessions" | "commits";

export default function HeatmapPage() {
  const [range, setRange] = useState("30d");
  const [metric, setMetric] = useState<Metric>("cost");
  const q = useQuery({
    queryKey: ["heatmap", range, metric],
    queryFn: () => api.heatmap(range, metric),
  });

  const cells = q.data ?? [];
  const max = cells.reduce((m, c) => Math.max(m, c.value), 0);
  const empty = max === 0;

  return (
    <div>
      <PageHeader
        eyebrow="heatmap"
        title="Peak hours"
        description="Day-of-week × hour. When does Claude spend concentrate?"
        actions={
          <div className="flex items-center gap-2">
            <MetricToggle value={metric} onChange={setMetric} />
            <RangePicker value={range} onChange={setRange} />
          </div>
        }
      />

      {empty ? (
        <EmptyState title="No signal yet" description="Sync to populate the heatmap." />
      ) : (
        <div className="card p-6">
          <div className="flex gap-3 overflow-x-auto">
            <div className="flex flex-col gap-1 pt-6">
              {DOW_LABELS.map((d) => (
                <div
                  key={d}
                  className="mono-label h-5 flex items-center"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-[720px]">
              <div className="grid grid-cols-24 gap-1 mb-1" style={{ gridTemplateColumns: "repeat(24, minmax(0,1fr))" }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div
                    key={h}
                    className="mono-label text-center"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                {DOW_LABELS.map((_, dow) => (
                  <div
                    key={dow}
                    className="grid gap-1"
                    style={{ gridTemplateColumns: "repeat(24, minmax(0,1fr))" }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => {
                      const cell = cells.find((c) => c.dow === dow && c.hour === h);
                      const v = cell?.value ?? 0;
                      const intensity = max > 0 ? v / max : 0;
                      const bg =
                        v === 0
                          ? "var(--color-surface-tint)"
                          : `rgba(10,114,239, ${0.1 + intensity * 0.8})`;
                      return (
                        <div
                          key={h}
                          title={`${DOW_LABELS[dow]} ${String(h).padStart(2, "0")}:00 — ${
                            metric === "cost" ? fmtUsd(v) : fmtNum(v)
                          }`}
                          className="h-5 rounded-[3px]"
                          style={{
                            background: bg,
                            boxShadow: v > 0 ? "inset 0 0 0 1px rgba(0,0,0,0.04)" : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-6">
            <span className="mono-label">low</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((i) => (
              <span
                key={i}
                className="inline-block h-3 w-5 rounded-[2px]"
                style={{ background: `rgba(10,114,239, ${i})` }}
              />
            ))}
            <span className="mono-label">high</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricToggle({ value, onChange }: { value: Metric; onChange: (m: Metric) => void }) {
  const opts: Metric[] = ["cost", "sessions", "commits"];
  return (
    <div className="card-flat inline-flex p-0.5">
      {opts.map((o) => {
        const active = o === value;
        return (
          <button
            type="button"
            key={o}
            onClick={() => onChange(o)}
            className="px-3 h-7 text-[13px] font-medium rounded-[4px] font-mono"
            style={{
              background: active ? "var(--color-ink)" : "transparent",
              color: active ? "var(--color-surface)" : "var(--color-ink-soft)",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
