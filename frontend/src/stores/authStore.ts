/**
 * Zustand auth store — single source of truth for the current session.
 *
 * States:
 *   loading  — initial hydration in progress (app just mounted)
 *   authed   — a valid session cookie exists; `user` is populated
 *   guest    — no session; `user` is null
 *
 * The store is hydrated once on app boot by calling `hydrate()` in main.tsx.
 * Route guards read `status` to decide whether to show a spinner, redirect to
 * /login, or redirect to /onboarding (incomplete Google users).
 */

import { create } from "zustand";
import type { User } from "../types/user";

type AuthStatus = "loading" | "authed" | "guest";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  /** Called once on mount — fetches the current session from the backend. */
  hydrate: () => Promise<void>;
  setUser: (user: User) => void;
  clearUser: () => void;
  /** Full logout — calls the API then clears local state. */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  hydrate: async () => {
    try {
      // Lazy import to avoid circular dependency between client.ts ↔ authStore.ts
      const { api } = await import("../api/client");
      // skipAuthRedirect prevents the 401 interceptor from redirecting to /login
      // when we're just probing for an existing session (401 = guest, not an error).
      const res = await api.get<{ data: { user: User } }>("/auth/me", {
        skipAuthRedirect: true,
      } as object);
      set({ user: res.data.data.user, status: "authed" });
    } catch {
      // 401 is expected for unauthenticated visitors; any other error also = guest
      set({ user: null, status: "guest" });
    }
  },

  setUser: (user) => set({ user, status: "authed" }),

  clearUser: () => set({ user: null, status: "guest" }),

  logout: async () => {
    try {
      const { api } = await import("../api/client");
      await api.post("/auth/logout");
    } finally {
      // Always clear local state even if the server request fails
      set({ user: null, status: "guest" });
    }
  },
}));
