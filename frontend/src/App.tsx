/**
 * App — root component.
 *
 * Deliberately thin: just renders the route tree.
 * All providers (BrowserRouter, GoogleOAuthProvider, ErrorBoundary, Toaster)
 * are mounted in main.tsx so App stays unit-testable in isolation.
 */

import { AppRoutes } from "./router/AppRoutes";

export default function App() {
  return <AppRoutes />;
}
