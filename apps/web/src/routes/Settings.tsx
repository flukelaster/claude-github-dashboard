import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "../components/PageHeader";
import { api } from "../lib/api";

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      style={{ flex: "none", lineHeight: 1 }}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z" />
    </svg>
  );
}

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
      test.reset();
    },
  });
  const test = useMutation({ mutationFn: api.testGithubConnection });

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
          <div className="flex items-center gap-2 mb-2" style={{ color: "var(--color-ink-muted)" }}>
            <GithubIcon size={14} />
            <span className="mono-label">github</span>
          </div>
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
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="pill pill-develop">configured</span>
                <code className="font-mono text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
                  {token.data.preview}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => test.mutate()}
                  disabled={test.isPending}
                >
                  {test.isPending ? "Testing…" : "Test connection"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => del.mutate()}
                  disabled={del.isPending}
                >
                  Remove
                </button>
              </div>
              {test.data && test.data.ok && (
                <div
                  className="mt-4 p-3 rounded-[6px] flex items-center gap-3 text-[13px]"
                  style={{ boxShadow: "var(--shadow-ring-light)", background: "var(--color-surface)" }}
                >
                  {test.data.avatarUrl && (
                    <img
                      src={test.data.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      style={{ borderRadius: "50%", boxShadow: "var(--shadow-ring-light)" }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono" style={{ color: "var(--color-ink)" }}>
                      @{test.data.login}
                      {test.data.name && (
                        <span style={{ color: "var(--color-ink-muted)" }}> · {test.data.name}</span>
                      )}
                    </div>
                    {test.data.rateLimit && (
                      <div
                        className="mono-label"
                        style={{ color: "var(--color-ink-muted)", fontVariantNumeric: "tabular-nums" }}
                      >
                        rate limit {test.data.rateLimit.remaining}/{test.data.rateLimit.limit} · resets{" "}
                        {new Date(test.data.rateLimit.resetAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  {test.data.profileUrl && (
                    <a
                      href={test.data.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                    >
                      Profile
                    </a>
                  )}
                </div>
              )}
              {test.data && !test.data.ok && (
                <div
                  className="mt-4 px-3 py-2 rounded-[6px] text-[13px]"
                  style={{
                    background: "rgba(255, 91, 79, 0.1)",
                    boxShadow: "var(--shadow-ring)",
                    color: "var(--color-ship)",
                  }}
                >
                  <strong>Failed:</strong> {test.data.error ?? "unknown error"}
                </div>
              )}
              {test.isError && (
                <div
                  className="mt-4 px-3 py-2 rounded-[6px] text-[13px]"
                  style={{
                    background: "rgba(255, 91, 79, 0.1)",
                    boxShadow: "var(--shadow-ring)",
                    color: "var(--color-ship)",
                  }}
                >
                  <strong>Request failed:</strong> {String(test.error)}
                </div>
              )}
            </>
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

        <RoiSettings />

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

// Rates: BLS OES May 2024 percentile salaries × 1.3 loaded cost ÷ 2080 hr/yr
// P25 ≈ $88k → $55/hr · P50 ≈ $132k → $83/hr · P75 ≈ $168k → $105/hr · P90 ≈ $210k → $131/hr
const ROLE_PRESETS = [
  { value: "junior", label: "Junior  (0–2 yr)",  hourlyRate: 55,  locPerHour: 30 },
  { value: "mid",    label: "Mid     (2–5 yr)",  hourlyRate: 83,  locPerHour: 50 },
  { value: "senior", label: "Senior  (5+ yr)",   hourlyRate: 105, locPerHour: 70 },
  { value: "lead",   label: "Lead / Staff",       hourlyRate: 131, locPerHour: 60 },
  { value: "custom", label: "Custom",             hourlyRate: 83,  locPerHour: 50 },
] as const;

function RoiSettings() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["roiConfig"], queryFn: api.getRoiConfig });
  const save = useMutation({
    mutationFn: api.setRoiConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roiConfig"] });
      toast.success("Rate card saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const [role, setRole] = useState<string>("senior");
  const [rate, setRate] = useState<string>("105");
  const [loc, setLoc] = useState<string>("70");

  useEffect(() => {
    if (cfg.isSuccess && cfg.data) {
      setRole(cfg.data.role);
      setRate(String(cfg.data.hourlyRate));
      setLoc(String(cfg.data.locPerHour));
    }
  }, [cfg.isSuccess, cfg.data]);

  function handleRoleChange(v: string) {
    setRole(v);
    const preset = ROLE_PRESETS.find((p) => p.value === v);
    if (preset && v !== "custom") {
      setRate(String(preset.hourlyRate));
      setLoc(String(preset.locPerHour));
    }
  }

  function handleSave() {
    const hr = Number(rate);
    const lph = Number(loc);
    if (!isFinite(hr) || hr <= 0 || !isFinite(lph) || lph <= 0) return;
    save.mutate({ role, hourlyRate: hr, locPerHour: lph });
  }

  return (
    <section className="card p-6">
      <div className="mono-label mb-2">roi estimate</div>
      <h3 className="display-card mb-1">Developer rate card</h3>
      <p className="body-sm mb-5" style={{ color: "var(--color-ink-muted)" }}>
        Used to estimate time saved and ROI on the Overview page.
        Rates from <a href="https://www.bls.gov/oes/current/oes151252.htm" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-develop)" }}>BLS OES May 2024</a> (US Software Developers) — percentile salary × 1.3 loaded cost ÷ 2,080 hr/yr.
        LOC/hr from McConnell <em>Code Complete §28</em> (focused coding session, not whole-day average).
      </p>

      <div className="flex flex-col gap-4">
        <div>
          <label className="mono-label block mb-1.5" style={{ color: "var(--color-ink-muted)" }}>
            role preset
          </label>
          <div className="relative">
            <select
              title="Role preset"
              className="h-9 pl-3 pr-8 rounded-[6px] font-mono text-[13px] w-full appearance-none"
              style={{
                background: "var(--color-surface)",
                boxShadow: "var(--shadow-ring-light)",
                color: "var(--color-ink)",
                outline: "none",
              }}
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
            >
              {ROLE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} {p.value !== "custom" ? `— $${p.hourlyRate}/hr · ${p.locPerHour} LOC/hr` : ""}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--color-ink-muted)" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mono-label block mb-1.5" style={{ color: "var(--color-ink-muted)" }}>
              hourly rate ($/hr)
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              title="Hourly rate in USD"
              placeholder="120"
              value={rate}
              onChange={(e) => { setRate(e.target.value); setRole("custom"); }}
              className="h-9 px-3 rounded-[6px] font-mono text-[13px] w-full"
              style={{
                background: "var(--color-surface)",
                boxShadow: "var(--shadow-ring-light)",
                outline: "none",
                color: "var(--color-ink)",
              }}
            />
          </div>
          <div>
            <label className="mono-label block mb-1.5" style={{ color: "var(--color-ink-muted)" }}>
              LOC / hour
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              title="Lines of code per hour"
              placeholder="70"
              value={loc}
              onChange={(e) => { setLoc(e.target.value); setRole("custom"); }}
              className="h-9 px-3 rounded-[6px] font-mono text-[13px] w-full"
              style={{
                background: "var(--color-surface)",
                boxShadow: "var(--shadow-ring-light)",
                outline: "none",
                color: "var(--color-ink)",
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </section>
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
