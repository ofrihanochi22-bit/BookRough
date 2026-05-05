/**
 * Centralised Axios instance — the only place HTTP calls originate.
 *
 * Configuration:
 *   - baseURL: set from VITE_API_BASE_URL (proxied to /api in development)
 *   - withCredentials: true so the JWT HttpOnly cookie is sent with every request
 *
 * Response interceptor handles two global cases automatically:
 *   1. 401 Unauthorized — clears the auth store and redirects to /login
 *   2. 4xx / 5xx       — shows a toast with the backend's `message` field
 *      (individual forms can suppress the toast by passing { skipToast: true }
 *       in the request config when they want to show inline errors instead)
 *
 * Import only `api` from this module; don't import axios directly in components.
 */

import axios, { type AxiosError } from "axios";
import toast from "react-hot-toast";

export const api = axios.create({
  // Fall back to "" so that requests go to /api/... (proxied by Vite) when the
  // env var is not set. Explicitly set VITE_API_BASE_URL=http://localhost:4000
  // in frontend/.env if you want axios to talk to the backend directly.
  baseURL: `${import.meta.env.VITE_API_BASE_URL ?? ""}/api`,
  withCredentials: true, // sends the bookrough_session cookie on cross-origin requests
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor ────────────────────────────────────────────────────

api.interceptors.response.use(
  // Pass successful responses through untouched
  (response) => response,

  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status;
    const message =
      error.response?.data?.message ?? "Something went wrong. Please try again.";

    // 401 — session expired; clear state and send to login.
    // skipAuthRedirect callers (e.g. hydrate) handle 401 themselves — don't redirect.
    const config = error.config as typeof error.config & {
      skipToast?: boolean;
      skipAuthRedirect?: boolean;
    };
    if (status === 401 && !config?.skipAuthRedirect) {
      import("../stores/authStore").then(({ useAuthStore }) => {
        useAuthStore.getState().clearUser();
      });
      // Only redirect if we're not already on an auth page to avoid loops
      const authPaths = ["/login", "/signup", "/forgot", "/"];
      if (!authPaths.includes(window.location.pathname)) {
        window.location.replace("/login");
      }
      return Promise.reject(error);
    }
    // Suppress toast for expected 401s from probe requests (e.g. hydrate)
    if (!config?.skipToast && !(status === 401 && config?.skipAuthRedirect)) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);
