/**
 * A placeholder block for content that is still loading (CLAUDE.md §8). It is
 * static — motion is reserved for the reels (ui-redesign.md §5.0c).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-xl bg-skeleton ${className}`} />;
}
