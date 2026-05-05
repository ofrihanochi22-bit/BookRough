/**
 * Registration screen (UC-1).
 *
 * Collects email, username, display name, password, and preferred streaming
 * service. On success the user is immediately logged in (the register endpoint
 * issues a session cookie) and navigated to /dashboard.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AuthLayout } from "../components/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { register } from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { STREAMING_SERVICES } from "../types/user";

export function Register() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [form, setForm] = useState({
    email: "",
    username: "",
    displayName: "",
    password: "",
    preferredService: "SPOTIFY",
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function validate(): boolean {
    const next: Partial<typeof form> = {};
    if (!form.email.includes("@")) next.email = "Valid email required";
    if (form.username.length < 3) next.username = "At least 3 characters";
    if (!/^[a-zA-Z0-9_]+$/.test(form.username))
      next.username = "Letters, digits, and underscores only";
    if (form.displayName.trim().length === 0)
      next.displayName = "Display name is required";
    if (form.password.length < 8) next.password = "At least 8 characters";
    if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password))
      next.password = "Must contain a letter and a digit";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const user = await register(form);
      setUser(user);
      navigate("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Registration failed.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Join BookRough and share your music"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          error={errors.email}
          required
        />

        <Input
          label="Username"
          autoComplete="username"
          value={form.username}
          onChange={set("username")}
          error={errors.username}
          placeholder="letters, digits, underscores"
          required
        />

        <Input
          label="Display name"
          autoComplete="name"
          value={form.displayName}
          onChange={set("displayName")}
          error={errors.displayName}
          required
        />

        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          error={errors.password}
          required
        />

        {/* Preferred streaming service */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="preferredService"
            className="text-sm font-medium text-gray-700"
          >
            Preferred streaming service
          </label>
          <select
            id="preferredService"
            value={form.preferredService}
            onChange={set("preferredService")}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STREAMING_SERVICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>

      <div className="relative my-6 flex items-center">
        <div className="flex-1 border-t border-gray-200" />
        <span className="mx-3 text-xs text-gray-400">or</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <GoogleSignInButton />

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
