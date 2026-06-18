import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /**
   * Hook for parent (typically QueryErrorResetBoundary) to clear React Query
   * error state when the user clicks "Try again". Without this, queries that
   * threw on render would re-throw immediately on remount and the boundary
   * would re-trigger right away.
   */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-root error boundary for the user portal.
 *
 * Catches any render-time exception in the React tree below it, logs it to
 * the console (production debugging via DevTools / Sentry hook later), and
 * shows a professional recovery card so users don't see a blank screen.
 *
 * The "Try Again" button resets the boundary state — useful when the error
 * was transient (e.g. a stale token that's already been cleared by api.ts'
 * 401 handler). "Reload" does a hard refresh as the last-ditch escape hatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || "An unexpected error occurred.";

    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="premium-card-hero rounded-2xl p-8 max-w-md w-full text-center">
          <div className="stat-orb w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8 text-amber-300" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            The application encountered an unexpected error. You can try again
            or reload the page. If the problem persists, please contact support.
          </p>
          <div className="text-[11px] text-muted-foreground/70 font-mono bg-muted/30 rounded-md px-3 py-2 mb-6 break-all">
            {message}
          </div>
          <div className="flex gap-2 justify-center">
            <Button onClick={this.handleReset} variant="outline" data-testid="error-boundary-retry">
              <RotateCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={this.handleReload} data-testid="error-boundary-reload">
              Reload Page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
