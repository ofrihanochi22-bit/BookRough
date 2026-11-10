import { TAPE_PAPER } from './tape';

interface PillTrackProps<T extends string> {
  /** The group's accessible name, e.g. "Which list". */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * The Mixtape two-option switch (ui-redesign.md §5.5): one `surface` track,
 * the selected side on `tape` paper (never the accent), the other in `muted`.
 * A `role="group"` of `aria-pressed` buttons, each at least 44px tall.
 */
export function PillTrack<T extends string>({
  label,
  options,
  value,
  onChange,
}: PillTrackProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full bg-surface p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-11 flex-1 rounded-full text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              selected ? TAPE_PAPER : 'text-muted'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
