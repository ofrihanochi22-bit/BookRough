import type { ReactNode } from 'react';

/** A 24-unit stroked icon at 20px, decorative: the words beside it carry the meaning. */
export function LineIcon({
  children,
  className = 'size-5',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
