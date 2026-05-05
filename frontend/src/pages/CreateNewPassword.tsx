/**
 * Create-new-password screen (UC-17).
 *
 * Reached from the reset link in the email: /reset/:token.
 * Validates the two-password match client-side before hitting the API.
 * On success, toasts and redirects to /login.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AuthLayout } from "../components/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { resetPassword } from "../api/auth";

export function CreateNewPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const next = { password: "", confirm: "" };
    if (password.length < 8) next.password = "At least 8 characters";
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
      next.password = "Must contain a letter and a digit";
    if (password !== confirm) next.confirm = "Passwords do not match";
    setErrors(next);
    return !next.password && !next.confirm;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !token) return;

    setLoading(true);
    try {
      await resetPassword({ token, newPassword: password });
      toast.success("Password updated! Please log in.");
      navigate("/login");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Reset failed. The link may have expired.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create new password"
      subtitle="Choose a strong password for your account."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />

        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          required
        />

        <Button type="submit" className="w-full" loading={loading}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
