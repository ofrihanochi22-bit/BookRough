import { STREAMING_SERVICES } from '../lib/streamingServices';
import type { StreamingService } from '../stores/auth';

interface StreamingServicePickerProps {
  value: StreamingService | null;
  onChange: (service: StreamingService) => void;
}

/** "Where do you listen?" — five large radio options; shared by onboarding and My Profile. */
export function StreamingServicePicker({ value, onChange }: StreamingServicePickerProps) {
  // ui-redesign.md §5.11: the selected row outlined in `ink` with a bold name
  // and its accent radio, the others in `line` — the same marking as the
  // avatar tiles (§5.13), never a light fill. Same fieldset and radios.
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-3 text-sm font-medium">Where do you listen?</legend>
      {STREAMING_SERVICES.map((option) => (
        <label
          key={option.value}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl text-sm text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
            // The padding absorbs the thicker border, so choosing a row never shifts the list.
            value === option.value
              ? 'border-2 border-ink px-[15.5px] py-[11.5px] font-semibold'
              : 'border-[1.5px] border-line px-4 py-3 font-medium'
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
