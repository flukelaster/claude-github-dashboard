import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="card p-12 flex flex-col items-center text-center">
      <div className="mono-label mb-4">no data</div>
      <h3 className="display-card mb-2">{title}</h3>
      {description && (
        <p className="body max-w-md" style={{ color: "var(--color-ink-muted)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
