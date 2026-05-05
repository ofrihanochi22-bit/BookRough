/**
 * Onboarding screen (UC-1 — Google signup completion).
 *
 * Shown to new Google users who have `profileComplete === false`.
 * They must choose a username and preferred streaming service before
 * reaching the dashboard.  RequireAuth redirects them here automatically.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AuthLayout } from "../components/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { completeOnboarding } from "../api/users";
import { useAuthStore } from "../stores/authStore";
import { STREAMING_SERVICES } from "../types/user";

export function Onboarding() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [username, setUsername] = useState("");
  const [preferredService, setPreferredService] = useState("SPOTIFY");
  const [usernameError, setUsernameError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    if (username.length < 3) {
      setUsernameError("At least 3 characters");
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameError("Letters, digits, and underscores only");
      return false;
    }
    setUsernameError("");
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const user = await completeOnboarding({ username, preferredService });
      setUser(user);
      navigate("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not save profile. Please try again.";
      if (message.toLowerCase().includes("taken")) {
        setUsernameError("That username is already taken");
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Complete your profile"
      subtitle="Choose a username and your preferred streaming service."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={usernameError}
          placeholder="letters, digits, underscores"
          required
        />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="preferredService"
            className="text-sm font-medium text-gray-700"
          >
            Preferred streaming service
          </label>
          <select
            id="preferredService"
            value={preferredService}
            onChange={(e) => setPreferredService(e.target.value)}
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
          Save and continue
        </Button>
      </form>
    </AuthLayout>
  );
}
