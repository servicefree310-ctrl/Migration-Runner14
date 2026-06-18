import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Hook for parent (typically QueryErrorResetBoundary) to clear React Query
   * error state when the user clicks "Try again". Without this, queries that
   * threw on render would re-throw immediately on remount and the boundary
   * would re-trigger.
   */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof window !== "undefined" && window.console) {
      window.console.error("[admin] uncaught render error", error, info?.componentStack);
    }
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
        <div className="premium-card max-w-md w-full p-7 text-center">
          <div className="mx-auto w-12 h-12 rounded-full gold-bg-soft border border-amber-500/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-300" aria-hidden="true" />
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] gold-text mb-1.5">
            Admin Console
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            An unexpected error occurred while rendering this page. The team has
            been notified. You can try again or return to the dashboard.
          </p>
          <pre className="text-[11px] text-left text-red-300/80 bg-red-500/[0.06] border border-red-500/20 rounded-md p-3 mt-4 overflow-auto max-h-40 font-mono whitespace-pre-wrap">
            {error.message || String(error)}
          </pre>
          <div className="flex items-center justify-center gap-2 mt-5">
            <Button onClick={this.reset} variant="outline" size="sm" data-testid="button-error-retry">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Try again
            </Button>
            <Button
              onClick={() => { window.location.href = window.location.pathname.replace(/\/[^/]*$/, "") || "/"; }}
              size="sm"
              className="gold-bg text-black hover:opacity-90"
              data-testid="button-error-home"
            >
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
