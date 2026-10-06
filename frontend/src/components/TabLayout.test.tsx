import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TabLayout } from './TabLayout';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/home" element={<h1>Home screen</h1>} />
          <Route path="/search" element={<h1>Search screen</h1>} />
          <Route path="/my-list" element={<h1>My List screen</h1>} />
          <Route path="/profile" element={<h1>Profile screen</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('TabLayout and BottomNav', () => {
  it('shows four tabs and marks the current one', () => {
    // Act
    renderAt('/home');

    // Assert
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const tabs = ['Home', 'Search', 'My List', 'Profile'].map((name) =>
      screen.getByRole('link', { name }),
    );
    expect(nav).toContainElement(tabs[0]!);
    expect(tabs[0]).toHaveAttribute('aria-current', 'page');
    expect(tabs[1]).not.toHaveAttribute('aria-current');
  });

  it('switches screens through the tabs', async () => {
    // Arrange
    renderAt('/home');

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Search' }));

    // Assert
    expect(screen.getByRole('heading', { name: 'Search screen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('aria-current', 'page');
  });
});
