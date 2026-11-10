import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResults, SearchUser } from '../api/profiles';
import { ACTION_FAILED, REQUEST_SENT } from '../lib/friendCopy';
import { SEARCH_EMPTY, SEARCH_FAILED, SEARCH_HINT, SEARCH_MORE } from '../lib/profileCopy';
import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makeSession,
  makeUser,
  networkError,
  resetAuthStore,
  setDesign,
  setOnline,
} from '../test/fixtures';
import { Search } from './Search';

const { searchUsers, friends, toast } = vi.hoisted(() => ({
  searchUsers: vi.fn(),
  friends: {
    sendFriendRequest: vi.fn(),
    cancelFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    ignoreFriendRequest: vi.fn(),
    countFriendRequests: vi.fn(),
    removeFriend: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../api/profiles', () => ({ searchUsers }));
vi.mock('../api/friends', () => friends);
vi.mock('react-hot-toast', () => ({ default: toast }));

const VIEWER = makeUser();
const DANA: SearchUser = {
  id: 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  displayName: 'Dana Levi',
  profilePictureUrl: null,
  friendship: 'NONE',
};
const DANIEL: SearchUser = {
  id: 'c2e8d3f5-2b3c-4d4e-9f0a-1b2c3d4e5f60',
  displayName: 'Daniel Cohen',
  profilePictureUrl: null,
  friendship: 'NONE',
};
const ME: SearchUser = {
  id: VIEWER.id,
  displayName: 'Ofri',
  profilePictureUrl: null,
  friendship: 'NONE',
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
  friends.countFriendRequests.mockResolvedValue(0);
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
    searchUsers.mockResolvedValue(found([ME]));

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

/** The result row of the person with this name. */
const row = (name: string) => within(screen.getByText(name).closest('li')!);

describe('Search — the friend control on each row (search-friend-button.md §5.1)', () => {
  afterEach(() => setDesign('current'));

  it('shows the control for each state, a quiet label for friends, and none on your own row', async () => {
    // Arrange
    searchUsers.mockResolvedValue(
      found([
        ME,
        { ...DANA, displayName: 'A Stranger', id: 'a0000000-0000-4000-8000-000000000001' },
        {
          ...DANA,
          displayName: 'B Asked',
          id: 'a0000000-0000-4000-8000-000000000002',
          friendship: 'REQUEST_SENT',
        },
        {
          ...DANA,
          displayName: 'C Asker',
          id: 'a0000000-0000-4000-8000-000000000003',
          friendship: 'REQUEST_RECEIVED',
        },
        {
          ...DANA,
          displayName: 'D Friend',
          id: 'a0000000-0000-4000-8000-000000000004',
          friendship: 'FRIENDS',
        },
      ]),
    );

    // Act
    renderSearch('/search?q=a');
    await screen.findByRole('list', { name: 'Results' });

    // Assert
    expect(row('A Stranger').getByRole('button', { name: 'Add Friend' })).toBeEnabled();
    expect(row('B Asked').getByRole('button', { name: 'Request sent' })).toBeEnabled();
    expect(row('C Asker').getByRole('button', { name: 'Respond' })).toBeEnabled();
    expect(row('D Friend').queryByRole('button')).not.toBeInTheDocument();
    expect(row('D Friend').getByText('Friends')).toBeInTheDocument();
    expect(within(screen.getByText('· You').closest('li')!).queryByRole('button')).toBeNull();
  });

  it('Add Friend sends the request and the row becomes Request sent, without searching again', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA, DANIEL]));
    friends.sendFriendRequest.mockResolvedValue('REQUEST_SENT');
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');

    // Act
    await userEvent.click(row('Dana Levi').getByRole('button', { name: 'Add Friend' }));

    // Assert
    expect(friends.sendFriendRequest).toHaveBeenCalledWith(DANA.id);
    expect(toast.success).toHaveBeenCalledWith(REQUEST_SENT);
    expect(row('Dana Levi').getByRole('button', { name: 'Request sent' })).toBeInTheDocument();
    expect(row('Daniel Cohen').getByRole('button', { name: 'Add Friend' })).toBeInTheDocument();
    expect(searchUsers).toHaveBeenCalledTimes(1);
  });

  it('Respond then Accept makes the row Friends; Respond then Ignore makes it Add Friend', async () => {
    // Arrange
    searchUsers.mockResolvedValue(
      found([
        { ...DANA, friendship: 'REQUEST_RECEIVED' },
        { ...DANIEL, friendship: 'REQUEST_RECEIVED' },
      ]),
    );
    friends.acceptFriendRequest.mockResolvedValue(undefined);
    friends.ignoreFriendRequest.mockResolvedValue(undefined);
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');

    // Act
    await userEvent.click(row('Dana Levi').getByRole('button', { name: 'Respond' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await userEvent.click(row('Daniel Cohen').getByRole('button', { name: 'Respond' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ignore' }));

    // Assert
    expect(friends.acceptFriendRequest).toHaveBeenCalledWith(DANA.id);
    expect(row('Dana Levi').queryByRole('button')).not.toBeInTheDocument();
    expect(row('Dana Levi').getByText('Friends')).toBeInTheDocument();
    expect(friends.ignoreFriendRequest).toHaveBeenCalledWith(DANIEL.id);
    expect(row('Daniel Cohen').getByRole('button', { name: 'Add Friend' })).toBeInTheDocument();
  });

  it('Request sent then Cancel request makes the row Add Friend', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([{ ...DANA, friendship: 'REQUEST_SENT' }]));
    friends.cancelFriendRequest.mockResolvedValue('NONE');
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');

    // Act
    await userEvent.click(row('Dana Levi').getByRole('button', { name: 'Request sent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel request' }));

    // Assert
    expect(friends.cancelFriendRequest).toHaveBeenCalledWith(DANA.id);
    expect(row('Dana Levi').getByRole('button', { name: 'Add Friend' })).toBeInTheDocument();
  });

  it('a failed send shows the failure toast and the row keeps Add Friend', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA]));
    friends.sendFriendRequest.mockRejectedValue(networkError());
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');

    // Act
    await userEvent.click(row('Dana Levi').getByRole('button', { name: 'Add Friend' }));

    // Assert
    expect(toast.error).toHaveBeenCalledWith(ACTION_FAILED);
    expect(row('Dana Levi').getByRole('button', { name: 'Add Friend' })).toBeEnabled();
  });

  it('an Accept answered 404 shows the message and searches again for the true state', async () => {
    // Arrange
    searchUsers
      .mockResolvedValueOnce(found([{ ...DANA, friendship: 'REQUEST_RECEIVED' }]))
      .mockResolvedValueOnce(found([DANA]));
    friends.acceptFriendRequest.mockRejectedValue(
      httpError(404, 'This request is no longer available.'),
    );
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');

    // Act
    await userEvent.click(row('Dana Levi').getByRole('button', { name: 'Respond' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    // Assert
    expect(toast.error).toHaveBeenCalledWith('This request is no longer available.');
    await waitFor(() => expect(searchUsers).toHaveBeenCalledTimes(2));
    expect(await row('Dana Levi').findByRole('button', { name: 'Add Friend' })).toBeInTheDocument();
  });

  it('a new search starts from its own answer, not an earlier row change', async () => {
    // Arrange
    searchUsers
      .mockResolvedValueOnce(found([DANA]))
      .mockResolvedValueOnce(found([{ ...DANA, friendship: 'FRIENDS' }]));
    friends.sendFriendRequest.mockResolvedValue('REQUEST_SENT');
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');
    await userEvent.click(row('Dana Levi').getByRole('button', { name: 'Add Friend' }));

    // Act
    await userEvent.type(field(), 'a');

    // Assert
    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith('dana'));
    expect(await row('Dana Levi').findByText('Friends')).toBeInTheDocument();
  });

  it('disables every control offline', async () => {
    // Arrange
    searchUsers.mockResolvedValue(found([DANA, { ...DANIEL, friendship: 'REQUEST_RECEIVED' }]));
    setOnline(false);

    // Act
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');

    // Assert
    expect(row('Dana Levi').getByRole('button', { name: 'Add Friend' })).toBeDisabled();
    expect(row('Daniel Cohen').getByRole('button', { name: 'Respond' })).toBeDisabled();
  });

  it('under Mixtape, Add Friend and Respond are the accent pill; Request sent is outlined', async () => {
    // Arrange
    setDesign('mixtape');
    searchUsers.mockResolvedValue(
      found([
        DANA,
        { ...DANIEL, friendship: 'REQUEST_RECEIVED' },
        {
          ...DANA,
          id: 'a0000000-0000-4000-8000-000000000009',
          displayName: 'Noa',
          friendship: 'REQUEST_SENT',
        },
      ]),
    );

    // Act
    renderSearch('/search?q=dan');
    await screen.findByText('Dana Levi');

    // Assert
    expect(row('Dana Levi').getByRole('button', { name: 'Add Friend' })).toHaveClass('bg-accent');
    expect(row('Daniel Cohen').getByRole('button', { name: 'Respond' })).toHaveClass('bg-accent');
    expect(row('Noa').getByRole('button', { name: 'Request sent' })).not.toHaveClass('bg-accent');
  });
});
