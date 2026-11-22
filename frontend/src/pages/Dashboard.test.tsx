import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKeys } from '../lib/cacheKeys';
import { cacheSequence, setCached } from '../lib/requestCache';
import { LOADING_HINT_DELAY_MS, LOADING_HINT_TEXT } from '../components/ui/LoadingHint';
import { httpError, makeCommunity } from '../test/fixtures';
import { useNotifications } from '../stores/notifications';
import { Dashboard } from './Dashboard';

const { listMyCommunities } = vi.hoisted(() => ({ listMyCommunities: vi.fn() }));
vi.mock('../api/communities', () => ({ listMyCommunities }));

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route path="/home" element={<Dashboard />} />
        <Route path="/communities/new" element={<p>Create screen</p>} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Dashboard', () => {
  it('shows skeletons while loading', () => {
    // Arrange — a request that never settles.
    listMyCommunities.mockReturnValue(new Promise(() => {}));

    // Act
    renderDashboard();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading your communities' })).toBeInTheDocument();
  });

  it('lists communities with member counts and the Admin label, plus one floating Create', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([
      makeCommunity({ id: 'a', name: 'Friday Jazz', memberCount: 1, myRole: 'ADMIN' }),
      makeCommunity({ id: 'b', name: 'Family', memberCount: 5, myRole: 'MEMBER' }),
    ]);

    // Act
    renderDashboard();

    // Assert
    const jazz = await screen.findByRole('link', { name: /Friday Jazz/ });
    expect(within(jazz).getByText('1 member · Admin')).toBeInTheDocument();
    const family = screen.getByRole('link', { name: /Family/ });
    expect(within(family).getByText('5 members')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Create community/ })).toHaveLength(1);
  });

  it('opens a community when its card is tapped', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([makeCommunity({ name: 'Friday Jazz' })]);
    renderDashboard();

    // Act
    await userEvent.click(await screen.findByRole('link', { name: /Friday Jazz/ }));

    // Assert
    expect(screen.getByText('Community screen')).toBeInTheDocument();
  });

  it('shows the empty state with exactly one Create button', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([]);

    // Act
    renderDashboard();

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Start your first community' }),
    ).toBeInTheDocument();
    const create = screen.getAllByRole('link', { name: 'Create community' });
    expect(create).toHaveLength(1);
    await userEvent.click(create[0]!);
    expect(screen.getByText('Create screen')).toBeInTheDocument();
  });

  it('shows an error with Try again, which loads again', async () => {
    // Arrange
    listMyCommunities
      .mockRejectedValueOnce(httpError(500, 'Something went wrong.'))
      .mockResolvedValueOnce([makeCommunity({ name: 'Friday Jazz' })]);
    renderDashboard();

    // Act
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your communities.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('link', { name: /Friday Jazz/ })).toBeInTheDocument();
    expect(listMyCommunities).toHaveBeenCalledTimes(2);
  });
});

describe('Dashboard — roles', () => {
  it('labels communities the user owns as Owner', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([makeCommunity({ name: 'Mine', myRole: 'OWNER' })]);

    // Act
    renderDashboard();

    // Assert
    const card = await screen.findByRole('link', { name: /Mine/ });
    expect(within(card).getByText('1 member · Owner')).toBeInTheDocument();
  });
});

