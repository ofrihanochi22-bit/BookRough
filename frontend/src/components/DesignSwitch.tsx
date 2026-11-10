import { useDesignStore } from '../stores/design';
import type { Design } from '../lib/design';
import { PillTrack } from './ui/PillTrack';

const OPTIONS: readonly { value: Design; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'mixtape', label: 'Mixtape' },
];

/**
 * The per-device design switch on the Admin screen — docs/features/ui-redesign.md
 * §4, §5.17. Shown under both designs, since it is how this device moves from one
 * to the other. The choice applies at once and is kept in local storage only:
 * nothing is sent to the server. Removed in the cleanup PR.
 */
export function DesignSwitch() {
  const design = useDesignStore((state) => state.design);
  const setDesign = useDesignStore((state) => state.setDesign);

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-[22px] border-[1.5px] border-dashed border-line p-4">
      {/* The visible label; the track carries the same words as its accessible name. */}
      <p aria-hidden="true" className="text-sm font-semibold">
        Design on this device
      </p>
      <PillTrack
        label="Design on this device"
        options={OPTIONS}
        value={design}
        onChange={setDesign}
      />
      <p className="text-xs text-muted">Only this device. Everyone else sees Current.</p>
    </div>
  );
}
