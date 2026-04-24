import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProviderName } from "@cgd/shared";
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

function GitlabIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      height={size}
      width={size}
      style={{ flex: "none", lineHeight: 1 }}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path fill="#E24329" d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.919 1.263a.455.455 0 00-.867 0L1.388 9.452.046 13.587a.924.924 0 00.331 1.03L12 23.054l11.624-8.436a.924.924 0 00.331-1.031" />
      <path fill="#FC6D26" d="M12 23.054l4.418-13.603H7.582L12 23.054z" />
      <path fill="#E24329" d="M12 23.054L7.582 9.451H1.388L12 23.054z" />
      <path fill="#FCA326" d="M1.388 9.451L.046 13.587a.924.924 0 00.331 1.03L12 23.054 1.388 9.451z" />
      <path fill="#E24329" d="M1.388 9.452h6.194L4.919 1.263a.455.455 0 00-.867 0L1.388 9.452z" />
      <path fill="#FC6D26" d="M12 23.054l4.418-13.603h6.195L12 23.054z" />
      <path fill="#FCA326" d="M22.613 9.451l1.342 4.136a.924.924 0 01-.331 1.03L12 23.054l10.613-13.603z" />
      <path fill="#E24329" d="M22.614 9.452h-6.196l2.664-8.189a.455.455 0 01.867 0l2.665 8.189z" />
    </svg>
  );
}

interface ProviderMeta {
  name: ProviderName;
  label: string;
  tokenPattern: string;
  tokenHint: string;
  docsUrl: string;
  scopes: string;
  icon: (size: number) => ReactNode;
}

const PROVIDERS: readonly ProviderMeta[] = [
  {
    name: "github",
    label: "GitHub",
    tokenPattern: "ghp_…",
    tokenHint: "Classic (ghp_…) or fine-grained (github_pat_…) PAT",
    docsUrl: "https://github.com/settings/tokens",
    scopes: "repo (read)",
    icon: (size) => <GithubIcon size={size} />,
  },
  {
    name: "gitlab",
    label: "GitLab",
    tokenPattern: "glpat-…",
    tokenHint: "Personal access token (glpat-…)",
    docsUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    scopes: "api, read_repository",
    icon: (size) => <GitlabIcon size={size} />,
  },
];

export default function SettingsPage() {
  const status = useQuery({ queryKey: ["syncStatus"], queryFn: api.syncStatus });

  return (
    <div>
      <PageHeader
        eyebrow="settings"
        title="Settings"
        description="Local-only configuration. No data leaves your machine unless a provider sync is enabled."
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

        <ProvidersSection />

        <TrackedReposSection />

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

type PresetValue = "junior" | "mid" | "senior" | "lead";

interface RolePreset {
  value: PresetValue;
  label: string;
  sub: string;
  hourlyRate: number;
  locPerHour: number;
}

// JobsDB Thailand Salary Guide 2024, Bangkok IT market
// Median salary × 1.3 loaded cost (SSO 5% + PVD 5% + benefits) ÷ 2,080 hr/yr
// Junior≈35k THB/mo→262/hr · Mid≈65k→487/hr · Senior≈110k→825/hr · Lead≈170k→1,276/hr
const ROLE_PRESETS: readonly RolePreset[] = [
  { value: "junior", label: "Junior", sub: "0–2 yr", hourlyRate: 262,  locPerHour: 30 },
  { value: "mid",    label: "Mid",    sub: "2–5 yr", hourlyRate: 487,  locPerHour: 50 },
  { value: "senior", label: "Senior", sub: "5+ yr",  hourlyRate: 825,  locPerHour: 70 },
  { value: "lead",   label: "Lead",   sub: "Staff",  hourlyRate: 1276, locPerHour: 60 },
];

const CURRENCY = "THB";
const SYMBOL = "฿";
const FX_RATE_TO_USD = 35;

const CUSTOM_KEY = "cgd_custom_rates";

type CustomRateEntry = { hourlyRate: string; locPerHour: string };
type CustomRateMap = Partial<Record<string, CustomRateEntry>>;

function loadCustomRates(): CustomRateMap {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "{}"); } catch { return {}; }
}
function persistCustomRates(m: CustomRateMap) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(m));
}

