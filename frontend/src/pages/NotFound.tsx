import { Link } from 'react-router-dom';

/**
 * Shown for any unknown path. It is also what a non-admin sees when they hit an
 * admin route, so the admin area is never confirmed to exist (CLAUDE.md §17).
 */
export function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">This page doesn&apos;t exist</h1>
      <Link
        to="/"
        className="flex min-h-11 items-center rounded-lg bg-slate-900 px-6 py-3 text-white"
      >
        Go home
      </Link>
    </main>
  );
}
