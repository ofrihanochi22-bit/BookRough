/**
 * RequireAuth — route guard for protected pages.
 *
 * Three possible states:
 *   loading  → show a full-screen spinner (hydration not yet complete)
 *   guest    → redirect to /login, stashing the originating path in location.state
 *              so the login page can redirect back after authentication
 *   authed   → render children; but if the user hasn't completed their profile
 *              (Google sign-up without onboarding), redirect to /onboarding first
 */

import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export function RequireAuth() {
  const { status, user } = useAuthStore();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (status === "guest") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Google users who haven't finished onboarding must complete it first
  if (user && !user.profileComplete && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
