import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import RangePicker from "./RangePicker";
import { TooltipCard } from "./ChartTooltip";
import { api, fmtNum } from "../lib/api";

export default function LocDailyChart() {
  const [range, setRange] = useState("30d");
  const q = useQuery({ queryKey: ["locDaily", range], queryFn: () => api.locDaily(range) });
  const data = q.data ?? [];

  // Transform: deletions become negative so bars render below zero
  const chartData = data.map((d) => ({
    ...d,
    deletionsNeg: -d.deletions,
  }));

  const totalAdds = data.reduce((s, d) => s + d.additions, 0);
  const totalDels = data.reduce((s, d) => s + d.deletions, 0);
  const net = totalAdds - totalDels;
  const peakDay = data.reduce((m, d) => (d.additions + d.deletions > m.adds + m.dels ? { date: d.date, adds: d.additions, dels: d.deletions } : m), { date: "—", adds: 0, dels: 0 });
  const activeDays = data.filter((d) => d.commitCount > 0).length;

  return (
    <section className="card p-5 mb-8">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="mono-label mb-1">loc churn</div>
          <h3 className="display-card">Daily additions & deletions</h3>
          <p className="body-sm mt-1" style={{ color: "var(--color-ink-muted)" }}>
            Commits aggregated across all repos. Green above zero = added. Red below = removed.
          </p>
        </div>
        <RangePicker value={range} onChange={setRange} options={["30d", "90d", "180d"]} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Mini label="added" value={`+${fmtNum(totalAdds)}`} color="var(--color-add)" />
        <Mini label="removed" value={`−${fmtNum(totalDels)}`} color="var(--color-remove)" />
        <Mini
          label="net"
          value={`${net >= 0 ? "+" : ""}${fmtNum(net)}`}
          color={net >= 0 ? "var(--color-ink)" : "var(--color-remove)"}
        />
        <Mini label="active days" value={`${activeDays} / ${data.length}`} />
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} stackOffset="sign">
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: "var(--color-line)" }}
              tickFormatter={(d: string) => d.slice(5)}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmtNum(Math.abs(v))}
              width={56}
            />
            <ReferenceLine y={0} stroke="var(--color-line-strong)" />
            <Tooltip
              cursor={{ fill: "rgba(10,114,239,0.06)" }}
              content={
                <TooltipCard
                  formatter={(v, name) => {
                    const n = Math.abs(Number(v));
                    if (name === "additions") return `+${fmtNum(n)}`;
                    if (name === "deletions") return `−${fmtNum(n)}`;
                    return fmtNum(n);
                  }}
                />
              }
            />
            <Bar dataKey="additions" name="additions" fill="var(--color-add)" radius={[3, 3, 0, 0]}>
              {chartData.map((d) => (
                <Cell key={d.date} fill="var(--color-add)" />
              ))}
            </Bar>
            <Bar dataKey="deletionsNeg" name="deletions" fill="var(--color-remove)" radius={[0, 0, 3, 3]}>
              {chartData.map((d) => (
                <Cell key={d.date} fill="var(--color-remove)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {peakDay.date !== "—" && (
        <div
          className="mt-4 mono-label flex items-center justify-end gap-2"
          style={{ color: "var(--color-ink-muted)" }}
        >
          peak {peakDay.date}: <span style={{ color: "var(--color-add)" }}>+{fmtNum(peakDay.adds)}</span>{" "}
          <span style={{ color: "var(--color-remove)" }}>−{fmtNum(peakDay.dels)}</span>
        </div>
      )}
    </section>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card-flat p-3">
      <div className="mono-label mb-1.5" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      <div
        className="text-[18px] font-semibold"
        style={{
          letterSpacing: "-0.6px",
          fontVariantNumeric: "tabular-nums",
          color: color ?? "var(--color-ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
