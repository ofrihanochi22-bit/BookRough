import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makeCommunity } from '../test/fixtures';
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
