/** A placeholder block for content that is still loading (CLAUDE.md §8). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-line ${className}`} />;
}
