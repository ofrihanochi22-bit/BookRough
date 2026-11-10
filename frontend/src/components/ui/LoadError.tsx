import { useMixtape } from '../../stores/design';
import { Button } from './Button';

interface LoadErrorProps {
  /** What failed, e.g. "Couldn't load your communities." */
  message: string;
  onRetry: () => void;
}

/**
 * The error state of a screen whose data failed to load (CLAUDE.md §8). Under
 * Mixtape a quiet `surface` row with an outlined Retry (ui-redesign.md §5.0c).
 */
export function LoadError({ message, onRetry }: LoadErrorProps) {
  const mixtape = useMixtape();
  if (mixtape) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-[22px] bg-surface py-2 pr-2 pl-4"
      >
        <p className="text-sm text-muted">{message}</p>
        <Button variant="secondary" onClick={onRetry} className="shrink-0">
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-sm text-muted">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
