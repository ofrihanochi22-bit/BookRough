import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Button } from './Button';

/** Offline, a screen without a saved copy was never loaded (docs/features/pwa-offline.md §5.3). */
export const NOT_LOADED_OFFLINE = "You're offline, and this wasn't loaded before.";

interface LoadErrorProps {
  /** What failed, e.g. "Couldn't load your communities." */
  message: string;
  onRetry: () => void;
}

/** The error state of a screen whose data failed to load (CLAUDE.md §8). */
export function LoadError({ message, onRetry }: LoadErrorProps) {
  const online = useOnlineStatus();

  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-sm text-muted">{online ? message : NOT_LOADED_OFFLINE}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
