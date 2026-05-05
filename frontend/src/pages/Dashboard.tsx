/**
 * Dashboard placeholder (Phase 1 stub).
 *
 * Real communities feed lands in Phase 2 (Step 2.5). This screen just
 * proves the auth guard works and the user object is accessible from the store.
 */

import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { useAuthStore } from "../stores/authStore";

export function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {user?.displayName ?? "there"}!
        </h1>
        <p className="mt-2 text-gray-500">
          The communities feed is coming in Phase 2.
        </p>
      </div>

      <Button variant="secondary" onClick={handleLogout}>
        Log out
      </Button>
    </div>
  );
}
