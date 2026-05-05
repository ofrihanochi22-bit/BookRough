/**
 * Login screen (UC-2).
 *
 * Submits email + password; on success sets the auth store and navigates to
 * /dashboard (or to the page the user was trying to reach, stashed in
 * router location state by RequireAuth).
 *
 * Inline field errors are shown from Zod messages returned by the API.
 * Toast errors are suppressed for this form (skipToast flag on the request)
 * so we can display them inline next to the fields instead.
 */

import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { AuthLayout } from "../components/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { login } from "../api/auth";
import { useAuthStore } from "../stores/authStore";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);

  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await login({ email, password });
      setUser(user);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your BookRough account">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          required
        />

        <div className="flex justify-end">
          <Link
            to="/forgot"
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>

      <div className="relative my-6 flex items-center">
        <div className="flex-1 border-t border-gray-200" />
        <span className="mx-3 text-xs text-gray-400">or</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <GoogleSignInButton />

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{" "}
        <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
