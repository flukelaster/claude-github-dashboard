import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { Th, Td } from "../components/Table";
import { api, fmtCompact, fmtUsd } from "../lib/api";
import { shortenPath } from "../lib/fmt";

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
                  className="border-t hover:bg-surface-tint transition-colors"
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
