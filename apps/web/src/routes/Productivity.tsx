import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import PageHeader from "../components/PageHeader";
import RangePicker from "../components/RangePicker";
import KpiCard from "../components/KpiCard";
import EmptyState from "../components/EmptyState";
import { api, fmtCompact, fmtNum, fmtUsd } from "../lib/api";
import { TooltipCard } from "../components/ChartTooltip";

export default function ProductivityPage() {
  const [range, setRange] = useState("30d");
  const p = useQuery({ queryKey: ["productivity", range], queryFn: () => api.productivity(range) });

  const empty = p.data && p.data.totalLoc === 0;

  return (
    <div>
      <PageHeader
        eyebrow="productivity"
        title="Output per dollar"
        description="LOC merged (AI-assisted) ÷ Claude cost. Scatter ranks daily efficiency — top-left is cheap, high-volume days."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="loc per $"
          value={p.data?.locPerDollar != null ? fmtNum(p.data.locPerDollar, 1) : "—"}
          sub={range}
          accent="develop"
        />
        <KpiCard label="total loc (ai)" value={p.data ? fmtCompact(p.data.totalLoc) : "—"} accent="preview" />
        <KpiCard label="total cost" value={p.data ? fmtUsd(p.data.totalCost) : "—"} accent="ship" />
      </div>

      {empty ? (
        <EmptyState
          title="No AI-attributed LOC yet"
          description="Requires git + correlation to run. Ensure Sync finishes cleanly and commits use Co-Authored-By: Claude."
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="mono-label mb-1">efficiency trend</div>
            <h3 className="display-card mb-4">LOC per $ · daily</h3>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={p.data?.daily ?? []} margin={{ top: 0, right: 0, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-line)" }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis tickLine={false} axisLine={false} width={56} />
                  <Tooltip content={<TooltipCard formatter={(v) => fmtNum(Number(v), 1)} />} />
                  <Line
                    type="monotone"
                    dataKey="locPerDollar"
                    stroke="var(--color-develop)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "var(--color-develop)", strokeWidth: 0 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-5">
            <div className="mono-label mb-1">cost vs loc</div>
            <h3 className="display-card mb-4">Daily scatter</h3>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 0, right: 0, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line)" />
                  <XAxis
                    type="number"
                    dataKey="costUsd"
                    name="cost"
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-line)" }}
                    tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  />
                  <YAxis
                    type="number"
                    dataKey="loc"
                    name="loc"
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-line)" }}
                    width={56}
                  />
                  <ZAxis type="number" dataKey="locPerDollar" range={[40, 200]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3", stroke: "var(--color-line)" }}
                    content={<TooltipCard formatter={(v, n) => (n === "cost" ? fmtUsd(Number(v)) : fmtNum(Number(v)))} />}
                  />
                  <Scatter data={p.data?.daily ?? []} fill="var(--color-preview)" fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
