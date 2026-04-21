import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { api, fmtCompact, fmtUsd } from "../lib/api";

export default function SessionsPage() {
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => api.sessions(100) });
  const data = q.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="sessions"
        title="Recent sessions"
        description="Every Claude Code session, ranked by recency. Linked commits arrive once the git index runs."
      />

      {data.length === 0 ? (
        <EmptyState title="No sessions yet" description="Run Sync to pull from ~/.claude/projects/." />
      ) : (
        <div className="card-flat overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left" style={{ background: "var(--color-surface-tint)" }}>
                <Th>Started</Th>
                <Th>Project</Th>
                <Th>Branch</Th>
                <Th>Model</Th>
                <Th right>Msgs</Th>
                <Th right>Input</Th>
                <Th right>Output</Th>
                <Th right>Cost</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr
                  key={s.id}
                  className="border-t hover:bg-[var(--color-surface-tint)] transition-colors"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <Td mono title={s.startedAt}>
                    {formatDistanceToNowStrict(new Date(s.startedAt), { addSuffix: true })}
                  </Td>
                  <Td>
                    <span className="truncate max-w-[280px] inline-block align-middle" title={s.projectPath}>
                      {shortenPath(s.projectPath)}
                    </span>
                  </Td>
                  <Td>
                    {s.gitBranch ? (
                      <span className="pill pill-ink font-mono">{s.gitBranch}</span>
                    ) : (
                      <span style={{ color: "var(--color-ink-placeholder)" }}>—</span>
                    )}
                  </Td>
                  <Td mono>{s.primaryModel ?? "—"}</Td>
                  <Td right>{s.messageCount}</Td>
                  <Td right>{fmtCompact(s.inputTokens)}</Td>
                  <Td right>{fmtCompact(s.outputTokens)}</Td>
                  <Td right>{fmtUsd(s.costUsd, 3)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function shortenPath(p: string): string {
  if (!p) return "—";
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
  mono = false,
  title,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  title?: string;
}) {
  return (
    <td
      className={`px-4 py-2.5 ${right ? "text-right" : ""} ${mono ? "font-mono" : ""}`}
      style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}
      title={title}
    >
      {children}
    </td>
  );
}
