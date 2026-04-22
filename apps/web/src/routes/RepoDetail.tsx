import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const COMMITS_PAGE = 50;
import { Link, useParams } from "react-router";
import { formatDistanceToNowStrict } from "date-fns";
import PageHeader from "../components/PageHeader";
import RangePicker from "../components/RangePicker";
import EmptyState from "../components/EmptyState";
import { api, fmtNum } from "../lib/api";

function NetStat({
  label,
  adds,
  dels,
}: {
  label: string;
  adds: number;
  dels: number;
}) {
  const net = adds - dels;
  return (
    <div className="card-flat p-4 flex flex-col gap-2">
      <div className="mono-label" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      <div
        className="text-[22px] font-semibold"
        style={{
          letterSpacing: "-0.88px",
          fontVariantNumeric: "tabular-nums",
          color: net >= 0 ? "var(--color-ink)" : "var(--color-remove)",
        }}
      >
        {net >= 0 ? "+" : ""}
        {fmtNum(net)}
      </div>
      <div className="flex items-center gap-3 font-mono text-[12px]">
        <span style={{ color: "var(--color-add)" }}>+{fmtNum(adds)}</span>
        <span style={{ color: "var(--color-remove)" }}>−{fmtNum(dels)}</span>
      </div>
    </div>
  );
}

export default function RepoDetailPage() {
  const { id } = useParams();
  const [range, setRange] = useState("90d");
  const [visibleCommits, setVisibleCommits] = useState(COMMITS_PAGE);
  const q = useQuery({
    queryKey: ["repo", id, range],
    queryFn: () => api.repoDetail(Number(id), range),
    enabled: !!id,
  });
  const data = q.data;

  return (
    <div>
      <PageHeader
        eyebrow="repo"
        title={data?.repo.localPath.split(/[\\/]+/).slice(-1)[0] ?? "…"}
        description={data?.repo.githubOwner ? `${data.repo.githubOwner}/${data.repo.githubName}` : data?.repo.localPath}
        actions={
          <div className="flex items-center gap-2">
            <RangePicker value={range} onChange={setRange} options={["30d", "90d", "180d"]} />
            <Link to="/repos" className="btn btn-secondary">
              ← All repos
            </Link>
          </div>
        }
      />

      {q.isLoading ? (
        <div className="body" style={{ color: "var(--color-ink-muted)" }}>
          loading…
        </div>
      ) : !data ? (
        <EmptyState title="Repo not found" />
      ) : (
        <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <NetStat
            label={`net · ${range}`}
            adds={data.repo.windowTotals.additions}
            dels={data.repo.windowTotals.deletions}
          />
          <NetStat
            label={`ai-assisted · ${range}`}
            adds={data.repo.windowTotals.aiAdditions}
            dels={data.repo.windowTotals.aiDeletions}
          />
          <NetStat
            label="net · all time"
            adds={data.repo.totals.additions}
            dels={data.repo.totals.deletions}
          />
          <div className="card-flat p-4 flex flex-col gap-2">
            <div className="mono-label" style={{ color: "var(--color-ink-muted)" }}>
              commits · {range}
            </div>
            <div
              className="text-[22px] font-semibold"
              style={{ letterSpacing: "-0.88px", fontVariantNumeric: "tabular-nums" }}
            >
              {fmtNum(data.repo.windowTotals.commitCount)}
            </div>
            <div className="font-mono text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
              {data.repo.windowTotals.aiCommitCount} ai · all-time {fmtNum(data.repo.totals.commitCount)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <section className="card p-5 xl:col-span-2">
            <div className="mono-label mb-1">commits · {data.commits.length}</div>
            <h3 className="display-card mb-4">Timeline</h3>
            {data.commits.length === 0 ? (
              <p className="body-sm" style={{ color: "var(--color-ink-muted)" }}>
                No commits in range.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.commits.slice(0, visibleCommits).map((c) => (
                  <li
                    key={c.sha}
                    className="flex items-start gap-3 pb-3 border-b last:border-b-0"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <div
                      className="w-1 rounded-full shrink-0 self-stretch"
                      style={{
                        background: c.isAiAssisted ? "var(--color-preview)" : "var(--color-line)",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <code className="font-mono text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
                          {c.sha.slice(0, 7)}
                        </code>
                        <span className="mono-label" style={{ color: "var(--color-ink-muted)" }}>
                          {formatDistanceToNowStrict(new Date(c.authoredAt), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-[14px] font-medium mt-1 truncate" style={{ color: "var(--color-ink)" }}>
                        {(c.message ?? "").split("\n")[0]}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="body-sm font-mono flex items-center gap-2">
                          <span style={{ color: "var(--color-add)" }}>+{fmtNum(c.additions)}</span>
                          <span style={{ color: "var(--color-remove)" }}>−{fmtNum(c.deletions)}</span>
                        </span>
                        {c.coAuthoredClaude && <span className="pill pill-preview">Co-Authored-By: Claude</span>}
                        {c.isAiAssisted && !c.coAuthoredClaude && (
                          <span className="pill pill-develop">AI-assisted · inferred</span>
                        )}
                        {c.linkedSessions.map((l) => (
                          <span
                            key={l.sessionId}
                            className="pill pill-ink"
                            title={`score ${l.score}`}
                          >
                            {l.confidence}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {visibleCommits < data.commits.length && (
              <button
                type="button"
                className="btn btn-secondary w-full mt-4"
                onClick={() => setVisibleCommits((v) => v + COMMITS_PAGE)}
              >
                Show {Math.min(COMMITS_PAGE, data.commits.length - visibleCommits)} more
                {" "}({data.commits.length - visibleCommits} remaining)
              </button>
            )}
          </section>

          <section className="card p-5">
            <div className="mono-label mb-1">pull requests · {data.prs.length}</div>
            <h3 className="display-card mb-4">Recent PRs</h3>
            {data.prs.length === 0 ? (
              <p className="body-sm" style={{ color: "var(--color-ink-muted)" }}>
                No PR data. Configure GitHub token in Settings.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.prs.map((p) => (
                  <li key={p.number} className="pb-3 border-b last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <code className="font-mono text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
                        #{p.number}
                      </code>
                      <span
                        className={`pill ${
                          p.state === "MERGED"
                            ? "pill-preview"
                            : p.state === "CLOSED"
                            ? "pill-ship"
                            : "pill-develop"
                        }`}
                      >
                        {p.state?.toLowerCase()}
                      </span>
                    </div>
                    <div
                      className="text-[14px] font-medium mt-1"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {p.title}
                    </div>
                    <div
                      className="body-sm font-mono mt-1 flex items-center gap-2 flex-wrap"
                      style={{ color: "var(--color-ink-muted)" }}
                    >
                      <span style={{ color: "var(--color-add)" }}>+{fmtNum(p.additions)}</span>
                      <span style={{ color: "var(--color-remove)" }}>−{fmtNum(p.deletions)}</span>
                      <span>· {p.reviewCount} reviews</span>
                      {p.timeToMergeMinutes != null && (
                        <span>· merged in {humanMinutes(p.timeToMergeMinutes)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        </>
      )}
    </div>
  );
}

function humanMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
