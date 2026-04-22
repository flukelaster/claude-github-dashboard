import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Rect,
  Line,
} from "@react-pdf/renderer";
import type { DailyBucket, OverviewResponse } from "@cgd/shared";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PdfExportData {
  range: string;
  generatedAt: Date;
  overview: OverviewResponse;
  daily: DailyBucket[];
  roiConfig: {
    role: string;
    hourlyRate: number;
    locPerHour: number;
    currency: "USD" | "THB";
    fxRateToUsd: number;
  };
}

// ─── Colors (DESIGN.md) ───────────────────────────────────────────────────────
const C = {
  black: "#171717",
  white: "#ffffff",
  gray600: "#4d4d4d",
  gray400: "#808080",
  gray200: "#b3b3b3",
  gray100: "#ebebeb",
  gray50: "#fafafa",
  ship: "#ff5b4f",
  develop: "#0a72ef",
  preview: "#de1d8d",
  add: "#00c781",
} as const;

const MODEL_COLORS = ["#0070f3", "#7928ca", "#eb367f", "#ff5b4f", "#de1d8d", "#0a72ef"];
const modelColor = (i: number) => MODEL_COLORS[i % MODEL_COLORS.length]!;

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = {
  usd: (n: number, d = 2) =>
    isFinite(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}` : "—",
  num: (n: number, d = 0) =>
    isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—",
  pct: (n: number) => (isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—"),
  compact: (n: number) => {
    if (!isFinite(n)) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toFixed(0);
  },
  date: (s: string) => s.slice(5), // MM-DD
  month: (d: Date) =>
    d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
  tokens: (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toFixed(0);
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: C.white,
    paddingTop: 44,
    paddingBottom: 52,
    paddingLeft: 48,
    paddingRight: 48,
    fontSize: 10,
    color: C.black,
  },

  // ── Header ──
  reportMark: { fontSize: 7, letterSpacing: 1.8, color: C.gray400, marginBottom: 10 },
  reportTitle: { fontFamily: "Helvetica-Bold", fontSize: 26, color: C.black, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 3 },
  reportSub: { fontSize: 10, color: C.gray600, marginBottom: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.gray100, marginBottom: 16 },
  dividerDark: { borderBottomWidth: 1, borderBottomColor: C.black, marginBottom: 16 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  metaText: { fontSize: 8, color: C.gray400 },

  // ── Section ──
  sectionLabel: { fontSize: 7, letterSpacing: 1.5, color: C.gray400, marginBottom: 6 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 13, color: C.black, letterSpacing: -0.3, marginBottom: 10 },
  mb4: { marginBottom: 4 },
  mb8: { marginBottom: 8 },
  mb10: { marginBottom: 10 },
  mb16: { marginBottom: 16 },
  mb20: { marginBottom: 20 },
  mb28: { marginBottom: 28 },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  // ── KPI Boxes ──
  kpiRow: { flexDirection: "row", marginBottom: 6 },
  kpiBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.gray100,
    borderRadius: 5,
    padding: 11,
    backgroundColor: C.gray50,
  },
  kpiBoxMr: { marginRight: 8 },
  kpiAccent: { width: 16, height: 2, borderRadius: 1, marginBottom: 7 },
  kpiLabel: { fontSize: 7, letterSpacing: 1.2, color: C.gray400, marginBottom: 5 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 17, color: C.black, letterSpacing: -0.5, marginBottom: 3 },
  kpiSub: { fontSize: 7.5, color: C.gray400, lineHeight: 1.4 },

  // ── Table ──
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: C.black,
    paddingBottom: 5,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    paddingTop: 4,
    paddingBottom: 4,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: C.gray50,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 0.8, color: C.black },
  td: { fontFamily: "Helvetica", fontSize: 8.5, color: C.black },
  tdMuted: { fontFamily: "Helvetica", fontSize: 8.5, color: C.gray600 },

  // ── Methodology ──
  methBox: {
    backgroundColor: C.gray50,
    borderWidth: 1,
    borderColor: C.gray100,
    borderRadius: 5,
    padding: 12,
    marginBottom: 14,
  },
  methLabel: { fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.2, color: C.gray400, marginBottom: 5 },
  methText: { fontSize: 8.5, color: C.gray600, lineHeight: 1.6 },

  // ── Footer ──
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    paddingTop: 7,
  },
  footerText: { fontSize: 7, color: C.gray400 },

  // ── Pill ──
  pill: { backgroundColor: C.gray100, borderRadius: 3, paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5 },
  pillText: { fontFamily: "Helvetica-Bold", fontSize: 6, letterSpacing: 0.8, color: C.gray600 },

  // ── Callout ──
  callout: {
    backgroundColor: C.gray50,
    borderLeftWidth: 2,
    borderLeftColor: C.develop,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 14,
    borderRadius: 3,
  },
  calloutText: { fontSize: 8.5, color: C.gray600, lineHeight: 1.5 },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function collectModels(daily: DailyBucket[]): string[] {
  const s = new Set<string>();
  for (const d of daily) for (const m of Object.keys(d.byModel ?? {})) s.add(m);
  return Array.from(s).sort();
}

function modelTotals(daily: DailyBucket[]) {
  const out: Record<string, { costUsd: number; inputTokens: number; outputTokens: number }> = {};
  for (const d of daily) {
    for (const [m, v] of Object.entries(d.byModel ?? {})) {
      const x = v as { costUsd: number; inputTokens: number; outputTokens: number };
      if (!out[m]) out[m] = { costUsd: 0, inputTokens: 0, outputTokens: 0 };
      out[m]!.costUsd += x.costUsd;
      out[m]!.inputTokens += x.inputTokens;
      out[m]!.outputTokens += x.outputTokens;
    }
  }
  return Object.entries(out).sort((a, b) => b[1].costUsd - a[1].costUsd);
}

function rangeLabel(range: string): string {
  const n = parseInt(range);
  if (n === 7) return "Last 7 days";
  if (n === 30) return "Last 30 days";
  if (n === 90) return "Last 90 days";
  if (n === 180) return "Last 180 days";
  if (n === 365) return "Last 365 days";
  return `Last ${n} days`;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    junior: "Junior Developer",
    mid: "Mid-level Developer",
    senior: "Senior Developer",
    lead: "Lead / Staff Engineer",
    custom: "Custom Rate",
  };
  return map[role] ?? role;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ReportHeader({ data }: { data: PdfExportData }) {
  const days = parseInt(data.range);
  const start = new Date(data.generatedAt);
  start.setDate(start.getDate() - days);

  return (
    <View style={s.mb20}>
      <Text style={s.reportMark}>PERFORMANCE REPORT</Text>
      <View style={s.spaceBetween}>
        <Text style={s.reportTitle}>Claude × GitHub</Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 8, color: C.gray400, marginBottom: 2 }}>GENERATED</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: C.black }}>
            {fmt.month(data.generatedAt)}
          </Text>
        </View>
      </View>
      <Text style={s.reportSub}>AI-Assisted Development Analytics</Text>
      <View style={s.dividerDark} />
      <View style={s.metaRow}>
        <Text style={s.metaText}>
          Period: {fmt.month(start)} – {fmt.month(data.generatedAt)}{"  ·  "}{rangeLabel(data.range)}
        </Text>
        <Text style={s.metaText}>Claude Code + GitHub correlation</Text>
      </View>
    </View>
  );
}

function KpiBox({
  label, value, sub, accent, last,
}: {
  label: string; value: string; sub: string; accent?: string; last?: boolean;
}) {
  return (
    <View style={[s.kpiBox, last ? {} : s.kpiBoxMr]}>
      <View style={[s.kpiAccent, { backgroundColor: accent ?? C.gray200 }]} />
      <Text style={s.kpiLabel}>{label.toUpperCase()}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiSub}>{sub}</Text>
    </View>
  );
}

function ExecutiveSummary({ overview, range }: { overview: OverviewResponse; range: string }) {
  const costPerSession = overview.sessionCount > 0 ? overview.totalCostUsd / overview.sessionCount : 0;

  return (
    <View style={s.mb28} wrap={false}>
      <Text style={s.sectionLabel}>EXECUTIVE SUMMARY</Text>
      <View style={s.divider} />
      <View style={s.kpiRow}>
        <KpiBox
          label="Total Cost"
          value={fmt.usd(overview.totalCostUsd)}
          sub={`${rangeLabel(range)} · equivalent API cost`}
          accent={C.ship}
        />
        <KpiBox
          label="Sessions"
          value={fmt.num(overview.sessionCount)}
          sub={overview.sessionCount > 0 ? `${fmt.usd(costPerSession, 3)} avg per session` : "—"}
          accent={C.develop}
        />
        <KpiBox
          label="LOC Attributed"
          value={fmt.compact(overview.locAttributed)}
          sub={
            overview.costPerLoc != null
              ? `${fmt.usd(overview.costPerLoc, 4)} per line`
              : "requires git index"
          }
          accent={C.gray400}
        />
        <KpiBox
          label="AI-Assisted"
          value={fmt.pct(overview.aiAssistedRatio)}
          sub={`${fmt.num(overview.aiAssistedCommitCount)} of ${fmt.num(overview.commitCount)} commits`}
          accent={C.preview}
          last
        />
      </View>

      <View style={[s.callout, { marginTop: 8 }]}>
        <Text style={s.calloutText}>
          {"All USD figures are equivalent API cost computed from token counts × published Anthropic pricing. "}
          {"For Max / Pro subscription users, actual billing is the flat fee — this report shows the pay-as-you-go equivalent."}
        </Text>
      </View>
    </View>
  );
}

function RoiSection({ data }: { data: PdfExportData }) {
  const { overview, roiConfig } = data;
  if (overview.locAttributed === 0 || overview.totalCostUsd === 0) return null;

  const sym = roiConfig.currency === "THB" ? "฿" : "$";
  const timeSavedHr = overview.locAttributed / roiConfig.locPerHour;
  const valueSaved = timeSavedHr * roiConfig.hourlyRate;
  const valueSavedUsd = valueSaved / roiConfig.fxRateToUsd;
  const roiPct = ((valueSavedUsd - overview.totalCostUsd) / overview.totalCostUsd) * 100;
  const multiplier = valueSavedUsd / overview.totalCostUsd;
  const rateUsd = roiConfig.fxRateToUsd !== 1 ? ` ≈ $${(roiConfig.hourlyRate / roiConfig.fxRateToUsd).toFixed(1)}/hr USD` : "";

  return (
    <View style={s.mb28} wrap={false}>
      <View style={[s.spaceBetween, s.mb4]}>
        <Text style={s.sectionLabel}>ROI ESTIMATE</Text>
        <Text style={{ fontSize: 7, color: C.gray400 }}>{roleLabel(roiConfig.role)} · JobsDB Thailand 2024</Text>
      </View>
      <View style={s.divider} />

      <View style={s.kpiRow}>
        <KpiBox
          label="Time Saved"
          value={`${fmt.num(timeSavedHr, 1)} hr`}
          sub={`${fmt.compact(overview.locAttributed)} LOC ÷ ${roiConfig.locPerHour} LOC/hr`}
          accent={C.develop}
        />
        <KpiBox
          label="Value Saved"
          value={`${sym}${fmt.num(valueSaved, 0)}`}
          sub={`${fmt.num(timeSavedHr, 1)} hr × ${sym}${roiConfig.hourlyRate}/hr`}
          accent={C.develop}
        />
        <KpiBox
          label="Return on Investment"
          value={`+${fmt.num(roiPct, 0)}%`}
          sub={`${fmt.num(multiplier, 1)}× return on Claude spend`}
          accent={C.add}
        />
        <KpiBox
          label="Claude Spend"
          value={fmt.usd(overview.totalCostUsd)}
          sub={`vs ${sym}${fmt.num(valueSaved, 0)} dev-time value`}
          accent={C.ship}
          last
        />
      </View>

      <View style={s.methBox}>
        <Text style={s.methLabel}>METHODOLOGY</Text>
        <Text style={s.methText}>
          {`Rate: ${sym}${roiConfig.hourlyRate}/hr${rateUsd}  ·  Productivity: ${roiConfig.locPerHour} LOC/hr (McConnell Code Complete §28)\n`}
          {"LOC = additions + deletions on AI-assisted commits (gross churn, not net delta)\n"}
          {`Time saved = LOC attributed ÷ LOC/hr  ·  Value saved = time × rate  ·  ROI = (value${roiConfig.currency !== "USD" ? " in USD" : ""} − cost) ÷ cost`}
        </Text>
      </View>
    </View>
  );
}

function DailyChart({ daily }: { daily: DailyBucket[] }) {
  if (daily.length === 0) return null;
  const W = 499;
  const H = 72;
  const n = daily.length;
  const gap = n > 60 ? 1 : 2;
  const barW = Math.max(1.5, (W - (n - 1) * gap) / n);
  const maxCost = Math.max(...daily.map((d) => d.costUsd), 0.0001);
  const models = collectModels(daily);

  return (
    <View style={s.mb20}>
      <Text style={s.sectionLabel}>DAILY COST — STACKED BY MODEL</Text>
      <View style={s.divider} />
      <Svg width={W} height={H + 1}>
        {daily.map((d, i) => {
          let yOffset = H;
          const x = i * (barW + gap);
          return models.map((m, mi) => {
            const cost = (d.byModel?.[m] as { costUsd: number } | undefined)?.costUsd ?? 0;
            const bh = Math.max(0, (cost / maxCost) * H);
            yOffset -= bh;
            return (
              <Rect
                key={`${i}-${m}`}
                x={x}
                y={yOffset}
                width={barW}
                height={bh}
                fill={modelColor(mi)}
              />
            );
          });
        })}
        <Line x1={0} y1={H} x2={W} y2={H} stroke={C.gray200} strokeWidth={0.5} />
      </Svg>

      {/* Legend */}
      <View style={[s.row, { flexWrap: "wrap", marginTop: 6 }]}>
        {models.map((m, i) => (
          <View key={m} style={[s.row, { alignItems: "center", marginRight: 14, marginBottom: 3 }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: modelColor(i), marginRight: 4 }} />
            <Text style={{ fontSize: 7, color: C.gray600 }}>{m}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DailyTable({ daily }: { daily: DailyBucket[] }) {
  const cols = { date: 1.8, cost: 1.3, sessions: 0.8, input: 1.3, output: 1.3, cacheR: 1.3, cacheW: 1.3 };

  return (
    <View style={s.mb28}>
      <View wrap={false}>
        <Text style={s.sectionLabel}>DAILY BREAKDOWN</Text>
        <View style={s.divider} />
      </View>
      <View style={[s.tableHeaderRow, { marginBottom: 0 }]} wrap={false}>
        <Text style={[s.th, { flex: cols.date }]}>Date</Text>
        <Text style={[s.th, { flex: cols.cost, textAlign: "right" }]}>Cost</Text>
        <Text style={[s.th, { flex: cols.sessions, textAlign: "right" }]}>Sess.</Text>
        <Text style={[s.th, { flex: cols.input, textAlign: "right" }]}>Input T.</Text>
        <Text style={[s.th, { flex: cols.output, textAlign: "right" }]}>Output T.</Text>
        <Text style={[s.th, { flex: cols.cacheR, textAlign: "right" }]}>Cache R.</Text>
        <Text style={[s.th, { flex: cols.cacheW, textAlign: "right" }]}>Cache W.</Text>
      </View>

      {daily.map((d, i) => {
        const RowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
        return (
          <View key={d.date} style={RowStyle}>
            <Text style={[s.td, { flex: cols.date }]}>{d.date}</Text>
            <Text style={[s.td, { flex: cols.cost, textAlign: "right" }]}>{fmt.usd(d.costUsd, 4)}</Text>
            <Text style={[s.tdMuted, { flex: cols.sessions, textAlign: "right" }]}>—</Text>
            <Text style={[s.tdMuted, { flex: cols.input, textAlign: "right" }]}>{fmt.tokens(d.inputTokens)}</Text>
            <Text style={[s.tdMuted, { flex: cols.output, textAlign: "right" }]}>{fmt.tokens(d.outputTokens)}</Text>
            <Text style={[s.tdMuted, { flex: cols.cacheR, textAlign: "right" }]}>{fmt.tokens(d.cacheReadTokens)}</Text>
            <Text style={[s.tdMuted, { flex: cols.cacheW, textAlign: "right" }]}>{fmt.tokens(d.cacheWriteTokens)}</Text>
          </View>
        );
      })}

      {/* Totals row */}
      {daily.length > 0 && (() => {
        const totals = daily.reduce(
          (acc, d) => ({
            cost: acc.cost + d.costUsd,
            input: acc.input + d.inputTokens,
            output: acc.output + d.outputTokens,
            cacheR: acc.cacheR + d.cacheReadTokens,
            cacheW: acc.cacheW + d.cacheWriteTokens,
          }),
          { cost: 0, input: 0, output: 0, cacheR: 0, cacheW: 0 },
        );
        return (
          <View style={[s.tableRow, { borderTopWidth: 1.5, borderTopColor: C.black }]}>
            <Text style={[s.th, { flex: cols.date, fontSize: 8 }]}>TOTAL ({daily.length}d)</Text>
            <Text style={[s.th, { flex: cols.cost, textAlign: "right", fontSize: 8 }]}>{fmt.usd(totals.cost)}</Text>
            <Text style={[s.th, { flex: cols.sessions, textAlign: "right", fontSize: 8 }]}>—</Text>
            <Text style={[s.th, { flex: cols.input, textAlign: "right", fontSize: 8 }]}>{fmt.tokens(totals.input)}</Text>
            <Text style={[s.th, { flex: cols.output, textAlign: "right", fontSize: 8 }]}>{fmt.tokens(totals.output)}</Text>
            <Text style={[s.th, { flex: cols.cacheR, textAlign: "right", fontSize: 8 }]}>{fmt.tokens(totals.cacheR)}</Text>
            <Text style={[s.th, { flex: cols.cacheW, textAlign: "right", fontSize: 8 }]}>{fmt.tokens(totals.cacheW)}</Text>
          </View>
        );
      })()}
    </View>
  );
}

function TokenSummary({ overview }: { overview: OverviewResponse }) {
  const total =
    overview.totalInputTokens +
    overview.totalOutputTokens +
    overview.totalCacheReadTokens +
    overview.totalCacheWriteTokens;

  return (
    <View style={s.mb28} wrap={false}>
      <Text style={s.sectionLabel}>TOKEN USAGE SUMMARY</Text>
      <View style={s.divider} />

      <View style={s.kpiRow}>
        <KpiBox
          label="Input Tokens"
          value={fmt.tokens(overview.totalInputTokens)}
          sub={`${((overview.totalInputTokens / total) * 100).toFixed(1)}% of total tokens`}
          accent={C.develop}
        />
        <KpiBox
          label="Output Tokens"
          value={fmt.tokens(overview.totalOutputTokens)}
          sub={`${((overview.totalOutputTokens / total) * 100).toFixed(1)}% of total tokens`}
          accent={C.preview}
        />
        <KpiBox
          label="Cache Read"
          value={fmt.tokens(overview.totalCacheReadTokens)}
          sub="0.10× input cost — high cache hit = efficient"
          accent={C.add}
        />
        <KpiBox
          label="Cache Write"
          value={fmt.tokens(overview.totalCacheWriteTokens)}
          sub="3.75× input cost — one-time prompt caching"
          accent={C.ship}
          last
        />
      </View>
    </View>
  );
}

function ModelBreakdown({ daily, totalCost }: { daily: DailyBucket[]; totalCost: number }) {
  const totals = modelTotals(daily);
  if (totals.length === 0) return null;

  return (
    <View style={s.mb28} wrap={false}>
      <Text style={s.sectionLabel}>MODEL COST BREAKDOWN</Text>
      <View style={s.divider} />

      <View style={s.tableHeaderRow}>
        <Text style={[s.th, { flex: 4 }]}>Model</Text>
        <Text style={[s.th, { flex: 1.5, textAlign: "right" }]}>Cost</Text>
        <Text style={[s.th, { flex: 1.5, textAlign: "right" }]}>Share</Text>
        <Text style={[s.th, { flex: 1.5, textAlign: "right" }]}>Input T.</Text>
        <Text style={[s.th, { flex: 1.5, textAlign: "right" }]}>Output T.</Text>
      </View>

      {totals.map(([model, v], i) => (
        <View key={model} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <View style={{ flex: 4, flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: modelColor(i), marginRight: 6 }} />
            <Text style={[s.td, { fontSize: 8 }]}>{model}</Text>
          </View>
          <Text style={[s.td, { flex: 1.5, textAlign: "right" }]}>{fmt.usd(v.costUsd)}</Text>
          <Text style={[s.td, { flex: 1.5, textAlign: "right" }]}>
            {totalCost > 0 ? `${((v.costUsd / totalCost) * 100).toFixed(1)}%` : "—"}
          </Text>
          <Text style={[s.tdMuted, { flex: 1.5, textAlign: "right" }]}>{fmt.tokens(v.inputTokens)}</Text>
          <Text style={[s.tdMuted, { flex: 1.5, textAlign: "right" }]}>{fmt.tokens(v.outputTokens)}</Text>
        </View>
      ))}
    </View>
  );
}

function Methodology({ data }: { data: PdfExportData }) {
  const { roiConfig } = data;
  const sym = roiConfig.currency === "THB" ? "฿" : "$";

  return (
    <View>
      <Text style={s.sectionLabel}>METHODOLOGY & DISCLAIMERS</Text>
      <View style={s.divider} />

      <View style={s.methBox} wrap={false}>
        <Text style={s.methLabel}>COST CALCULATION</Text>
        <Text style={s.methText}>
          {"Costs are computed from raw token counts × Anthropic published pricing per model tier. "}
          {"Cache read tokens are billed at 0.10× standard input rate. Cache write tokens at 3.75× standard input rate. "}
          {"All figures represent equivalent pay-as-you-go API cost — not actual subscription billing for Max or Pro plan users."}
        </Text>
      </View>

      <View style={s.methBox} wrap={false}>
        <Text style={s.methLabel}>AI-ASSIST DETECTION</Text>
        <Text style={s.methText}>
          {"Each (session × commit) pair is scored on four signals:\n"}
          {"  Co-Authored-By: Claude trailer in commit  +50 pts\n"}
          {"  File overlap ≥ 50%  +30 pts  ·  20–50%  +15 pts\n"}
          {"  Time proximity (0–15 min)  up to +15 pts\n"}
          {"  Matching git branch  +5 pts\n"}
          {"Threshold: Medium ≥ 40  ·  High ≥ 70. Only commits meeting Medium threshold are included in LOC attribution."}
        </Text>
      </View>

      <View style={s.methBox} wrap={false}>
        <Text style={s.methLabel}>RATE CARD</Text>
        <Text style={s.methText}>
          {`Role: ${roleLabel(roiConfig.role)}  ·  Rate: ${sym}${roiConfig.hourlyRate}/hr`}
          {roiConfig.currency !== "USD" ? `  ≈  $${(roiConfig.hourlyRate / roiConfig.fxRateToUsd).toFixed(2)}/hr USD (FX: ${roiConfig.fxRateToUsd} ${roiConfig.currency}/USD)` : ""}
          {`\nProductivity baseline: ${roiConfig.locPerHour} LOC/hr — from McConnell, Code Complete 2nd Ed., Chapter 28\n`}
          {"Source: JobsDB Thailand Salary Guide 2024, Bangkok IT market. Median salary × 1.3 loaded cost (SSO 5% + PVD 5% + benefits) ÷ 2,080 hr/yr."}
        </Text>
      </View>

      <View style={s.methBox} wrap={false}>
        <Text style={s.methLabel}>DATA SOURCES</Text>
        <Text style={s.methText}>
          {"Claude session data: ~/.claude/projects/**/*.jsonl — parsed locally, never transmitted\n"}
          {"Git data: local repository indexing via simple-git\n"}
          {"GitHub data: GraphQL API (commits, PRs, Linguist language stats) — only when GitHub token is configured\n"}
          {"All processing runs on local machine. No analytics, telemetry, or third-party reporting."}
        </Text>
      </View>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Claude × GitHub Performance Report</Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `Equivalent API cost — not actual billing   ·   Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────
export function ReportPdf({ data }: { data: PdfExportData }) {
  const hasRoi = data.overview.locAttributed > 0 && data.overview.totalCostUsd > 0;

  return (
    <Document
      title="Claude × GitHub Performance Report"
      author="Claude × GitHub Dashboard"
      subject={`${rangeLabel(data.range)} — generated ${fmt.month(data.generatedAt)}`}
      creator="claude-github-dashboard"
    >
      {/* Page 1: Summary */}
      <Page size="A4" style={s.page}>
        <ReportHeader data={data} />
        <ExecutiveSummary overview={data.overview} range={data.range} />
        {hasRoi && <RoiSection data={data} />}
        <DailyChart daily={data.daily} />
        <PageFooter />
      </Page>

      {/* Page 2+: Detailed data */}
      <Page size="A4" style={s.page}>
        <Text style={[s.reportMark, { marginBottom: 20 }]}>DETAILED DATA</Text>
        <DailyTable daily={data.daily} />
        <TokenSummary overview={data.overview} />
        <ModelBreakdown daily={data.daily} totalCost={data.overview.totalCostUsd} />
        <Methodology data={data} />
        <PageFooter />
      </Page>
    </Document>
  );
}
