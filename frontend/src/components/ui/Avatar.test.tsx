import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';
import { avatarHue, initials } from './avatarParts';

const ID = '6f1c1c3e-3b1a-4a52-9f0e-2d7c1b0f4a11';

describe('Avatar', () => {
  it('shows the Google picture when there is one', () => {
    // Act
    render(<Avatar id={ID} name="Ofri" pictureUrl="https://pic/1" />);

    // Assert
    expect(screen.getByRole('img', { name: 'Ofri' })).toHaveAttribute('src', 'https://pic/1');
  });

  it('falls back to initials when the picture fails to load', () => {
    // Arrange
    render(<Avatar id={ID} name="Ofri Hanochi" pictureUrl="https://pic/broken" />);

    // Act
    fireEvent.error(screen.getByRole('img', { name: 'Ofri Hanochi' }));

    // Assert
    expect(screen.getByRole('img', { name: 'Ofri Hanochi' })).toHaveTextContent('OH');
  });

  it('shows initials when there is no picture', () => {
    // Act
    render(<Avatar id={ID} name="עופרי חנוכי" />);

    // Assert
    expect(screen.getByRole('img', { name: 'עופרי חנוכי' })).toHaveTextContent('עח');
  });

  it('shows a neutral glyph for a user who has not chosen a name yet', () => {
    // Act
    render(<Avatar id={ID} name={null} />);

    // Assert
    expect(screen.getByRole('img', { name: 'Your avatar' })).toHaveTextContent('♪');
  });
});

describe('avatarParts', () => {
  it('derives the same hue from the same id every time', () => {
    // Act & Assert
    expect(avatarHue(ID)).toBe(avatarHue(ID));
  });

  it('spreads different ids across hues', () => {
    // Arrange
    const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`);

    // Act
    const hues = new Set(ids.map(avatarHue));

    // Assert
    expect(hues.size).toBeGreaterThan(1);
  });

  it('takes the first letter of up to two words, upper-cased', () => {
    // Act & Assert
    expect(initials('  dana   levi  cohen ')).toBe('DL');
    expect(initials('Ofri')).toBe('O');
  });

  it('keeps an emoji whole rather than splitting a surrogate pair', () => {
    // Act & Assert
    expect(initials('🎧 Ofri')).toBe('🎧O');
  });

  it('skips punctuation: leading symbols are dropped and symbol-only words ignored', () => {
    // Act & Assert
    expect(initials('(Friday) Jazz')).toBe('FJ');
    expect(initials('& Friends')).toBe('F');
    expect(initials('"Quotes" club')).toBe('QC');
    expect(initials('!!!')).toBe('');
  });
});
