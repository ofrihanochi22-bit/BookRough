import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExternalLink } from './ExternalLink';

describe('ExternalLink (manual-test-fixes-1122.md §5.2)', () => {
  it('opens its address in a new tab, without giving the new page a handle on BookRough', () => {
    // Act
    render(
      <ExternalLink href="https://bandcamp.com/album/x" className="pill">
        Open in Bandcamp
      </ExternalLink>,
    );

    // Assert
    const link = screen.getByRole('link', { name: 'Open in Bandcamp' });
    expect(link).toHaveAttribute('href', 'https://bandcamp.com/album/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('pill');
  });
});
