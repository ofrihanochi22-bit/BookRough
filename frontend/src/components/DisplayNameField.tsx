import type { DisplayNameStatus } from '../hooks/useDisplayNameStatus';
import {
  cleanDisplayName,
  DISPLAY_NAME_MESSAGES,
  graphemeCount,
  MAX_GRAPHEMES,
  MIN_GRAPHEMES,
} from '../lib/displayName';

interface DisplayNameFieldProps {
  value: string;
  onChange: (value: string) => void;
  status: DisplayNameStatus;
  /** The button that will re-check the name, named in the "couldn't check" line. */
  submitVerb: 'continue' | 'save';
}

/**
 * The display-name input, its counter and its status line — shared by Complete
 * Your Profile and My Profile so both apply docs/features/onboarding.md §4 and
 * §6 the same way.
 */
export function DisplayNameField({ value, onChange, status, submitVerb }: DisplayNameFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="display-name" className="text-sm font-medium">
          Display name
        </label>
        <span className="text-xs text-muted" aria-hidden="true">
          {graphemeCount(cleanDisplayName(value))}/{MAX_GRAPHEMES}
        </span>
      </div>
      <input
        id="display-name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={200}
        autoComplete="nickname"
        aria-describedby="display-name-status"
        aria-invalid={isBad(status)}
        className="min-h-11 rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none focus:border-accent"
      />
      <NameStatusLine status={status} submitVerb={submitVerb} />
    </div>
  );
}

function isBad(status: DisplayNameStatus): boolean {
  return status.kind === 'invalid' || status.kind === 'taken' || status.kind === 'reserved';
}

const STATUS_TEXT: Partial<Record<DisplayNameStatus['kind'], string>> = {
  checking: 'Checking…',
  available: '✓ Available',
  taken: DISPLAY_NAME_MESSAGES.taken,
  reserved: DISPLAY_NAME_MESSAGES.reserved,
};

const HINT = `Any language. ${MIN_GRAPHEMES}–${MAX_GRAPHEMES} characters.`;

function NameStatusLine({
  status,
  submitVerb,
}: {
  status: DisplayNameStatus;
  submitVerb: 'continue' | 'save';
}) {
  const text =
    status.kind === 'invalid'
      ? status.message
      : status.kind === 'unknown'
        ? `Couldn't check right now — we'll check when you ${submitVerb}.`
        : (STATUS_TEXT[status.kind] ?? HINT);
  const tone = isBad(status)
    ? 'text-danger'
    : status.kind === 'available'
      ? 'text-accent'
      : 'text-muted';

  return (
    <p id="display-name-status" aria-live="polite" className={`min-h-5 text-xs ${tone}`}>
      {text}
    </p>
  );
}
