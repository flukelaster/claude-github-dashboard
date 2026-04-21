import type { CSSProperties, ReactNode } from "react";

export function Th({
  children,
  right = false,
}: {
  children: ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={`px-4 py-2.5 font-mono uppercase text-[11px] ${
        right ? "text-right" : ""
      }`}
      style={{ color: "var(--color-ink-muted)", fontWeight: 500 }}
    >
      {children}
    </th>
  );
}

interface TdProps {
  children: ReactNode;
  right?: boolean;
  mono?: boolean;
  bold?: boolean;
  color?: string;
  title?: string;
}

export function Td({ children, right = false, mono = false, bold = false, color, title }: TdProps) {
  const className = ["px-4 py-2.5"];
  if (right) className.push("text-right");
  if (mono) className.push("font-mono");
  if (bold) className.push("font-semibold");
  const style: CSSProperties = {
    color: color ?? "var(--color-ink)",
    fontVariantNumeric: "tabular-nums",
  };
  return (
    <td className={className.join(" ")} style={style} title={title}>
      {children}
    </td>
  );
}
