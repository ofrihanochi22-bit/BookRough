import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makeCommunity, networkError } from '../test/fixtures';
import { Community } from './Community';

const { getCommunity, getInvite, listPosts } = vi.hoisted(() => ({
  getCommunity: vi.fn(),
  getInvite: vi.fn(),
  listPosts: vi.fn(),
}));
vi.mock('../api/communities', () => ({ getCommunity }));
vi.mock('../api/posts', () => ({ listPosts }));
vi.mock('../api/invites', () => ({ getInvite, inviteUrl: (token: string) => `/invite/${token}` }));

const ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';

function renderCommunity(state?: { justCreated: boolean }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/communities/${ID}`, state }]}>
      <Routes>
        <Route path="/communities/:id" element={<Community />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  listPosts.mockResolvedValue({ posts: [], nextCursor: null });
});

describe('Community page', () => {
  it('shows a skeleton while loading, and asks for the id in the URL', () => {
    // Arrange
    getCommunity.mockReturnValue(new Promise(() => {}));

    // Act
    renderCommunity();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the community' })).toBeInTheDocument();
    expect(getCommunity).toHaveBeenCalledWith(ID);
  });

  it('renders the name, the description with its line breaks, and the member line', async () => {
    // Arrange
    getCommunity.mockResolvedValue(
      makeCommunity({ name: 'Friday Jazz', description: 'Records.\nOnly.', memberCount: 3 }),
    );

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Friday Jazz' })).toBeInTheDocument();
    const description = screen.getByText(/Records\./);
    expect(description.textContent).toBe('Records.\nOnly.');
    expect(description).toHaveClass('whitespace-pre-line');
    expect(screen.getByText("3 members · You're an admin")).toBeInTheDocument();
    expect(await screen.findByText('Share the first song')).toBeInTheDocument();
    expect(listPosts).toHaveBeenCalledWith(ID);
  });

  it('shows only the count for a plain member', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ memberCount: 2, myRole: 'MEMBER' }));

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByText('2 members')).toBeInTheDocument();
  });

  it('renders the standard not-found page on 404, never "not a member"', async () => {
    // Arrange
    getCommunity.mockRejectedValue(httpError(404, 'Community not found.'));

    // Act
    renderCommunity();

    // Assert
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });

  it('shows Try again for any other failure, and recovers', async () => {
    // Arrange
    getCommunity.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(makeCommunity());
    renderCommunity();

    // Act
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this community.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Friday Jazz' })).toBeInTheDocument();
  });
});

describe('Community page — inviting', () => {
  beforeEach(() => {
    getInvite.mockResolvedValue({ token: 'tok-1' });
  });

  it('shows Invite friends to an admin, and it opens the invite panel', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ myRole: 'ADMIN' }));
    renderCommunity();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Invite friends' }));

    // Assert
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('/invite/tok-1')).toBeInTheDocument();
  });

  it('hides Invite friends from a plain member', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ myRole: 'MEMBER', memberCount: 2 }));

    // Act
    renderCommunity();

    // Assert
    await screen.findByText('2 members');
    expect(screen.queryByRole('button', { name: 'Invite friends' })).not.toBeInTheDocument();
  });

  it('opens the panel by itself right after creating, and not again once closed', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ myRole: 'ADMIN' }));
    renderCommunity({ justCreated: true });

    // Act
    expect(await screen.findByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open the panel on a plain visit', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ myRole: 'ADMIN' }));

    // Act
    renderCommunity();

    // Assert
    await screen.findByRole('button', { name: 'Invite friends' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Community page — owner and settings', () => {
  it('labels the owner, offers Invite friends, and links every member to Settings', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ myRole: 'OWNER', memberCount: 3 }));

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByText("3 members · You're the owner")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `/communities/${ID}/settings`,
    );
  });

  it('shows Settings to a plain member too', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ myRole: 'MEMBER', memberCount: 2 }));

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });
});

describe('Community page — losing access', () => {
  const OTHER = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

  it('renders not-found when the feed answers 404 (removed, or the community deleted)', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity());
    listPosts.mockRejectedValue(httpError(404, 'Community not found.'));

    // Act
    renderCommunity();

    // Assert
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });

  it('forgets the lost community when the same page shows another one', async () => {
    // Arrange: lose access to the first community, then go to a second.
    getCommunity.mockImplementation((id: string) =>
      Promise.resolve(makeCommunity({ id, name: id === ID ? 'Friday Jazz' : 'Sunday Soul' })),
    );
    listPosts.mockImplementation((id: string) =>
      id === ID
        ? Promise.reject(httpError(404, 'Community not found.'))
        : Promise.resolve({ posts: [], nextCursor: null }),
    );
    render(
      <MemoryRouter initialEntries={[`/communities/${ID}`]}>
        <Link to={`/communities/${OTHER}`}>Go to the other one</Link>
        <Routes>
          <Route path="/communities/:id" element={<Community />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: "This page doesn't exist" });

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Go to the other one' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Sunday Soul' })).toBeInTheDocument();
  });
});
