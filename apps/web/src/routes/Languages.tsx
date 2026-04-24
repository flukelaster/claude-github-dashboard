import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import LangIcon from "../components/LangIcon";
import StatCard from "../components/StatCard";
import { api, fmtCompact, fmtNum, fmtPct } from "../lib/api";
import { fmtBytes, shortenPath } from "../lib/fmt";

export default function LanguagesPage() {
  const q = useQuery({ queryKey: ["languages"], queryFn: () => api.languages() });
  const data = q.data;

  if (!data) {
    return (
      <div>
        <PageHeader eyebrow="languages" title="Languages" description="Loading…" />
      </div>
    );
  }

  if (data.totalBytes === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="languages"
          title="Languages"
          description="GitHub Linguist data per repo. Requires GitHub token + at least one successful sync."
        />
        <EmptyState
          title="No language data"
          description="Set a GitHub token in Settings and run Sync. Languages come from GitHub's Linguist."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="languages"
        title="Languages"
        description="Source code distribution across all indexed repos. Bytes from GitHub Linguist; lines counted from local working trees."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="languages" value={String(data.languages.length)} />
        <StatCard label="total source" value={fmtBytes(data.totalBytes)} />
        <StatCard label="total LOC" value={fmtCompact(data.totalLoc)} />
        <StatCard
          label="top language"
          value={
            data.languages[0]
              ? `${data.languages[0].language} · ${fmtPct(data.languages[0].ratio)}`
              : "—"
          }
        />
      </div>

      <section className="card p-5 mb-8">
        <div className="mono-label mb-1">aggregate</div>
        <h3 className="display-card mb-4">Across all repos</h3>

        <StackedBar
          segments={data.languages.map((l) => ({
            key: l.language,
            value: l.bytes,
            color: l.color ?? "var(--color-ink-muted)",
          }))}
        />

        <ul className="mt-6 flex flex-col gap-2">
          {data.languages.slice(0, 20).map((l) => (
            <li
              key={l.language}
              className="flex items-center gap-3 py-1.5 border-b last:border-b-0"
              style={{ borderColor: "var(--color-line)" }}
            >
              <LangIcon language={l.language} color={l.color} size={16} />
              <span className="flex-1 text-[14px]">{l.language}</span>
              <span
                className="mono-label"
                style={{ color: "var(--color-ink-muted)", minWidth: 64, textAlign: "right" }}
              >
                {fmtBytes(l.bytes)}
              </span>
              <span
                className="mono-label"
                style={{
                  color: "var(--color-ink-muted)",
                  minWidth: 72,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
                title="lines of code (local scan)"
              >
                {l.loc > 0 ? `${fmtNum(l.loc)} LOC` : "—"}
              </span>
              <span
                className="font-mono text-[12px]"
                style={{
                  color: "var(--color-ink)",
                  minWidth: 56,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtPct(l.ratio)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mono-label mb-2">by repo</div>
        <h3 className="display-card mb-4">Each repository</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.byRepo.map((r) => {
            const top = r.languages[0];
            return (
              <Link
                key={r.repoId}
                to={`/repos/${r.repoId}`}
                className="card p-5 transition-colors"
                style={{ color: "var(--color-ink)", textDecoration: "none" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {top && <LangIcon language={top.language} color={top.color} size={18} />}
                  <span
                    className="font-mono text-[13px] truncate"
                    style={{ color: "var(--color-ink)" }}
                    title={r.localPath}
                  >
                    {shortenPath(r.localPath)}
                  </span>
                </div>
                <div
                  className="mono-label mb-4"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {r.remoteOwner ? `${r.remoteOwner}/${r.remoteName}` : "local"} · {fmtBytes(r.totalBytes)}
                  {r.totalLoc > 0 && ` · ${fmtCompact(r.totalLoc)} LOC`}
                </div>
                <StackedBar
                  segments={r.languages.map((l) => ({
                    key: l.language,
                    value: l.bytes,
                    color: l.color ?? "var(--color-ink-muted)",
                  }))}
                />
                <ul className="mt-3 flex flex-col gap-1">
                  {r.languages.slice(0, 5).map((l) => (
                    <li key={l.language} className="flex items-center gap-2 text-[12px]">
                      <LangIcon language={l.language} color={l.color} size={12} />
                      <span className="flex-1 truncate">{l.language}</span>
                      <span
                        className="font-mono"
                        style={{
                          color: "var(--color-ink-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtPct(l.ratio)}
                      </span>
                    </li>
                  ))}
                  {r.languages.length > 5 && (
                    <li
                      className="font-mono text-[11px]"
                      style={{ color: "var(--color-ink-placeholder)" }}
                    >
                      +{r.languages.length - 5} more
                    </li>
                  )}
                </ul>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StackedBar({
  segments,
}: {
  segments: { key: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  return (
    <div
      className="flex w-full h-2 overflow-hidden rounded-[4px]"
      style={{ background: "var(--color-surface-tint)", boxShadow: "var(--shadow-ring)" }}
    >
      {segments.map((s) => (
        <div
          key={s.key}
          title={`${s.key} · ${((s.value / total) * 100).toFixed(1)}%`}
          style={{
            width: `${(s.value / total) * 100}%`,
            background: s.color,
            minWidth: s.value / total > 0.005 ? 2 : 0,
          }}
        />
      ))}
    </div>
  );
}
