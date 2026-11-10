import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makeCommunity, setDesign } from '../test/fixtures';
import { useNotifications } from '../stores/notifications';
import { Dashboard } from './Dashboard';

const { listMyCommunities } = vi.hoisted(() => ({ listMyCommunities: vi.fn() }));
vi.mock('../api/communities', () => ({ listMyCommunities }));

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

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
  useNotifications.setState({ unread: 0 });
});

afterEach(() => setDesign('current'));

describe('Home under Mixtape (ui-redesign.md §5.1)', () => {
  it('puts the logo, Search and the bell in row 1, and Sign out beside the heading', async () => {
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
    const heading = screen.getByRole('heading', { level: 1, name: 'Your communities' });
    expect(heading.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Sign out' }),
    );
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
    expect(loading.children).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
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
