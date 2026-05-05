/**
 * RedirectIfAuthed — inverse of RequireAuth.
 *
 * Prevents authenticated users from seeing auth-only pages (welcome, login,
 * signup, forgot password). If they're already signed in, send them to /dashboard.
 *
 * While hydration is in progress (status === "loading") we render nothing to
 * avoid a flash of the login screen for already-authenticated users.
 */

import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export function RedirectIfAuthed() {
  const { status } = useAuthStore();

  if (status === "loading") {
    // Render nothing during hydration to prevent flicker
    return null;
  }

  if (status === "authed") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
