import type { ReactNode } from 'react';

interface ExternalLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * A link that leaves BookRough, always in a new tab
 * (docs/features/manual-test-fixes-1122.md §5.2). The only place in the app
 * that writes a raw `<a href>`; `externalLinks.test.ts` keeps it that way.
 */
export function ExternalLink({ href, className, children }: ExternalLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
