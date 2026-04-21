interface Props {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}

export default function RangePicker({
  value,
  onChange,
  options = ["7d", "30d", "90d", "180d"],
}: Props) {
  return (
    <div className="card-flat inline-flex p-0.5" role="tablist">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            role="tab"
            aria-selected={active}
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
