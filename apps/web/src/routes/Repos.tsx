import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import LocDailyChart from "../components/LocDailyChart";
import { api, fmtNum, fmtPct } from "../lib/api";

export default function ReposPage() {
  const q = useQuery({ queryKey: ["repos"], queryFn: () => api.repos() });
  const data = q.data ?? [];

  const totalAdds = data.reduce((s, r) => s + r.additions, 0);
  const totalDels = data.reduce((s, r) => s + r.deletions, 0);
  const totalNet = totalAdds - totalDels;

  return (
    <div>
      <PageHeader
        eyebrow="repos"
        title="Repositories"
        description="Discovered from Claude session cwds. If a GitHub token is set, commits come from GitHub API (authoritative). Otherwise local git."
      />

      {data.length === 0 ? (
        <EmptyState
          title="No repos indexed"
          description="Git indexer runs after Claude sync. Add a GitHub token in Settings for authoritative commit data."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="repos" value={fmtNum(data.length)} />
            <Stat label="added" value={`+${fmtNum(totalAdds)}`} color="var(--color-add)" />
            <Stat label="removed" value={`−${fmtNum(totalDels)}`} color="var(--color-remove)" />
            <Stat
              label="net loc"
              value={`${totalNet >= 0 ? "+" : ""}${fmtNum(totalNet)}`}
              color={totalNet >= 0 ? "var(--color-preview)" : "var(--color-remove)"}
            />
          </div>

          <LocDailyChart />

          <div className="card-flat overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left" style={{ background: "var(--color-surface-tint)" }}>
                  <Th>Repo</Th>
                  <Th>GitHub</Th>
                  <Th right>Commits</Th>
                  <Th right>+ added</Th>
                  <Th right>− removed</Th>
                  <Th right>Net</Th>
                  <Th right>AI %</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const net = r.netLoc;
                  const aiRatio = r.commitCount > 0 ? r.aiAssistedCount / r.commitCount : 0;
                  return (
                    <tr
                      key={r.id}
                      className="border-t hover:bg-[var(--color-surface-tint)] transition-colors"
                      style={{ borderColor: "var(--color-line)" }}
                    >
                      <td className="px-4 py-2.5 font-mono text-[13px]">
                        <Link to={`/repos/${r.id}`} style={{ color: "var(--color-ink)", textDecoration: "none" }}>
                          {shorten(r.localPath)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.githubOwner ? (
                          <span className="pill">
                            {r.githubOwner}/{r.githubName}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-ink-placeholder)" }}>—</span>
                        )}
                      </td>
                      <Td right>{fmtNum(r.commitCount)}</Td>
                      <Td right color="var(--color-add)">
                        +{fmtNum(r.additions)}
                      </Td>
                      <Td right color="var(--color-remove)">
                        −{fmtNum(r.deletions)}
                      </Td>
                      <Td right bold color={net >= 0 ? "var(--color-ink)" : "var(--color-remove)"}>
                        {net >= 0 ? "+" : ""}
                        {fmtNum(net)}
                      </Td>
                      <Td right>{r.commitCount > 0 ? fmtPct(aiRatio) : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function shorten(p: string): string {
  // Cross-platform: accept both Unix and Windows path separators.
  const parts = p.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return p;
  return ".../" + parts.slice(-2).join("/");
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
  bold = false,
  color,
}: {
  children: React.ReactNode;
  right?: boolean;
  bold?: boolean;
  color?: string;
}) {
  return (
    <td
      className={`px-4 py-2.5 ${right ? "text-right" : ""} ${bold ? "font-semibold" : ""}`}
      style={{ color: color ?? "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </td>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card-flat p-4">
      <div className="mono-label mb-2">{label}</div>
      <div
        className="text-[22px] font-semibold"
        style={{ letterSpacing: "-0.88px", fontVariantNumeric: "tabular-nums", color: color ?? "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}
