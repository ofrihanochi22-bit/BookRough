import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Wraps the routed tree so a render crash shows a readable fallback instead of
 * a white screen (CLAUDE.md §4).
 *
 * Still a class component because React has no hook equivalent of
 * componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- development-only crash detail
      console.error('Unhandled render error', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <h1 className="text-xl font-semibold">Something broke on this page</h1>
        <p className="max-w-xs text-sm text-slate-600">
          The error was not your fault. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 min-w-11 rounded-lg bg-slate-900 px-6 py-3 text-white"
        >
          Reload
        </button>
      </div>
    );
  }
}
