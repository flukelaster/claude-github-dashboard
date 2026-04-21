import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
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

  const { chartData, totals, peakDay, activeDays } = useMemo(() => {
    let totalAdds = 0;
    let totalDels = 0;
    let active = 0;
    let peak = { date: "—", adds: 0, dels: 0 };
    const mapped = data.map((d) => {
      totalAdds += d.additions;
      totalDels += d.deletions;
      if (d.commitCount > 0) active++;
      if (d.additions + d.deletions > peak.adds + peak.dels) {
        peak = { date: d.date, adds: d.additions, dels: d.deletions };
      }
      return { ...d, deletionsNeg: -d.deletions };
    });
    return {
      chartData: mapped,
      totals: { adds: totalAdds, dels: totalDels, net: totalAdds - totalDels },
      peakDay: peak,
      activeDays: active,
    };
  }, [data]);

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
        <Mini label="added" value={`+${fmtNum(totals.adds)}`} color="var(--color-add)" />
        <Mini label="removed" value={`−${fmtNum(totals.dels)}`} color="var(--color-remove)" />
        <Mini
          label="net"
          value={`${totals.net >= 0 ? "+" : ""}${fmtNum(totals.net)}`}
          color={totals.net >= 0 ? "var(--color-ink)" : "var(--color-remove)"}
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
            <Bar dataKey="additions" name="additions" fill="var(--color-add)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="deletionsNeg" name="deletions" fill="var(--color-remove)" radius={[0, 0, 3, 3]} />
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
