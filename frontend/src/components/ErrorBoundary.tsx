/**
 * React Error Boundary — catches runtime errors in the component tree.
 *
 * Wraps the routed application in App.tsx so that if any page component throws,
 * the whole app doesn't go white. Instead it shows a localised fallback UI with
 * a "Reload page" button.
 *
 * Must be a class component — React's error boundary API (`componentDidCatch`)
 * is only available on class components as of React 19. React Testing Library
 * renders it cleanly in tests.
 *
 * See: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback; defaults to the built-in card. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Only log in development; in production ship to an error-tracking service
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-xl font-semibold text-gray-900">
              Something went wrong
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              An unexpected error occurred. Reloading usually fixes it.
            </p>
            <button
              onClick={this.handleReload}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
