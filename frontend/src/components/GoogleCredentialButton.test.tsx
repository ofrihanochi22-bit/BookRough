import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setOnline } from '../test/fixtures';
import { GoogleCredentialButton } from './GoogleCredentialButton';

// Google's button is an external boundary: one plain button standing in for its iframe.
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: () => <button>Continue with Google</button>,
}));

beforeEach(() => {
  setOnline(true);
});

describe('GoogleCredentialButton — the backdrop behind Google’s iframe', () => {
  it('gives the iframe the light scheme its page declares, so dark mode paints no white box', () => {
    // Arrange
    render(<GoogleCredentialButton onCredential={vi.fn()} busyLabel="Signing you in…" />);

    // Act
    const wrapper = screen.getByRole('button', { name: 'Continue with Google' }).closest('div');

    // Assert
    expect(wrapper).toHaveStyle({ colorScheme: 'normal' });
  });
});
