import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render-time exceptions and shows a
 * non-scary fallback instead of the default React white-screen. We
 * deliberately keep the diagnostic info behind a disclosure so regular users
 * see a calm message first.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            The dashboard hit an unexpected error. Reloading usually fixes it.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
            >
              Reload
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              Go home
            </a>
          </div>
          <details className="mt-6 text-left text-xs text-gray-500 dark:text-gray-500">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
