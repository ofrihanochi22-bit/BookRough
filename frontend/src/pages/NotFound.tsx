import { Link } from "react-router-dom";

/** 404 fallback rendered by the router's catch-all route. */
export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-6xl font-bold text-indigo-600">404</h1>
      <p className="text-lg text-gray-600">Page not found.</p>
      <Link
        to="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Go home
      </Link>
    </div>
  );
}
