/**
 * Placeholder. Step 1.5 replaces the body with the real Welcome screen:
 * logo, value proposition, one "Continue with Google" button, and the line
 * stating that the app never asks for a password and never stores an email
 * address (CLAUDE.md §5, §8).
 */
export function Welcome() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">BookRough</h1>
      <p className="max-w-xs text-sm text-slate-600">
        Share music with your friends, whatever service they use.
      </p>
    </main>
  );
}
