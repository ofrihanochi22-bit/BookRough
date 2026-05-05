/**
 * Google Sign-In button.
 *
 * Wraps @react-oauth/google's <GoogleLogin> component. On success it:
 *   1. Sends the ID token to the backend.
 *   2. Updates the auth store.
 *   3. Navigates to /onboarding (new Google users) or /dashboard (returning).
 *
 * On failure it shows a toast (the axios interceptor handles this if it's an
 * API error; here we also cover the client-side Google popup failure).
 */

import { GoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { googleLogin } from "../api/auth";
import { useAuthStore } from "../stores/authStore";

export function GoogleSignInButton() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  return (
    <GoogleLogin
      onSuccess={async (credentialResponse) => {
        const idToken = credentialResponse.credential;
        if (!idToken) {
          toast.error("Google sign-in failed — no credential returned.");
          return;
        }
        try {
          const { user, requiresOnboarding } = await googleLogin(idToken);
          setUser(user);
          navigate(requiresOnboarding ? "/onboarding" : "/dashboard");
        } catch {
          // axios interceptor already showed a toast for API errors
        }
      }}
      onError={() => {
        toast.error("Google sign-in failed. Please try again.");
      }}
      useOneTap={false}
      width="100%"
    />
  );
}
