import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Button } from './Button';

/** Offline, a screen without a saved copy was never loaded (docs/features/pwa-offline.md §5.3). */
export const NOT_LOADED_OFFLINE = "You're offline, and this wasn't loaded before.";

interface LoadErrorProps {
  /** What failed, e.g. "Couldn't load your communities." */
  message: string;
  onRetry: () => void;
}

/**
 * The error state of a screen whose data failed to load (CLAUDE.md §8): a
 * quiet `surface` row with an outlined Retry (ui-redesign.md §5.0c).
 */
export function LoadError({ message, onRetry }: LoadErrorProps) {
  const online = useOnlineStatus();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-[22px] bg-surface py-2 pr-2 pl-4"
    >
      <p className="text-sm text-muted">{online ? message : NOT_LOADED_OFFLINE}</p>
      <Button variant="secondary" onClick={onRetry} className="shrink-0">
        Try again
      </Button>
    </div>
  );
}
