import { useMixtape } from '../../stores/design';

/**
 * A placeholder block for content that is still loading (CLAUDE.md §8). Under
 * Mixtape it is static — motion is reserved for the reels (ui-redesign.md §5.0c).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  const mixtape = useMixtape();
  return (
    <div
      aria-hidden="true"
      className={`${mixtape ? 'bg-skeleton' : 'animate-pulse bg-line'} rounded-xl ${className}`}
    />
  );
}
