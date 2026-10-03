import { Button } from './Button';

interface LoadErrorProps {
  /** What failed, e.g. "Couldn't load your communities." */
  message: string;
  onRetry: () => void;
}

/** The error state of a screen whose data failed to load (CLAUDE.md §8). */
export function LoadError({ message, onRetry }: LoadErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-sm text-muted">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
