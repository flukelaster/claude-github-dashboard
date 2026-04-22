import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import PageHeader from "../components/PageHeader";
import KpiCard from "../components/KpiCard";
import RangePicker from "../components/RangePicker";
import EmptyState from "../components/EmptyState";
import { api, fmtCompact, fmtNum, fmtPct, fmtUsd } from "../lib/api";
import { collectModels, modelColor } from "../lib/fmt";
import { TooltipCard } from "../components/ChartTooltip";

export default function OverviewPage() {
  const [range, setRange] = useState("30d");
  const ov = useQuery({ queryKey: ["overview", range], queryFn: () => api.overview(range) });
  const daily = useQuery({ queryKey: ["daily", range], queryFn: () => api.usageDaily(range) });
  const roiCfg = useQuery({ queryKey: ["roiConfig"], queryFn: api.getRoiConfig });

  const isEmpty = ov.data && ov.data.sessionCount === 0;

  const models = daily.data ? collectModels(daily.data) : [];

  return (
    <div>
      <PageHeader
        eyebrow="dashboard"
        title="Overview"
        description="Cross-reference Claude Code spend with shipped code. Cost per session, LOC attributed, AI-assisted ratio."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="card-flat px-4 py-3 mb-6 flex items-start gap-3">
        <span className="pill pill-develop shrink-0">estimate</span>
        <p className="body-sm" style={{ color: "var(--color-ink-muted)" }}>
          All USD figures are <strong>equivalent API cost</strong> computed from token counts × published Anthropic pricing.
          If you use Claude Code via a Max/Pro subscription, your actual billing is the subscription fee —
          this view shows what the same usage would cost at pay-as-you-go rates.
        </p>
      </div>

      {isEmpty ? (
        <EmptyState
          title="No Claude sessions detected"
          description="Open ~/.claude/projects/ should contain *.jsonl files. Run the sync button in the header once you've used Claude Code."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
            <KpiCard
              label="total cost"
              value={ov.data ? fmtUsd(ov.data.totalCostUsd) : "—"}
              sub={`${range} window`}
              accent="ship"
            />
            <KpiCard
              label="sessions"
              value={ov.data ? fmtNum(ov.data.sessionCount) : "—"}
              sub={
                ov.data && ov.data.sessionCount > 0
                  ? `${fmtUsd(ov.data.totalCostUsd / ov.data.sessionCount, 3)} / session`
                  : "—"
              }
              accent="develop"
            />
            <KpiCard
              label="loc attributed"
              value={ov.data ? fmtCompact(ov.data.locAttributed) : "—"}
              sub={
                ov.data?.costPerLoc != null
                  ? `${fmtUsd(ov.data.costPerLoc, 4)} / LOC`
                  : "requires git index"
              }
            />
            <KpiCard
              label="ai-assisted commits"
              value={ov.data ? fmtPct(ov.data.aiAssistedRatio) : "—"}
              sub={
                ov.data
                  ? `${fmtNum(ov.data.aiAssistedCommitCount)} of ${fmtNum(ov.data.commitCount)}`
                  : "—"
              }
              accent="preview"
            />
          </div>

          <RoiSection
            locAttributed={ov.data?.locAttributed ?? 0}
            totalCostUsd={ov.data?.totalCostUsd ?? 0}
            hourlyRate={roiCfg.data?.hourlyRate ?? 105}
            locPerHour={roiCfg.data?.locPerHour ?? 70}
            role={roiCfg.data?.role ?? "senior"}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-10">
            <div className="card p-5 xl:col-span-2">
              <div className="flex items-baseline justify-between mb-5">
                <div>
                  <div className="mono-label mb-1">spend by day</div>
                  <h3 className="display-card">Daily cost</h3>
                </div>
                <div className="body-sm" style={{ color: "var(--color-ink-muted)" }}>
                  {daily.data ? `${daily.data.length} days` : ""}
                </div>
              </div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={daily.data ?? []} margin={{ top: 0, right: 0, left: -12, bottom: 0 }}>
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
                    {models.map((m, i) => (
                      <Bar
                        key={m}
                        dataKey={(d) => d.byModel?.[m]?.costUsd ?? 0}
                        stackId="cost"
                        name={m}
                        fill={modelColor(i)}
                        radius={i === models.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={6}
                      wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-mono)" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <div className="mono-label mb-1">trendline</div>
              <h3 className="display-card mb-4">Cumulative cost</h3>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={cumulate(daily.data ?? [])}
                    margin={{ top: 0, right: 0, left: -12, bottom: 0 }}
                  >
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
                    <Line
                      type="monotone"
                      dataKey="cumCost"
                      stroke="var(--color-ink)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function cumulate<T extends { date: string; costUsd: number }>(data: T[]) {
  let c = 0;
  return data.map((d) => ({ ...d, cumCost: (c += d.costUsd) }));
}

function RoiSection({
  locAttributed,
  totalCostUsd,
  hourlyRate,
  locPerHour,
  role,
}: {
  locAttributed: number;
  totalCostUsd: number;
  hourlyRate: number;
  locPerHour: number;
  role: string;
}) {
  if (locAttributed === 0 || totalCostUsd === 0) return null;

  const timeSavedHr = locAttributed / locPerHour;
  const valueSaved = timeSavedHr * hourlyRate;
  const roiPct = ((valueSaved - totalCostUsd) / totalCostUsd) * 100;
  const multiplier = valueSaved / totalCostUsd;

  const roleLabel: Record<string, string> = {
    junior: "Junior (0–2 yr)",
    mid: "Mid (2–5 yr)",
    senior: "Senior (5+ yr)",
    lead: "Lead / Staff",
    custom: "Custom",
  };

  return (
    <div className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="mono-label mb-0.5" style={{ color: "var(--color-ink-muted)" }}>roi estimate</div>
          <h3 className="display-card">Time & value saved</h3>
        </div>
        <Link to="/settings" className="btn btn-secondary text-[12px]">
          Edit assumptions
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        <KpiCard
          label="time saved"
          value={`${fmtNum(timeSavedHr, 1)} hr`}
          sub={`${fmtNum(locAttributed)} LOC ÷ ${locPerHour} LOC/hr`}
          accent="develop"
        />
        <KpiCard
          label="value saved"
          value={fmtUsd(valueSaved, 0)}
          sub={`${fmtNum(timeSavedHr, 1)} hr × $${hourlyRate}/hr`}
          accent="develop"
        />
        <KpiCard
          label="roi"
          value={`+${fmtNum(roiPct, 0)}%`}
          sub={`${fmtNum(multiplier, 1)}× return on Claude spend`}
          accent="preview"
        />
        <KpiCard
          label="claude spend"
          value={fmtUsd(totalCostUsd)}
          sub={`vs ${fmtUsd(valueSaved, 0)} dev-time equivalent`}
          accent="ship"
        />
      </div>

      <div
        className="px-4 py-3 rounded-[6px] text-[12px] font-mono"
        style={{
          background: "var(--color-surface-tint)",
          boxShadow: "var(--shadow-ring-light)",
          color: "var(--color-ink-muted)",
        }}
      >
        <span className="pill pill-ink mr-2">methodology</span>
        Preset: <strong style={{ color: "var(--color-ink)" }}>{roleLabel[role] ?? role}</strong>
        {" · "}${hourlyRate}/hr (BLS OES May 2024, loaded ×1.3 ÷ 2,080 hr/yr)
        {" · "}{locPerHour} LOC/hr (McConnell <em>Code Complete</em> §28, focused session)
        {" · "}LOC = additions + deletions on AI-assisted commits (churn, not net)
        {" · "}
        <a
          href="https://www.bls.gov/oes/current/oes151252.htm"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-develop)" }}
        >
          BLS OES 15-1252
        </a>
      </div>
    </div>
  );
}
