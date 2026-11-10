import type { ReactNode } from 'react';

import { ReelCassette } from './Cassette';

interface EmptyStateProps {
  /** The screen's existing empty heading. */
  title: string;
  /** One line of the screen's existing copy. */
  children?: ReactNode;
  /** The screen's existing action, if it has one. */
  action?: ReactNode;
}

/**
 * The Mixtape empty state (docs/features/ui-redesign.md §5.0c): a dashed
 * `line` frame, a small still cassette, the heading in the display face, one
 * line of copy and the screen's own action. Copy always comes from the screen.
 */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[22px] border-[1.5px] border-dashed border-line px-6 py-8 text-center">
      <ReelCassette className="w-16" />
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {children && <p className="text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
