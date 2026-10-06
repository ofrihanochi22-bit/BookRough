import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResults } from '../api/profiles';
import { SEARCH_EMPTY, SEARCH_FAILED, SEARCH_HINT, SEARCH_MORE } from '../lib/profileCopy';
import { useAuthStore } from '../stores/auth';
import { makeSession, makeUser, networkError, resetAuthStore, setOnline } from '../test/fixtures';
import { Search } from './Search';

const { searchUsers } = vi.hoisted(() => ({ searchUsers: vi.fn() }));
vi.mock('../api/profiles', () => ({ searchUsers }));

const VIEWER = makeUser();
const DANA = {
  id: 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  displayName: 'Dana Levi',
  profilePictureUrl: null,
};
const DANIEL = {
  id: 'c2e8d3f5-2b3c-4d4e-9f0a-1b2c3d4e5f60',
  displayName: 'Daniel Cohen',
  profilePictureUrl: null,
};

function found(users: SearchResults['users'], hasMore = false): SearchResults {
  return { users, hasMore };
}

/** Shows the current URL, to assert what the screen wrote into it. */
function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderSearch(path = '/search') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/search"
          element={
            <>
              <Search />
              <Location />
              <Link to="/search">Search tab</Link>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const field = () => screen.getByLabelText('Search people');
const results = () => screen.getByRole('list', { name: 'Results' });

/** A promise resolved from the test, to control the order answers arrive in. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession({ user: VIEWER }));
});

afterEach(() => {
  // Unmount first: resetting the store under a mounted screen re-renders it outside act.
  cleanup();
  resetAuthStore();
});

describe('Search', () => {
  it('shows the hint before typing, with the field focused', async () => {
    // Act
    renderSearch();
    // The no-search answer settles at once; let it.
    await act(async () => {});

    // Assert
    expect(screen.getByText(SEARCH_HINT)).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('searches after typing pauses, keeps the query in the URL, and links each result', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA, DANIEL]));

    // Act
    renderSearch();
    await userEvent.type(field(), 'Dan ');

    // Assert: one request, for the trimmed query.
    const list = await screen.findByRole('list', { name: 'Results' });
    expect(searchUsers).toHaveBeenCalledTimes(1);
    expect(searchUsers).toHaveBeenCalledWith('Dan');
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Dan');
    expect(within(list).getByRole('link', { name: /Dana Levi/ })).toHaveAttribute(
      'href',
      `/users/${DANA.id}`,
    );
    expect(within(list).getAllByRole('link')).toHaveLength(2);
  });

  it('empties the field when the Search tab is tapped again', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA]));
    renderSearch('/search?q=dana');
    await screen.findByText('Dana Levi');

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Search tab' }));

    // Assert
    expect(field()).toHaveValue('');
    expect(screen.getByText(SEARCH_HINT)).toBeInTheDocument();
    expect(screen.queryByText('Dana Levi')).not.toBeInTheDocument();
  });

  it('marks your own row "You" and links it to My Profile', async () => {
    // Arrange
    searchUsers.mockResolvedValue(
      found([{ id: VIEWER.id, displayName: 'Ofri', profilePictureUrl: null }]),
    );

    // Act
    renderSearch('/search?q=ofri');

    // Assert
    await screen.findByRole('list', { name: 'Results' });
    const link = within(results()).getByRole('link');
    expect(link).toHaveTextContent('Ofri · You');
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('restores the query from the URL on arrival', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA]));

    // Act
    renderSearch('/search?q=dana');

    // Assert
    expect(field()).toHaveValue('dana');
    expect(await screen.findByText('Dana Levi')).toBeInTheDocument();
    expect(searchUsers).toHaveBeenCalledWith('dana');
  });

  it('notes when more than 20 matched', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA], true));

    // Act
    renderSearch('/search?q=d');

    // Assert
    expect(await screen.findByText(SEARCH_MORE)).toBeInTheDocument();
  });

  it("shows UC-5's empty state when nobody matches", async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([]));

    // Act
    renderSearch('/search?q=zzz');

    // Assert
    expect(await screen.findByText(SEARCH_EMPTY)).toBeInTheDocument();
  });

  it('treats a blank query in the URL as no search', async () => {
    // Act
    renderSearch('/search?q=%20%20');
    // The no-search answer settles at once; let it.
    await act(async () => {});

    // Assert
    expect(screen.getByText(SEARCH_HINT)).toBeInTheDocument();
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('shows the error state, and Try again runs the same query', async () => {
    // Arrange
    searchUsers.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(found([DANA]));
    renderSearch('/search?q=dana');
    await screen.findByText(SEARCH_FAILED);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('Dana Levi')).toBeInTheDocument();
    expect(searchUsers).toHaveBeenLastCalledWith('dana');
  });

  it('never shows an older answer that arrives after a newer one', async () => {
    // Arrange: "da" answers late, after "dan" has.
    const older = deferred<SearchResults>();
    const newer = deferred<SearchResults>();
    searchUsers.mockImplementation((q: string) => (q === 'da' ? older.promise : newer.promise));
    renderSearch();
    await userEvent.type(field(), 'da');
    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith('da'));
    await userEvent.type(field(), 'n');
    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith('dan'));

    // Act
    newer.resolve(found([DANIEL]));
    await screen.findByText('Daniel Cohen');
    older.resolve(found([DANA]));
    await older.promise;
    // Let the late answer's state update run, if anything would apply it.
    await new Promise((settle) => setTimeout(settle, 0));

    // Assert
    expect(screen.getByText('Daniel Cohen')).toBeInTheDocument();
    expect(screen.queryByText('Dana Levi')).not.toBeInTheDocument();
  });

  it('shows the offline banner and disables the field, keeping results on screen', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA]));
    setOnline(false);

    // Act
    renderSearch('/search?q=dana');

    // Assert
    expect(await screen.findByText('Dana Levi')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline. Connect to search.");
    expect(field()).toBeDisabled();
  });
});
