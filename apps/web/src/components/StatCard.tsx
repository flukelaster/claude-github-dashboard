import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  color?: string;
  sub?: ReactNode;
  size?: "md" | "sm";
  raised?: boolean;
}

export default function StatCard({
  label,
  value,
  color,
  sub,
  size = "md",
  raised = false,
}: Props) {
  const valueSize = size === "sm" ? "text-[18px]" : "text-[22px]";
  const tracking = size === "sm" ? "-0.6px" : "-0.88px";
  return (
    <div className={raised ? "card p-4" : "card-flat p-4"}>
      <div
        className={size === "sm" ? "mono-label mb-1.5" : "mono-label mb-2"}
        style={{ color: "var(--color-ink-muted)" }}
      >
        {label}
      </div>
      <div
        className={`${valueSize} font-semibold truncate`}
        style={{
          letterSpacing: tracking,
          fontVariantNumeric: "tabular-nums",
          color: color ?? "var(--color-ink)",
        }}
      >
        {value}
      </div>
      {sub !== undefined && (
        <div
          className="body-sm mt-2"
          style={{ color: "var(--color-ink-muted)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
