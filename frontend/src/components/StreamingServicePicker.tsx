import { STREAMING_SERVICES } from '../lib/streamingServices';
import type { StreamingService } from '../stores/auth';
import { TAPE_PAPER } from './ui/tape';

interface StreamingServicePickerProps {
  value: StreamingService | null;
  onChange: (service: StreamingService) => void;
}

/** "Where do you listen?" — five large radio options; shared by onboarding and My Profile. */
export function StreamingServicePicker({ value, onChange }: StreamingServicePickerProps) {
  // ui-redesign.md §5.11: the selected row on tape paper with an accent
  // radio, the others outlined in `line`. Same fieldset and radios.
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-3 text-sm font-medium">Where do you listen?</legend>
      {STREAMING_SERVICES.map((option) => (
        <label
          key={option.value}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
            // Same 1.5px border box either way, so choosing a row never shifts the list.
            value === option.value ? `border-transparent ${TAPE_PAPER}` : 'border-line text-ink'
          }`}
        >
          <input
            type="radio"
            name="service"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-4 accent-accent"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
