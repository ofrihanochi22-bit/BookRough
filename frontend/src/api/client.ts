import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';

/** Shape of every error body the backend produces (CLAUDE.md §4). */
interface ApiErrorBody {
  status: 'error';
  code: number;
  message: string;
}

const OFFLINE_MESSAGE = "Can't reach the server. Check your connection and try again.";
const FALLBACK_MESSAGE = 'Something went wrong.';

/**
 * What happens when the session is gone.
 *
 * Phase 0 only redirects to Welcome. Step 1.5 replaces the body of this
 * function so it also clears the Zustand auth store — keeping it as a single
 * named seam means the interceptor below never has to change.
 */
export function onUnauthorized(): void {
  if (window.location.pathname !== '/') {
    window.location.assign('/');
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
    // No response at all: DNS failure, offline, CORS, or a timeout. This is not
    // a 4xx/5xx and must not be treated as one.
    if (!error.response) {
      toast.error(OFFLINE_MESSAGE);
      return Promise.reject(error);
    }

    const { status, data } = error.response;

    if (status === 401) {
      onUnauthorized();
      return Promise.reject(error);
    }

    toast.error(data?.message ?? FALLBACK_MESSAGE);
    return Promise.reject(error);
  },
);
