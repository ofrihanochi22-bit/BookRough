import axios, { type AxiosError } from 'axios';
import toast from 'react-hot-toast';

import { useAuthStore } from '../stores/auth';

/** Shape of every error body the backend produces (CLAUDE.md §4). */
interface ApiErrorBody {
  status: 'error';
  code: number;
  message: string;
}

const OFFLINE_MESSAGE = "Can't reach the server. Check your connection and try again.";
const FALLBACK_MESSAGE = 'Something went wrong.';

/**
 * What happens when the session is gone: the auth store is cleared, and the
 * route guards (components/RouteGuards.tsx) redirect to Welcome from whatever
 * protected screen was open. Navigating through the router rather than
 * reloading the page keeps the redirect instant and avoids a second /auth/me.
 */
export function onUnauthorized(): void {
  useAuthStore.getState().clear();
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** The caller shows its own inline error, so the global toast is skipped. */
    skipErrorToast?: boolean;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api',
  // The session is an HttpOnly cookie, so every request must carry credentials.
  withCredentials: true,
  timeout: 15_000,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const quiet = error.config?.skipErrorToast === true;

    // No response at all: DNS failure, offline, CORS, or a timeout. This is not
    // a 4xx/5xx and must not be treated as one.
    if (!error.response) {
      if (!quiet) {
        toast.error(OFFLINE_MESSAGE);
      }
      return Promise.reject(error);
    }

    const { status, data } = error.response;

    if (status === 401) {
      onUnauthorized();
      return Promise.reject(error);
    }

    if (!quiet) {
      toast.error(data?.message ?? FALLBACK_MESSAGE);
    }
    return Promise.reject(error);
  },
);
