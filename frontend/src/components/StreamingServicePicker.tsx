import { STREAMING_SERVICES } from '../lib/streamingServices';
import type { StreamingService } from '../stores/auth';

interface StreamingServicePickerProps {
  value: StreamingService | null;
  onChange: (service: StreamingService) => void;
}

/** "Where do you listen?" — five large radio options; shared by onboarding and My Profile. */
export function StreamingServicePicker({ value, onChange }: StreamingServicePickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-3 text-sm font-medium">Where do you listen?</legend>
      {STREAMING_SERVICES.map((option) => (
        <label
          key={option.value}
          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            value === option.value
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-line bg-surface text-ink'
          }`}
        >
          <input
            type="radio"
            name="service"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="accent-accent"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
