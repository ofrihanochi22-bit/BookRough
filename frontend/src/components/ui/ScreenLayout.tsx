import type { ReactNode } from 'react';

interface ScreenLayoutProps {
  children: ReactNode;
  /** Centre the content vertically — for single-purpose screens like Welcome. */
  centered?: boolean;
}

/**
 * The phone-first page frame (CLAUDE.md §8): a single column, capped in width
 * so the desktop browser shows the same layout rather than a stretched one.
 */
export function ScreenLayout({ children, centered = false }: ScreenLayoutProps) {
  return (
    <main
      className={`mx-auto flex min-h-full w-full max-w-md flex-col px-6 py-10 ${centered ? 'justify-center' : ''}`}
    >
      {children}
    </main>
  );
}
