import type { ReactNode } from 'react';

import { Button } from './Button';
import { Sheet } from './Sheet';

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  /** Shown in `danger`: a removal or a deletion. */
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  title: string;
  actions: readonly SheetAction[];
  onClose: () => void;
}

/**
 * The Mixtape ⋯ menu (docs/features/ui-redesign.md §5.0, §5.16): a bottom
 * sheet with one row per permitted action and a Cancel pill. What a row leads
 * to (a confirmation sheet, an edit) is unchanged.
 */
export function ActionSheet({ title, actions, onClose }: ActionSheetProps) {
  return (
    <Sheet title={title} onClose={onClose}>
      <ul className="flex flex-col gap-1">
        {actions.map((action) => (
          <li key={action.label}>
            <button
              type="button"
              disabled={action.disabled}
              onClick={action.onSelect}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium disabled:opacity-50 ${
                action.danger ? 'text-danger' : ''
              }`}
            >
              {action.icon}
              {action.label}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onClose} className="mt-4 w-full">
        Cancel
      </Button>
    </Sheet>
  );
}
