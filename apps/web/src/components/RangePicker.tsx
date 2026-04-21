interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options?: readonly T[];
}

const DEFAULT_RANGES = ["7d", "30d", "90d", "180d"] as const;

export default function RangePicker<T extends string = string>({
  value,
  onChange,
  options = DEFAULT_RANGES as unknown as readonly T[],
}: Props<T>) {
  return (
    <div className="card-flat inline-flex p-0.5" role="tablist">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={active ? "true" : "false"}
            onClick={() => onChange(o)}
            className="px-3 h-7 text-[13px] font-medium rounded-[4px] font-mono transition-colors"
            style={{
              background: active ? "var(--color-ink)" : "transparent",
              color: active ? "var(--color-surface)" : "var(--color-ink-soft)",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
