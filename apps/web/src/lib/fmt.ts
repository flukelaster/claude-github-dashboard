export function shortenPath(p: string | null | undefined, keep = 2): string {
  if (!p) return "—";
  const parts = p.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= keep) return p;
  return ".../" + parts.slice(-keep).join("/");
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function collectModels(
  data: { byModel: Record<string, unknown> }[]
): string[] {
  const s = new Set<string>();
  for (const d of data) for (const m of Object.keys(d.byModel)) s.add(m);
  return Array.from(s).sort();
}

export const MODEL_COLORS = [
  "#0070f3",
  "#7928ca",
  "#eb367f",
  "#ff5b4f",
  "#de1d8d",
  "#0a72ef",
] as const;

export function modelColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length]!;
}
