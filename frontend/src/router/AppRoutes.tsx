/**
 * Central route table — the ONLY place routes are defined.
 *
 * Structure:
 *   <RedirectIfAuthed>  — public-only routes (login, signup, etc.)
 *   <RequireAuth>       — protected routes (dashboard, communities, etc.)
 *   catch-all           — 404 fallback
 *
 * Phase completion tracking:
 *   Phase 0  ✅ — shell routes (welcome, 404)
 *   Phase 1  ✅ — auth routes (login, signup, forgot, reset, dashboard stub, onboarding)
 *   Phase 2  ⬜ — community routes added in Step 2.5
 *   Phase 3  ⬜ — feed routes added in Step 3.6
 *   Phase 4  ⬜ — my-list route added in Step 4.4
 *   Phase 5  ⬜ — search + friends routes added in Step 5.3
 */

import { Routes, Route } from "react-router-dom";
import { RedirectIfAuthed } from "./RedirectIfAuthed";
import { RequireAuth } from "./RequireAuth";
import { Welcome } from "../pages/Welcome";
import { Login } from "../pages/Login";
import { Register } from "../pages/Register";
import { ForgotPassword } from "../pages/ForgotPassword";
import { CreateNewPassword } from "../pages/CreateNewPassword";
import { Dashboard } from "../pages/Dashboard";
import { Onboarding } from "../pages/Onboarding";
import { NotFound } from "../pages/NotFound";

export function AppRoutes() {
  return (
    <Routes>
      {/* ── Public-only routes (redirect authed users to /dashboard) ──────── */}
      <Route element={<RedirectIfAuthed />}>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Register />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/reset/:token" element={<CreateNewPassword />} />
      </Route>

      {/* ── Protected routes (redirect guests to /login) ───────────────────── */}
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>

      {/* ── 404 fallback ─────────────────────────────────────────────────── */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
