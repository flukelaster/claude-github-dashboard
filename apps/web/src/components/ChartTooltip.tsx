import type { ReactNode } from "react";

interface Payload {
  name: string;
  value: number;
  color: string;
  dataKey?: string;
}

interface Props {
  active?: boolean;
  label?: string | number;
  payload?: Payload[];
  formatter?: (v: number | string, name?: string) => ReactNode;
}

export function TooltipCard({ active, label, payload, formatter }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div
      className="rounded-[6px] px-3 py-2 text-[12px] min-w-[160px]"
      style={{
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-card)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {label !== undefined && (
        <div
          className="mb-1.5 pb-1.5 border-b"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink)" }}
        >
          {String(label)}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2" style={{ color: "var(--color-ink-soft)" }}>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: p.color }}
              />
              {p.name}
            </span>
            <span style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>
              {formatter ? formatter(p.value, p.name) : p.value}
            </span>
          </div>
        ))}
        {payload.length > 1 && (
          <div
            className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span style={{ color: "var(--color-ink-muted)" }}>total</span>
            <span style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>
              {formatter ? formatter(total) : total}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
