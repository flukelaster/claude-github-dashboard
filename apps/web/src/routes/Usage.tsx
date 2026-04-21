import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "../components/PageHeader";
import RangePicker from "../components/RangePicker";
import EmptyState from "../components/EmptyState";
import { api, fmtCompact, fmtNum, fmtUsd } from "../lib/api";
import { TooltipCard } from "../components/ChartTooltip";

const MODEL_COLORS = ["#0070f3", "#7928ca", "#eb367f", "#ff5b4f", "#de1d8d", "#0a72ef"];

export default function UsagePage() {
  const [range, setRange] = useState("30d");
  const daily = useQuery({ queryKey: ["daily", range], queryFn: () => api.usageDaily(range) });
  const data = daily.data ?? [];
  const models = collectModels(data);

  const totalCost = data.reduce((s, d) => s + d.costUsd, 0);
  const totalInput = data.reduce((s, d) => s + d.inputTokens, 0);
  const totalOutput = data.reduce((s, d) => s + d.outputTokens, 0);
  const totalCacheR = data.reduce((s, d) => s + d.cacheReadTokens, 0);
  const totalCacheW = data.reduce((s, d) => s + d.cacheWriteTokens, 0);

  const empty = data.every((d) => d.costUsd === 0);

  return (
    <div>
      <PageHeader
        eyebrow="usage"
        title="Tokens & Cost"
        description="Daily input / output / cache token breakdown, stacked by model."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <StatCell label="cost" value={fmtUsd(totalCost)} />
        <StatCell label="input" value={fmtCompact(totalInput)} />
        <StatCell label="output" value={fmtCompact(totalOutput)} />
        <StatCell label="cache read" value={fmtCompact(totalCacheR)} />
        <StatCell label="cache write" value={fmtCompact(totalCacheW)} />
      </div>

      {empty ? (
        <EmptyState title="No usage in this range" description="Try a longer window or run Sync." />
      ) : (
        <>
          <div className="card p-5 mb-8">
            <div className="flex items-baseline justify-between mb-5">
              <div>
                <div className="mono-label mb-1">cost · stacked by model</div>
                <h3 className="display-card">Daily cost</h3>
              </div>
            </div>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 0, right: 0, left: -12, bottom: 0 }}>
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
                  <Tooltip content={<TooltipCard formatter={(v) => fmtUsd(Number(v))} />} cursor={{ fill: "rgba(10,114,239,0.06)" }} />
                  <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-mono)" }} />
                  {models.map((m, i) => (
                    <Bar
                      key={m}
                      dataKey={(d) => d.byModel?.[m]?.costUsd ?? 0}
                      stackId="cost"
                      name={m}
                      fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                      radius={i === models.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-flat overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left" style={{ background: "var(--color-surface-tint)" }}>
                  <Th>Date</Th>
                  <Th right>Cost</Th>
                  <Th right>Input</Th>
                  <Th right>Output</Th>
                  <Th right>Cache R</Th>
                  <Th right>Cache W</Th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((d) => (
                  <tr key={d.date} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                    <Td mono>{d.date}</Td>
                    <Td right>{fmtUsd(d.costUsd)}</Td>
                    <Td right>{fmtNum(d.inputTokens)}</Td>
                    <Td right>{fmtNum(d.outputTokens)}</Td>
                    <Td right>{fmtNum(d.cacheReadTokens)}</Td>
                    <Td right>{fmtNum(d.cacheWriteTokens)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-flat p-4">
      <div className="mono-label mb-2" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      <div className="text-[22px] font-semibold" style={{ letterSpacing: "-0.88px", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-2.5 font-mono uppercase text-[11px] ${right ? "text-right" : ""}`}
      style={{ color: "var(--color-ink-muted)", fontWeight: 500 }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right = false,
  mono = false,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2.5 ${right ? "text-right" : ""} ${mono ? "font-mono" : ""}`}
      style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </td>
  );
}

function collectModels(data: { byModel: Record<string, unknown> }[]): string[] {
  const s = new Set<string>();
  for (const d of data) for (const m of Object.keys(d.byModel)) s.add(m);
  return Array.from(s).sort();
}
