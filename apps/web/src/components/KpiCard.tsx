import type { ReactNode } from "react";

type Accent = "develop" | "preview" | "ship" | "add" | null;

const ACCENT_COLOR: Record<Exclude<Accent, null>, string> = {
  develop: "var(--color-develop)",
  preview: "var(--color-preview)",
  ship: "var(--color-ship)",
  add: "var(--color-add)",
};

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: Accent;
}

export default function KpiCard({ label, value, sub, accent = null }: Props) {
  const color = accent ? ACCENT_COLOR[accent] : "var(--color-ink)";
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="mono-label" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      <div className="metric" style={{ color }}>
        {value}
      </div>
      {sub !== undefined && (
        <div className="body-sm" style={{ color: "var(--color-ink-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
