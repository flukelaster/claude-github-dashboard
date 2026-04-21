import type { ReactNode } from "react";

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="flex items-end justify-between gap-6 mb-8 pb-6 border-b border-[var(--color-line)]">
      <div>
        {eyebrow && <div className="mono-label mb-3">{eyebrow}</div>}
        <h1 className="display-sub">{title}</h1>
        {description && (
          <p className="body-sm mt-2 max-w-2xl" style={{ color: "var(--color-ink-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
