import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "develop" | "preview" | "ship" | null;
}

export default function KpiCard({ label, value, sub, accent = null }: Props) {
  const color =
    accent === "develop"
      ? "var(--color-develop)"
      : accent === "preview"
      ? "var(--color-preview)"
      : accent === "ship"
      ? "var(--color-ship)"
      : "var(--color-ink)";
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
