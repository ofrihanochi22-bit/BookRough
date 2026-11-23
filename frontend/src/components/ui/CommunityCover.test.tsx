import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CommunityCover } from './CommunityCover';

/** The photo variant — docs/features/community-photo.md §5.1. */
const ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';
const PHOTO = `/api/communities/${ID}/photo?v=1795348800000`;

describe('CommunityCover — photo', () => {
  it.each(['thumb', 'card', 'banner'] as const)(
    'shows the photo in place of the reels (%s)',
    (variant) => {
      // Act
      render(<CommunityCover id={ID} name="Friday Jazz" variant={variant} photoUrl={PHOTO} />);

      // Assert
      const photo = screen.getByTestId('cover-photo');
      expect(photo).toHaveAttribute('src', expect.stringContaining(PHOTO));
      expect(photo).toHaveAttribute('alt', '');
      expect(screen.getByTestId('cover-stripe')).toBeInTheDocument();
    },
  );

  it('keeps the generated reels without a photo', () => {
    // Act
    render(<CommunityCover id={ID} name="Friday Jazz" variant="card" photoUrl={null} />);

    // Assert
    expect(screen.queryByTestId('cover-photo')).not.toBeInTheDocument();
  });

  it('falls back to the reels when the image fails to load (a signed-out 401)', () => {
    // Arrange
    render(<CommunityCover id={ID} name="Friday Jazz" variant="banner" photoUrl={PHOTO} />);

    // Act
    fireEvent.error(screen.getByTestId('cover-photo'));

    // Assert
    expect(screen.queryByTestId('cover-photo')).not.toBeInTheDocument();
  });

  it('gives a new upload its own chance after a failed one', () => {
    // Arrange
    const { rerender } = render(
      <CommunityCover id={ID} name="Friday Jazz" variant="card" photoUrl={PHOTO} />,
    );
    fireEvent.error(screen.getByTestId('cover-photo'));

    // Act
    rerender(<CommunityCover id={ID} name="Friday Jazz" variant="card" photoUrl={`${PHOTO}1`} />);

    // Assert
    expect(screen.getByTestId('cover-photo')).toBeInTheDocument();
  });
});
