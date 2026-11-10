import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_EMPTY, SEARCH_FAILED, SEARCH_HINT } from '../lib/profileCopy';
import { useAuthStore } from '../stores/auth';
import { makeSession, networkError, resetAuthStore, setDesign, setOnline } from '../test/fixtures';
import { Search } from './Search';

const { searchUsers } = vi.hoisted(() => ({ searchUsers: vi.fn() }));
vi.mock('../api/profiles', () => ({ searchUsers }));

const DANA = { id: 'dana', displayName: 'Dana Levi', profilePictureUrl: null };
const DANIEL = { id: 'daniel', displayName: 'Daniel Cohen', profilePictureUrl: null };

function renderSearch(path = '/search') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/search" element={<Search />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
});

afterEach(() => {
  cleanup();
  resetAuthStore();
  setDesign('current');
});

describe('Search under Mixtape (ui-redesign.md §5.7)', () => {
  it('shows the logo, the heading and the pill field with its label and placeholder', () => {
    // Act
    renderSearch();

    // Assert
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();
    const field = screen.getByLabelText('Search people');
    expect(field).toHaveAttribute('placeholder', 'Display name');
    expect(field.className).toContain('rounded-full');
    expect(field).toHaveFocus();
    expect(screen.getByText(SEARCH_HINT)).toBeInTheDocument();
  });

  it('lists results in one card of rows linking to profiles, with no friend button', async () => {
    // Arrange
    searchUsers.mockResolvedValue({ users: [DANA, DANIEL], hasMore: false });

    // Act
    renderSearch('/search?q=Dan');

    // Assert
    const list = await screen.findByRole('list', { name: 'Results' });
    expect(list.className).toContain('divide-y');
    expect(within(list).getByRole('link', { name: 'Dana Levi' })).toHaveAttribute(
      'href',
      '/users/dana',
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows row skeletons while searching', async () => {
    // Arrange
    searchUsers.mockReturnValue(new Promise(() => {}));

    // Act
    renderSearch('/search?q=Dan');

    // Assert
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
  });

  it('shows no results in the kit frame', async () => {
    // Arrange
    searchUsers.mockResolvedValue({ users: [], hasMore: false });

    // Act
    renderSearch('/search?q=zz');

    // Assert
    const empty = await screen.findByText(SEARCH_EMPTY);
    expect(empty.parentElement?.className).toContain('border-dashed');
  });

  it('shows the error with Try again, which searches again', async () => {
    // Arrange
    searchUsers
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue({ users: [DANA], hasMore: false });
    renderSearch('/search?q=Dan');

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Assert
    expect(screen.queryByText(SEARCH_FAILED)).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Dana Levi' })).toBeInTheDocument();
  });

  it('disables the field offline', () => {
    // Arrange
    setOnline(false);

    // Act
    renderSearch();

    // Assert
    expect(screen.getByLabelText('Search people')).toBeDisabled();
  });
});
