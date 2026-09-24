import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App } from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('routing', () => {
  it('renders Welcome at /', () => {
    // Arrange & Act
    renderAt('/');

    // Assert
    expect(screen.getByRole('heading', { name: 'BookRough' })).toBeInTheDocument();
  });

  it('renders Complete your profile at /onboarding', () => {
    // Arrange & Act
    renderAt('/onboarding');

    // Assert
    expect(screen.getByRole('heading', { name: 'Complete your profile' })).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown path', () => {
    // Arrange & Act
    renderAt('/no-such-page');

    // Assert
    expect(screen.getByRole('heading', { name: /doesn't exist/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('has no /login route — signing in is a button on Welcome, not a screen', () => {
    // Arrange & Act
    renderAt('/login');

    // Assert
    expect(screen.getByRole('heading', { name: /doesn't exist/ })).toBeInTheDocument();
  });
});
