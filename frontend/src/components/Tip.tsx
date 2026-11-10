import { CHIP } from './ui/chip';
import { TAPE_PAPER } from './ui/tape';

interface TipProps {
  children: string;
  onDismiss: () => void;
}

/**
 * A one-time tip in place — docs/features/onboarding-tutorial.md §5.2. A note
 * on tape paper, as the post comment is, with a "Got it" button.
 */
export function Tip({ children, onDismiss }: TipProps) {
  return (
    <div
      role="note"
      className={`flex items-center gap-3 rounded-[12px] py-2 pr-2 pl-4 text-sm ${TAPE_PAPER}`}
    >
      <p className="min-w-0 flex-1 break-words">{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        className={`${CHIP} shrink-0 border-tape-ink text-tape-ink`}
      >
        Got it
      </button>
    </div>
  );
}
