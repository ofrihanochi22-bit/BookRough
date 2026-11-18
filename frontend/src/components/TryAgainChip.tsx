import { CONVERTING_COPY } from '../lib/postText';
import { CHIP } from './ui/chip';

interface TryAgainChipProps {
  online: boolean;
  retrying: boolean;
  onClick: () => void;
}

/**
 * Try again on a pending post (conversion-retry.md §5, pending-notice-lists.md §5.1):
 * busy while the retry runs, dashed and disabled while offline.
 */
export function TryAgainChip({ online, retrying, onClick }: TryAgainChipProps) {
  return (
    <button
      type="button"
      className={`${CHIP} ${online ? '' : 'border-dashed text-muted'}`}
      disabled={!online || retrying}
      aria-busy={retrying || undefined}
      aria-label={retrying ? undefined : 'Try again to convert this link'}
      onClick={onClick}
    >
      {retrying ? CONVERTING_COPY : 'Try again'}
    </button>
  );
}
