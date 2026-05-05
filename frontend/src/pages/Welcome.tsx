/**
 * Landing page — shown to unauthenticated visitors at /.
 *
 * Three CTAs: Sign Up, Log In, and Google Sign-In.
 * Wrapped by <RedirectIfAuthed> so signed-in users never see it.
 */

import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      {/* Brand */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-indigo-600">
          BookRough
        </h1>
        <p className="mt-3 text-lg text-gray-500">
          Share music with friends — any streaming service.
        </p>
      </div>

      {/* CTAs */}
      <div className="w-full max-w-xs space-y-3">
        <Button className="w-full" onClick={() => navigate("/signup")}>
          Create an account
        </Button>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => navigate("/login")}
        >
          Log in
        </Button>

        <div className="relative my-4 flex items-center">
          <div className="flex-1 border-t border-gray-200" />
          <span className="mx-3 text-xs text-gray-400">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <GoogleSignInButton />
      </div>
    </div>
  );
}
