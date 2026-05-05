/**
 * Forgot-password screen (UC-17).
 *
 * Submits an email; the backend always returns 200 (enumeration prevention).
 * Once submitted, a confirmation message replaces the form so the user knows
 * to check their inbox.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AuthLayout } from "../components/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { forgot } from "../api/auth";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await forgot(email);
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-center text-sm text-gray-600">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a
          reset link. It expires in 1 hour.
        </p>
        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Back to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send a reset link."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Button type="submit" className="w-full" loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link
          to="/login"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Back to login
        </Link>
      </p>
    </AuthLayout>
  );
}
