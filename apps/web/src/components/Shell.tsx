import { NavLink, Outlet } from "react-router";
import SyncButton from "./SyncButton";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/usage", label: "Usage" },
  { to: "/productivity", label: "Productivity" },
  { to: "/repos", label: "Repos" },
  { to: "/languages", label: "Languages" },
  { to: "/sessions", label: "Sessions" },
  { to: "/heatmap", label: "Heatmap" },
  { to: "/forecast", label: "Forecast" },
  { to: "/settings", label: "Settings" },
];

export default function Shell() {
  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <header className="sticky top-0 z-50 bg-[var(--color-surface)]/90 backdrop-blur-sm ring-border">
        <div className="mx-auto max-w-[1200px] px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-normal text-[var(--color-ink-muted)]">
                cgd
              </span>
              <span className="display-card" style={{ fontSize: "16px", letterSpacing: "-0.32px" }}>
                Claude × GitHub
              </span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link-active" : ""}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <SyncButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--color-line)] mt-24 py-8">
        <div className="mx-auto max-w-[1200px] px-6 flex items-center justify-between">
          <span className="mono-label">local-only • no telemetry</span>
          <span className="mono-label">v0.1</span>
        </div>
      </footer>
    </div>
  );
}
