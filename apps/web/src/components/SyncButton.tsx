import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function SyncButton() {
  const qc = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["syncStatus"],
    queryFn: api.syncStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2_500 : 20_000),
    refetchIntervalInBackground: false,
  });
  const wasRunningRef = useRef(false);
  useEffect(() => {
    const running = status?.running ?? false;
    if (wasRunningRef.current && !running) {
      qc.invalidateQueries();
    }
    wasRunningRef.current = running;
  }, [status?.running, qc]);
  const m = useMutation({
    mutationFn: api.sync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["syncStatus"] });
    },
  });

  const running = status?.running;

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => m.mutate()}
      disabled={running || m.isPending}
      title={status?.lastRunAt ? `Last: ${status.lastRunAt}` : undefined}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: running ? "var(--color-develop)" : "#999" }}
      />
      {running ? "Syncing…" : "Sync"}
    </button>
  );
}