function isPresetDefault(role: PresetValue, hourlyRate: number, locPerHour: number): boolean {
  const p = ROLE_PRESETS.find((r) => r.value === role);
  return !!p && p.hourlyRate === hourlyRate && p.locPerHour === locPerHour;
}

function ProvidersSection() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["providers"], queryFn: api.listProviders });
  const [activeTab, setActiveTab] = useState<ProviderName>("github");
  const [inputs, setInputs] = useState<Record<ProviderName, string>>({ github: "", gitlab: "" });

  const save = useMutation({
    mutationFn: ({ name, token }: { name: ProviderName; token: string }) =>
      api.setProviderToken(name, token),
    onSuccess: (res, vars) => {
      if (!res.ok) {
        toast.error(res.error ?? "Invalid token");
        return;
      }
      setInputs((prev) => ({ ...prev, [vars.name]: "" }));
      qc.invalidateQueries({ queryKey: ["providers"] });
      qc.invalidateQueries({ queryKey: ["githubStatus"] });
      qc.invalidateQueries({ queryKey: [`providerTest-${vars.name}`] });
      toast.success(`${vars.name === "github" ? "GitHub" : "GitLab"} token saved`);
    },
    onError: () => toast.error("Failed to save token"),
  });

  const del = useMutation({
    mutationFn: (name: ProviderName) => api.deleteProviderToken(name),
    onSuccess: (_, name) => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      qc.invalidateQueries({ queryKey: ["githubStatus"] });
      qc.invalidateQueries({ queryKey: [`providerTest-${name}`] });
      toast.success("Token removed");
    },
  });

  const active = PROVIDERS.find((p) => p.name === activeTab)!;
  const activeData = list.data?.providers.find((p) => p.name === activeTab);
  const backend = list.data?.backend;

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="mono-label mb-2">providers</div>
          <h3 className="display-card mb-1">Remote git providers</h3>
          <p className="body-sm" style={{ color: "var(--color-ink-muted)" }}>
            Configure personal access tokens for commit, PR/MR, and language sync.
            Each provider is optional — local git fallback keeps working without tokens.
          </p>
        </div>
        <div className="card-flat inline-flex p-0.5" role="tablist" aria-label="Provider">
          {PROVIDERS.map((p) => {
            const isActive = activeTab === p.name;
            const hasToken = list.data?.providers.find((x) => x.name === p.name)?.hasToken;
            return (
              <button
                key={p.name}
                type="button"
                role="tab"
                aria-selected={isActive ? "true" : "false"}
                onClick={() => setActiveTab(p.name)}
                className="relative px-3 h-8 text-[13px] font-medium rounded-[4px] font-mono flex items-center gap-2 transition-colors"
                style={{
                  background: isActive ? "var(--color-ink)" : "transparent",
                  color: isActive ? "var(--color-surface)" : "var(--color-ink-soft)",
                }}
              >
                {p.icon(14)}
                {p.label}
                {hasToken && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: isActive ? "var(--color-surface)" : "var(--color-develop)" }}
                    title="token configured"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {backend === "memory" && (
        <div
          className="mb-4 px-3 py-2 rounded-[6px] text-[13px]"
          style={{
            background: "rgba(255, 91, 79, 0.1)",
            boxShadow: "var(--shadow-ring)",
            color: "var(--color-ship)",
          }}
        >
          <strong>Warning:</strong> OS keychain unavailable — tokens persist only for the current process.
          Restart will clear them. On Linux install <span className="font-mono">libsecret-1-dev</span>.
        </div>
      )}

      <ProviderPanel
        meta={active}
        hasToken={!!activeData?.hasToken}
        preview={activeData?.preview ?? null}
        input={inputs[activeTab]}
        onInputChange={(v) => setInputs((p) => ({ ...p, [activeTab]: v }))}
        onSave={() => {
          const t = inputs[activeTab].trim();
          if (t.length < 10) return;
          save.mutate({ name: activeTab, token: t });
        }}
        onDelete={() => del.mutate(activeTab)}
        isSaving={save.isPending}
        isDeleting={del.isPending}
      />
    </section>
  );
}

function ProviderPanel({
  meta,
  hasToken,
  preview,
  input,
  onInputChange,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  meta: ProviderMeta;
  hasToken: boolean;
  preview: string | null;
  input: string;
  onInputChange: (v: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const test = useQuery({
    queryKey: [`providerTest-${meta.name}`, hasToken],
    queryFn: () => api.testProvider(meta.name),
    enabled: hasToken,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div>
      <p className="body-sm mb-4" style={{ color: "var(--color-ink-muted)" }}>
        {meta.tokenHint}. Scopes:{" "}
        <span className="font-mono" style={{ color: "var(--color-ink-soft)" }}>
          {meta.scopes}
        </span>
        . Generate at{" "}
        <a
          href={meta.docsUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--color-develop)" }}
        >
          {meta.docsUrl.replace(/^https?:\/\//, "")}
        </a>
        .
      </p>

      {hasToken ? (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="pill pill-develop">configured</span>
            <code className="font-mono text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
              {preview}
            </code>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => test.refetch()}
              disabled={test.isFetching}
            >
              {test.isFetching ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onDelete}
              disabled={isDeleting}
            >
              Remove
            </button>
          </div>
          {test.data && test.data.ok && (
            <div
              className="mt-4 p-3 rounded-[6px] text-[13px]"
              style={{ boxShadow: "var(--shadow-ring-light)", background: "var(--color-surface)" }}
            >
              <div className="font-mono" style={{ color: "var(--color-ink)" }}>
                @{test.data.user}
              </div>
              {test.data.rateLimit && (
                <div
                  className="mono-label mt-1"
                  style={{ color: "var(--color-ink-muted)", fontVariantNumeric: "tabular-nums" }}
                >
                  rate limit {test.data.rateLimit.remaining}/{test.data.rateLimit.limit} · resets{" "}
                  {new Date(test.data.rateLimit.resetAt).toLocaleTimeString()}
                </div>
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
        </>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <input
            type="password"
            placeholder={meta.tokenPattern}
            autoComplete="off"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
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
            disabled={isSaving || input.trim().length < 10}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}

function TrackedReposSection() {
  const qc = useQueryClient();
  const repos = useQuery({ queryKey: ["repos"], queryFn: api.repos });
  const [filterTab, setFilterTab] = useState<ProviderName | "all">("all");
  const [addUrl, setAddUrl] = useState("");

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.setRepoSyncEnabled(id, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: () => toast.error("Failed to update"),
  });

  const add = useMutation({
    mutationFn: (url: string) => api.addRepo(url),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Could not add");
        return;
      }
      setAddUrl("");
      qc.invalidateQueries({ queryKey: ["repos"] });
      if (res.alreadyExists) {
        toast.info("Repository already tracked");
      } else {
        toast.success(`Added to ${res.provider ?? "provider"} — run sync to populate`);
      }
    },
    onError: () => toast.error("Failed to add repository"),
  });

  const all = repos.data ?? [];
  const filtered = filterTab === "all" ? all : all.filter((r) => r.provider === filterTab);
  const counts = {
    all: all.length,
    github: all.filter((r) => r.provider === "github").length,
    gitlab: all.filter((r) => r.provider === "gitlab").length,
  };

  const tabs: { value: ProviderName | "all"; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "github", label: "GitHub", count: counts.github },
    { value: "gitlab", label: "GitLab", count: counts.gitlab },
  ];

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="mono-label mb-2">tracked repositories</div>
          <h3 className="display-card mb-1">Which repos to sync</h3>
          <p className="body-sm" style={{ color: "var(--color-ink-muted)" }}>
            Discovered repos default to enabled. Disable to skip a repo during provider sync —
            local git data is preserved, but commits/PRs/languages won't refresh from the remote.
          </p>
        </div>
        <div className="card-flat inline-flex p-0.5" role="tablist" aria-label="Provider filter">
          {tabs.map((t) => {
            const isActive = filterTab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                onClick={() => setFilterTab(t.value)}
                className="px-3 h-8 text-[13px] font-medium rounded-[4px] font-mono transition-colors flex items-center gap-1.5 whitespace-nowrap leading-none"
                style={{
                  background: isActive ? "var(--color-ink)" : "transparent",
                  color: isActive ? "var(--color-surface)" : "var(--color-ink-soft)",
                }}
              >
                <span>{t.label}</span>
                <span style={{ opacity: 0.6 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {repos.isLoading ? (
        <div className="body-sm" style={{ color: "var(--color-ink-muted)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div
          className="px-4 py-6 rounded-[6px] text-[13px] text-center"
          style={{
            background: "var(--color-surface-tint)",
            color: "var(--color-ink-muted)",
            boxShadow: "var(--shadow-ring-light)",
          }}
        >
          {all.length === 0
            ? "No repositories discovered yet. Run sync after using Claude Code, or add one below."
            : "No repositories for this provider."}
        </div>
      ) : (
        <div className="rounded-[6px] overflow-hidden" style={{ boxShadow: "var(--shadow-ring-light)" }}>
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-surface-tint)" }}>
                <th className="mono-label text-left px-3 py-2" style={{ fontSize: 11 }}>sync</th>
                <th className="mono-label text-left px-3 py-2" style={{ fontSize: 11 }}>provider</th>
                <th className="mono-label text-left px-3 py-2" style={{ fontSize: 11 }}>repository</th>
                <th className="mono-label text-right px-3 py-2" style={{ fontSize: 11 }}>loc</th>
                <th className="mono-label text-right px-3 py-2" style={{ fontSize: 11 }}>last sync</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{
                    borderTop: "1px solid var(--color-line)",
                    opacity: r.syncEnabled ? 1 : 0.5,
                  }}
                >
                  <td className="px-3 py-2.5">
                    <SyncToggle
                      enabled={!!r.syncEnabled}
                      disabled={toggle.isPending}
                      onChange={(v) => toggle.mutate({ id: r.id, enabled: v })}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono" style={{ color: "var(--color-ink-muted)" }}>
                    {r.provider}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.remoteOwner ? (
                      <span className="font-mono">
                        {r.remoteOwner}/{r.remoteName}
                      </span>
                    ) : (
                      <span className="font-mono" style={{ color: "var(--color-ink-placeholder)" }}>
                        local only
                      </span>
                    )}
                    <div
                      className="text-[11px] font-mono mt-0.5"
                      style={{ color: "var(--color-ink-muted)" }}
                    >
                      {r.localPath}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.totalLoc > 0 ? r.totalLoc.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    {r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleDateString() : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const url = addUrl.trim();
          if (url.length < 4) return;
          add.mutate(url);
        }}
      >
        <input
          type="text"
          placeholder="https://github.com/owner/repo  or  https://gitlab.com/group/project"
          value={addUrl}
          onChange={(e) => setAddUrl(e.target.value)}
          className="flex-1 h-9 px-3 rounded-[6px] font-mono text-[13px]"
          style={{
            background: "var(--color-surface)",
            boxShadow: "var(--shadow-ring-light)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          className="btn btn-secondary"
          disabled={add.isPending || addUrl.trim().length < 4}
        >
          {add.isPending ? "Adding…" : "Add repository"}
        </button>
      </form>
    </section>
  );
}

function SyncToggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled ? "true" : "false"}
      aria-label={enabled ? "Disable sync" : "Enable sync"}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className="relative rounded-full transition-colors"
      style={{
        width: 32,
        height: 18,
        background: enabled ? "var(--color-develop)" : "var(--color-line)",
        boxShadow: "var(--shadow-ring-light)",
      }}
    >
      <span
        className="absolute rounded-full transition-transform"
        style={{
          width: 14,
          height: 14,
          top: 2,
          left: 2,
          background: "var(--color-surface)",
          transform: enabled ? "translateX(14px)" : "translateX(0)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}

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

  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [activeRole, setActiveRole] = useState<PresetValue>("senior");
  const [customRates, setCustomRates] = useState<CustomRateMap>(() => loadCustomRates());

  const presetData = ROLE_PRESETS.find((p) => p.value === activeRole)!;
  const customKey = activeRole;
  const currentCustom = customRates[customKey] ?? {
    hourlyRate: String(presetData.hourlyRate),
    locPerHour: String(presetData.locPerHour),
  };

  useEffect(() => {
    if (!cfg.isSuccess || !cfg.data) return;
    const d = cfg.data;
    const savedRole = (d.role === "custom" ? "senior" : d.role) as PresetValue;
    setActiveRole(savedRole);
    if (isPresetDefault(savedRole, d.hourlyRate, d.locPerHour)) {
      setMode("preset");
    } else {
      setMode("custom");
      setCustomRates((prev) => {
        const next = { ...prev, [savedRole]: { hourlyRate: String(d.hourlyRate), locPerHour: String(d.locPerHour) } };
        persistCustomRates(next);
        return next;
      });
    }
  }, [cfg.isSuccess, cfg.data]);

  function handleRoleTab(p: RolePreset) {
    setActiveRole(p.value);
    if (mode === "custom" && !customRates[p.value]) {
      setCustomRates((prev) => {
        const next = { ...prev, [p.value]: { hourlyRate: String(p.hourlyRate), locPerHour: String(p.locPerHour) } };
        persistCustomRates(next);
        return next;
      });
    }
  }

  function updateField(field: keyof CustomRateEntry, value: string) {
    setCustomRates((prev) => {
      const next = { ...prev, [customKey]: { ...currentCustom, [field]: value } };
      persistCustomRates(next);
      return next;
    });
  }

  function handleSave() {
    if (mode === "preset") {
      save.mutate({ role: activeRole, hourlyRate: presetData.hourlyRate, locPerHour: presetData.locPerHour, currency: CURRENCY, fxRateToUsd: FX_RATE_TO_USD });
      return;
    }
    const hr = Number(currentCustom.hourlyRate);
    const lph = Number(currentCustom.locPerHour);
    if (!isFinite(hr) || hr <= 0 || !isFinite(lph) || lph <= 0) return;
    save.mutate({ role: activeRole, hourlyRate: hr, locPerHour: lph, currency: CURRENCY, fxRateToUsd: FX_RATE_TO_USD });
  }

  const hasCustomDot = (p: RolePreset) =>
    mode === "custom" && !!customRates[p.value] &&
    !isPresetDefault(p.value, Number(customRates[p.value]!.hourlyRate), Number(customRates[p.value]!.locPerHour));

  return (
    <section className="card p-6">
      <div className="mono-label mb-2">roi estimate</div>
      <h3 className="display-card mb-1">Developer rate card</h3>
      <p className="body-sm mb-5" style={{ color: "var(--color-ink-muted)" }}>
        Used to estimate time saved and ROI on the Overview page.
        Rates from{" "}
        <a href="https://th.jobsdb.com/th/salary-report" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-develop)" }}>
          JobsDB Thailand 2024
        </a>
        {" "}— Bangkok IT market, median salary × 1.3 loaded cost (SSO + PVD + benefits) ÷ 2,080 hr/yr.
        LOC/hr from McConnell <em>Code Complete §28</em>.
      </p>

      {/* Mode toggle */}
      <div className="flex gap-4 mb-5">
        {(["preset", "custom"] as const).map((m) => (
          <label
            key={m}
            className="flex items-center gap-2 cursor-pointer select-none"
            style={{ color: mode === m ? "var(--color-ink)" : "var(--color-ink-muted)" }}
          >
            <input type="radio" name="roi-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-ink" />
            <span className="font-mono text-[13px] font-medium">
              {m === "preset" ? "JobsDB TH 2024 defaults" : "Custom rate card"}
            </span>
          </label>
        ))}
      </div>

      {/* Role tabs */}
      <div className="mb-4">
        <div className="mono-label mb-2" style={{ color: "var(--color-ink-muted)" }}>role</div>
        <div className="card-flat inline-flex p-0.5" role="tablist" aria-label="Developer role">
          {ROLE_PRESETS.map((p) => {
            const active = activeRole === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={active ? "true" : "false"}
                onClick={() => handleRoleTab(p)}
                className="relative px-4 h-8 text-[13px] font-medium rounded-[4px] font-mono transition-colors"
                style={{
                  background: active ? "var(--color-ink)" : "transparent",
                  color: active ? "var(--color-surface)" : "var(--color-ink-soft)",
                }}
              >
                {p.label}
                {hasCustomDot(p) && (
                  <span
                    className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                    style={{ background: active ? "var(--color-surface)" : "var(--color-develop)" }}
                    title="Custom rate set"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rate display / inputs */}
      {mode === "preset" ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-[6px]" style={{ background: "var(--color-surface-tint)", boxShadow: "var(--shadow-ring-light)" }}>
            <div className="mono-label mb-1" style={{ color: "var(--color-ink-muted)" }}>experience</div>
            <div className="font-mono text-[14px]" style={{ color: "var(--color-ink)" }}>{presetData.sub}</div>
          </div>
          <div className="p-3 rounded-[6px]" style={{ background: "var(--color-surface-tint)", boxShadow: "var(--shadow-ring-light)" }}>
            <div className="mono-label mb-1" style={{ color: "var(--color-ink-muted)" }}>hourly rate</div>
            <div className="font-mono text-[14px]" style={{ color: "var(--color-ink)" }}>
              {SYMBOL}{presetData.hourlyRate}/hr
              <span className="text-[11px] ml-1" style={{ color: "var(--color-ink-muted)" }}>
                ≈ ${(presetData.hourlyRate / FX_RATE_TO_USD).toFixed(1)} USD
              </span>
            </div>
          </div>
          <div className="p-3 rounded-[6px]" style={{ background: "var(--color-surface-tint)", boxShadow: "var(--shadow-ring-light)" }}>
            <div className="mono-label mb-1" style={{ color: "var(--color-ink-muted)" }}>LOC / hr</div>
            <div className="font-mono text-[14px]" style={{ color: "var(--color-ink)" }}>{presetData.locPerHour}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mono-label block mb-1.5" style={{ color: "var(--color-ink-muted)" }}>
              hourly rate ({SYMBOL}/hr)
            </label>
            <input
              type="number"
              min={1}
              max={1000000}
              title={`Hourly rate in ${CURRENCY}`}
              placeholder={String(presetData.hourlyRate)}
              value={currentCustom.hourlyRate}
              onChange={(e) => updateField("hourlyRate", e.target.value)}
              className="h-9 px-3 rounded-[6px] font-mono text-[13px] w-full"
              style={{ background: "var(--color-surface)", boxShadow: "var(--shadow-ring-light)", outline: "none", color: "var(--color-ink)" }}
            />
          </div>
          <div>
            <label className="mono-label block mb-1.5" style={{ color: "var(--color-ink-muted)" }}>LOC / hour</label>
            <input
              type="number"
              min={1}
              max={10000}
              title="Lines of code per hour"
              placeholder={String(presetData.locPerHour)}
              value={currentCustom.locPerHour}
              onChange={(e) => updateField("locPerHour", e.target.value)}
              className="h-9 px-3 rounded-[6px] font-mono text-[13px] w-full"
              style={{ background: "var(--color-surface)", boxShadow: "var(--shadow-ring-light)", outline: "none", color: "var(--color-ink)" }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {mode === "custom" && (
          <button
            type="button"
            className="btn btn-secondary text-[12px]"
            onClick={() => {
              updateField("hourlyRate", String(presetData.hourlyRate));
              updateField("locPerHour", String(presetData.locPerHour));
            }}
          >
            Reset to JobsDB defaults
          </button>
        )}
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
