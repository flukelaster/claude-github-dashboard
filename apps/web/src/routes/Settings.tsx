import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/PageHeader";
import { api } from "../lib/api";

export default function SettingsPage() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["syncStatus"], queryFn: api.syncStatus });
  const token = useQuery({ queryKey: ["ghToken"], queryFn: api.getGithubToken });

  const [input, setInput] = useState("");
  const save = useMutation({
    mutationFn: (t: string) => api.setGithubToken(t),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["ghToken"] });
      qc.invalidateQueries({ queryKey: ["githubStatus"] });
    },
  });
  const del = useMutation({
    mutationFn: api.deleteGithubToken,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ghToken"] });
      qc.invalidateQueries({ queryKey: ["githubStatus"] });
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="settings"
        title="Settings"
        description="Local-only configuration. No data leaves your machine unless GitHub sync is enabled."
      />

      <div className="grid gap-6">
        <section className="card p-6">
          <div className="mono-label mb-2">sync state</div>
          <h3 className="display-card mb-4">Data sources</h3>
          <dl className="grid grid-cols-2 gap-y-3 gap-x-8 text-[13px]">
            <Row label="running" value={status.data?.running ? "yes" : "no"} />
            <Row label="files scanned" value={String(status.data?.filesScanned ?? 0)} />
            <Row label="events ingested" value={String(status.data?.eventsIngested ?? 0)} />
            <Row label="sessions upserted" value={String(status.data?.sessionsUpserted ?? 0)} />
            <Row label="last run" value={status.data?.lastRunAt ?? "never"} mono />
            <Row label="last error" value={status.data?.lastError ?? "—"} mono />
          </dl>
        </section>

        <section className="card p-6">
          <div className="mono-label mb-2">github</div>
          <h3 className="display-card mb-2">Personal access token</h3>
          <p className="body-sm mb-4" style={{ color: "var(--color-ink-muted)" }}>
            Required for GitHub sync (PRs, repo metadata). Scope: <span className="font-mono">repo</span>.
            Stored in OS keychain via <span className="font-mono">keytar</span>.
          </p>
          {token.data?.backend === "memory" && (
            <div
              className="mb-4 px-3 py-2 rounded-[6px] text-[13px]"
              style={{
                background: "rgba(255, 91, 79, 0.1)",
                boxShadow: "var(--shadow-ring)",
                color: "var(--color-ship)",
              }}
            >
              <strong>Warning:</strong> OS keychain unavailable — token will persist only for the current process.
              Restart will clear it. On Linux install <span className="font-mono">libsecret-1-dev</span>;
              on other platforms check <span className="font-mono">keytar</span> is built.
            </div>
          )}

          {token.data?.hasToken ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="pill pill-develop">configured</span>
              <code className="font-mono text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
                {token.data.preview}
              </code>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => del.mutate()}
                disabled={del.isPending}
              >
                Remove
              </button>
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim().length > 10) save.mutate(input.trim());
              }}
            >
              <input
                type="password"
                placeholder="ghp_…"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 h-9 px-3 rounded-[6px] font-mono text-[13px]"
                style={{
                  background: "var(--color-surface)",
                  boxShadow: "var(--shadow-ring-light)",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={save.isPending || input.trim().length < 10}
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </form>
          )}
          {save.isError && (
            <p className="body-sm mt-2" style={{ color: "var(--color-ship)" }}>
              Failed to save. Check the token format.
            </p>
          )}
        </section>

        <section className="card p-6">
          <div className="mono-label mb-2">privacy</div>
          <h3 className="display-card mb-2">What this tool does not do</h3>
          <ul className="body-sm space-y-1.5" style={{ color: "var(--color-ink-soft)" }}>
            <li>— No outbound traffic except the GitHub API (opt-in).</li>
            <li>— Message content is not persisted — only token counts and file paths.</li>
            <li>— No analytics, no telemetry, no crash reporting.</li>
            <li>— Export is local JSON/PDF only.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="mono-label" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </span>
      <span
        className={mono ? "font-mono" : ""}
        style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
    </div>
  );
}