describe('Dashboard — no sign out on Home (it lives on My Profile)', () => {
  it.each([
    [
      'loading',
      () => listMyCommunities.mockReturnValue(new Promise(() => {})),
      () => screen.findByRole('status', { name: 'Loading your communities' }),
    ],
    [
      'empty',
      () => listMyCommunities.mockResolvedValue([]),
      () => screen.findByRole('heading', { name: 'Start your first community' }),
    ],
    [
      'list',
      () => listMyCommunities.mockResolvedValue([makeCommunity({ name: 'Friday Jazz' })]),
      () => screen.findByRole('link', { name: /Friday Jazz/ }),
    ],
    [
      'error',
      () => listMyCommunities.mockRejectedValue(httpError(500, 'Something went wrong.')),
      () => screen.findByRole('alert'),
    ],
  ])('shows no Sign out button while %s', async (_state, arrange, settled) => {
    // Arrange
    arrange();

    // Act
    renderDashboard();
    await settled();

    // Assert
    expect(screen.getByRole('heading', { name: 'Your communities' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});

describe('Dashboard — the notifications bell', () => {
  it('links to Notifications, naming the unread count', async () => {
    // Arrange
    useNotifications.setState({ unread: 3 });
    listMyCommunities.mockResolvedValue([]);
    renderDashboard();
    await screen.findByRole('heading', { name: 'Start your first community' });

    // Act
    const bell = screen.getByRole('link', { name: 'Notifications, 3 unread' });

    // Assert
    expect(within(bell).getByText('3')).toBeInTheDocument();
    expect(bell).toHaveAttribute('href', '/notifications');
  });

  it('is plainly named with nothing unread', async () => {
    // Arrange
    useNotifications.setState({ unread: 0 });
    listMyCommunities.mockResolvedValue([]);

    // Act
    renderDashboard();
    await screen.findByRole('heading', { name: 'Start your first community' });

    // Assert
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument();
  });
});

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route path="/home" element={<Dashboard />} />
        <Route path="/search" element={<p>Search screen</p>} />
        <Route path="/communities/new" element={<p>Create screen</p>} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Home (ui-redesign.md §5.1)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useNotifications.setState({ unread: 0 });
  });

  it('puts the logo, Search and the bell in row 1, and the heading below', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([]);
    useNotifications.setState({ unread: 3 });

    // Act
    renderHome();

    // Assert
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: /Notifications, 3 unread/i })).toHaveAttribute(
      'href',
      '/notifications',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Your communities' })).toBeInTheDocument();
  });

  it('opens Search from the header icon', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([]);
    renderHome();

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Search' }));

    // Assert
    expect(screen.getByText('Search screen')).toBeInTheDocument();
  });

  it('shows each community as a cassette card linking to its feed, with members and role', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([
      makeCommunity({ id: 'a', name: 'Friday Jazz', memberCount: 1, myRole: 'ADMIN' }),
      makeCommunity({ id: 'b', name: 'Family', memberCount: 5, myRole: 'MEMBER' }),
    ]);

    // Act
    renderHome();

    // Assert
    const jazz = await screen.findByRole('link', { name: /Friday Jazz/ });
    expect(jazz).toHaveAttribute('href', '/communities/a');
    expect(within(jazz).getByTestId('community-cover')).toBeInTheDocument();
    expect(jazz).toHaveTextContent('Friday Jazz, 1 member · Admin');
    expect(screen.getByRole('link', { name: /Family/ })).toHaveTextContent('5 members');
  });

  it('ends the list with a dashed Create tile, and has no floating button', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([makeCommunity({ name: 'Friday Jazz' })]);

    // Act
    renderHome();

    // Assert
    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    const create = within(items[items.length - 1]!).getByRole('link', { name: /Create community/ });
    expect(create).toHaveAttribute('href', '/communities/new');
    expect(create.className).toContain('border-dashed');
    expect(screen.getAllByRole('link', { name: /Create community/ })).toHaveLength(1);
    expect(document.querySelector('.fixed')).toBeNull();
  });

  it('opens a community when its card is tapped', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([makeCommunity({ name: 'Friday Jazz' })]);
    renderHome();

    // Act
    await userEvent.click(await screen.findByRole('link', { name: /Friday Jazz/ }));

    // Assert
    expect(screen.getByText('Community screen')).toBeInTheDocument();
  });

  it('shows three cassette skeletons while loading, with the header already there', () => {
    // Arrange — a request that never settles.
    listMyCommunities.mockReturnValue(new Promise(() => {}));

    // Act
    renderHome();

    // Assert
    const loading = screen.getByRole('status', { name: 'Loading your communities' });
    expect(loading.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
  });

  it('shows the load error with Try again, which loads again', async () => {
    // Arrange
    listMyCommunities.mockRejectedValue(httpError(500, 'Boom'));
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your communities.");
    listMyCommunities.mockResolvedValue([makeCommunity({ name: 'Friday Jazz' })]);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('link', { name: /Friday Jazz/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
  });

  it('shows the kit empty state with its heading and the Create community button', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([]);

    // Act
    renderHome();

    // Assert
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Start your first community' }),
    ).toBeInTheDocument();
    expect(screen.getByText('A community is where your friends share music.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Create community' }));
    expect(screen.getByText('Create screen')).toBeInTheDocument();
  });
});

describe('Home with the client cache (client-cache.md §5)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows cached communities on the first render, with no skeleton', () => {
    // Arrange
    setCached(
      cacheKeys.communities,
      [makeCommunity({ id: 'a', name: 'Friday Jazz' })],
      true,
      cacheSequence(),
    );
    listMyCommunities.mockReturnValue(new Promise(() => {}));

    // Act
    renderDashboard();

    // Assert
    expect(screen.getByRole('link', { name: /Friday Jazz/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading your communities' }),
    ).not.toBeInTheDocument();
  });

  it('updates the cached list in place when the refresh brings a new community', async () => {
    // Arrange
    setCached(
      cacheKeys.communities,
      [makeCommunity({ id: 'a', name: 'Friday Jazz' })],
      true,
      cacheSequence(),
    );
    listMyCommunities.mockResolvedValue([
      makeCommunity({ id: 'a', name: 'Friday Jazz' }),
      makeCommunity({ id: 'b', name: 'Family' }),
    ]);

    // Act
    renderDashboard();

    // Assert
    expect(await screen.findByRole('link', { name: /Family/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Friday Jazz/ })).toBeInTheDocument();
  });

  it('adds the still-loading line under the skeleton after 2 seconds, not before', () => {
    // Arrange
    vi.useFakeTimers();
    listMyCommunities.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.queryByText(LOADING_HINT_TEXT)).not.toBeInTheDocument();

    // Act
    act(() => vi.advanceTimersByTime(LOADING_HINT_DELAY_MS));

    // Assert
    const loading = screen.getByRole('status', { name: 'Loading your communities' });
    expect(within(loading).getByText(LOADING_HINT_TEXT)).toBeInTheDocument();
  });
});

describe('Dashboard — order (manual-test-fixes-1122.md §4)', () => {
  it('shows the communities in the order the server sends, English and Hebrew names isolated', async () => {
    // Arrange — the server sorts; the screen must not reorder.
    listMyCommunities.mockResolvedValue([
      makeCommunity({ id: 'a', name: 'Indie Rock Night' }),
      makeCommunity({ id: 'b', name: 'Jazz & Coffee' }),
      makeCommunity({ id: 'c', name: 'מזרחית ותיקה' }),
    ]);

    // Act
    renderDashboard();

    // Assert
    await screen.findByRole('link', { name: /Indie Rock Night/ });
    const names = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/communities/'))
      .filter((link) => link.getAttribute('href') !== '/communities/new')
      .map((link) => link.querySelector('bdi')?.textContent);
    expect(names).toEqual(['Indie Rock Night', 'Jazz & Coffee', 'מזרחית ותיקה']);
  });
});
