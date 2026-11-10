import type { ReactNode } from 'react';

import { ReelCassette } from './Cassette';

interface EmptyStateProps {
  /** The screen's existing empty heading; a screen whose empty copy is one sentence has none. */
  title?: string;
  /** One line of the screen's existing copy. */
  children?: ReactNode;
  /** The screen's existing action, if it has one. */
  action?: ReactNode;
  /** The heading's level: 2 by default, 3 inside a section that has its own h2. */
  level?: 2 | 3;
}

/**
 * The Mixtape empty state (docs/features/ui-redesign.md §5.0c): a dashed
 * `line` frame, a small still cassette, the heading in the display face, one
 * line of copy and the screen's own action. Copy always comes from the screen.
 */
export function EmptyState({ title, children, action, level = 2 }: EmptyStateProps) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <div className="flex flex-col items-center gap-3 rounded-[22px] border-[1.5px] border-dashed border-line px-6 py-8 text-center">
      <ReelCassette className="w-16" />
      {title && <Heading className="font-display text-lg font-bold">{title}</Heading>}
      {children && <p className="text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
