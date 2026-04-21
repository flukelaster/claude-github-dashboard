import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: unknown) {
    console.error("[cgd/web] ErrorBoundary:", error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-[720px] my-20 card p-8">
          <div className="mono-label mb-3" style={{ color: "var(--color-ship)" }}>
            unexpected error
          </div>
          <h2 className="display-card mb-2">Something broke.</h2>
          <p className="body-sm mb-4" style={{ color: "var(--color-ink-muted)" }}>
            The UI hit an error it couldn't recover from. Full details in the browser console.
          </p>
          <pre
            className="font-mono text-[12px] p-4 rounded-[6px] overflow-auto"
            style={{
              background: "var(--color-surface-tint)",
              boxShadow: "var(--shadow-ring)",
              color: "var(--color-ink)",
            }}
          >
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                this.setState({ error: null });
              }}
            >
              Retry
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
