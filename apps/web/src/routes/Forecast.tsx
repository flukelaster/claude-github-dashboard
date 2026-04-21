import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "../components/PageHeader";
import RangePicker from "../components/RangePicker";
import KpiCard from "../components/KpiCard";
import { api, fmtUsd } from "../lib/api";
import { TooltipCard } from "../components/ChartTooltip";

export default function ForecastPage() {
  const [range, setRange] = useState("30d");
  const q = useQuery({ queryKey: ["forecast", range], queryFn: () => api.forecast(range) });
  const data = q.data;

  return (
    <div>
      <PageHeader
        eyebrow="forecast"
        title="Burn rate"
        description="Project cost forward from recent 7-day average. No budget locked in yet — treat as signal, not promise."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard label="avg / day" value={data ? fmtUsd(data.avgDailyCost) : "—"} accent="develop" />
        <KpiCard label="last 7d avg" value={data ? fmtUsd(data.last7DailyCost) : "—"} accent="preview" />
        <KpiCard
          label="projected / month"
          value={data ? fmtUsd(data.projectedMonthlyCost) : "—"}
          sub="based on last-7 rate"
          accent="ship"
        />
      </div>

      <div className="card p-5">
        <div className="mono-label mb-1">30-day runway</div>
        <h3 className="display-card mb-4">Cumulative projection</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <AreaChart data={data?.runway ?? []} margin={{ top: 0, right: 0, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0a72ef" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0a72ef" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={{ stroke: "var(--color-line)" }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                width={56}
              />
              <Tooltip content={<TooltipCard formatter={(v) => fmtUsd(Number(v))} />} />
              <Area
                type="monotone"
                dataKey="projectedCostUsd"
                stroke="#0a72ef"
                strokeWidth={2}
                fill="url(#forecastGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
