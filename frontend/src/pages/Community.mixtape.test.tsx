import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SharedPostState } from '../lib/communityCopy';
import { httpError, makeCommunity, makePost } from '../test/fixtures';
import { Community } from './Community';

const { getCommunity, listPosts, createPost } = vi.hoisted(() => ({
  getCommunity: vi.fn(),
  listPosts: vi.fn(),
  createPost: vi.fn(),
}));
vi.mock('../api/communities', () => ({ getCommunity }));
vi.mock('../api/posts', () => ({ listPosts, createPost }));
vi.mock('../api/invitations', () => ({
  listCandidates: () => Promise.resolve([]),
  inviteFriends: vi.fn(),
  cancelInvitation: vi.fn(),
}));
vi.mock('../api/invites', () => ({
  getInvite: () => new Promise(() => {}),
  inviteUrl: (token: string) => `/invite/${token}`,
}));

const A = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';
const B = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const LINK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

/** Stands in for the Share sheet: navigates to a feed with `sharedAt`, as it does after a post. */
function ShareTo() {
  const navigate = useNavigate();
  return (
    <>
      {[A, B].map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            const state: SharedPostState = { sharedAt: Date.now() + Math.random() };
            navigate(`/communities/${id}`, { state });
          }}
        >
          {`Shared to ${id === A ? 'A' : 'B'}`}
        </button>
      ))}
    </>
  );
}

function renderCommunity(id = A) {
  return render(
    <MemoryRouter initialEntries={[`/communities/${id}`]}>
      <ShareTo />
      <Routes>
        <Route path="/communities/:id" element={<Community />} />
        <Route path="/communities/:id/settings" element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pill = () => screen.getByRole('button', { name: 'Share a song or album' });
const linkField = () => screen.getByLabelText('Share a song or album');

beforeEach(() => {
  vi.resetAllMocks();
  getCommunity.mockImplementation((id: string) =>
    Promise.resolve(
      makeCommunity({ id, name: id === A ? 'Friday Jazz' : 'Family', myRole: 'ADMIN' }),
    ),
  );
  listPosts.mockResolvedValue({ posts: [], nextCursor: null });
});

describe('Community Feed (ui-redesign.md §5.2)', () => {
  it('shows the back link and the logo, and the name on the cassette label as the h1', async () => {
    // Act
    renderCommunity();

    // Assert
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Friday Jazz' });
    expect(screen.getByTestId('community-cover')).toContainElement(h1);
    expect(screen.getByRole('link', { name: 'Communities' })).toHaveAttribute('href', '/home');
    expect(screen.getByText('BookRough')).toBeInTheDocument();
  });

  it('shows Invite friends and Settings as chips with the same targets', async () => {
    // Arrange
    renderCommunity();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Invite friends' }));

    // Assert
    expect(await screen.findByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `/communities/${A}/settings`,
    );
  });

  it('hides Invite friends from a member', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ id: A, myRole: 'MEMBER' }));

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).not.toBeInTheDocument();
  });

  it('starts with the composer collapsed to a pill', async () => {
    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByRole('button', { name: 'Share a song or album' })).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Share a song' })).not.toBeInTheDocument();
  });

  it('expands the pill into the composer with focus in the link field', async () => {
    // Arrange
    renderCommunity();
    await screen.findByRole('heading', { level: 1 });

    // Act
    await userEvent.click(pill());

    // Assert
    expect(screen.getByRole('form', { name: 'Share a song' })).toBeVisible();
    expect(linkField()).toHaveFocus();
  });

  it('collapses with ✕ back to the pill, keeping the draft', async () => {
    // Arrange
    renderCommunity();
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(pill());
    await userEvent.type(linkField(), LINK);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Close the composer' }));

    // Assert
    expect(pill()).toHaveFocus();
    expect(screen.queryByRole('form', { name: 'Share a song' })).not.toBeInTheDocument();
    await userEvent.click(pill());
    expect(linkField()).toHaveValue(LINK);
  });

  it('collapses after posting, with the new post on top', async () => {
    // Arrange
    listPosts.mockResolvedValue({
      posts: [makePost({ id: 'old', title: 'Older song' })],
      nextCursor: null,
    });
    createPost.mockResolvedValue(makePost({ id: 'new', title: 'Brand new song' }));
    renderCommunity();
    await screen.findByText('Older song');
    await userEvent.click(pill());
    await userEvent.type(linkField(), LINK);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert
    await waitFor(() => expect(pill()).toHaveFocus());
    expect(createPost).toHaveBeenCalledWith(A, { url: LINK, comment: null });
    const titles = screen.getAllByText(/song$/).map((node) => node.textContent);
    expect(titles).toEqual(['Brand new song', 'Older song']);
  });

  it('keeps the composer draft when a post from the Share sheet reloads this feed', async () => {
    // Arrange
    renderCommunity();
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(pill());
    await userEvent.type(linkField(), LINK);
    listPosts.mockResolvedValue({
      posts: [makePost({ id: 'shared', title: 'Shared from the sheet' })],
      nextCursor: null,
    });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Shared to A' }));

    // Assert
    expect(await screen.findByText('Shared from the sheet')).toBeInTheDocument();
    expect(listPosts).toHaveBeenCalledTimes(2);
    expect(linkField()).toHaveValue(LINK);
  });

  it('never carries a draft over to another community', async () => {
    // Arrange
    renderCommunity();
    await screen.findByRole('heading', { level: 1, name: 'Friday Jazz' });
    await userEvent.click(pill());
    await userEvent.type(linkField(), LINK);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Shared to B' }));

    // Assert
    expect(await screen.findByRole('heading', { level: 1, name: 'Family' })).toBeInTheDocument();
    await userEvent.click(pill());
    expect(linkField()).toHaveValue('');
    expect(listPosts.mock.calls.filter(([id]) => id === B)).toHaveLength(1);
  });

  it('shows a banner skeleton and two post skeletons while loading', () => {
    // Arrange
    getCommunity.mockReturnValue(new Promise(() => {}));

    // Act
    renderCommunity();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the community' }).children).toHaveLength(3);
  });

  it('shows the load error with Try again', async () => {
    // Arrange
    getCommunity.mockRejectedValue(httpError(500, 'Boom'));

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this community.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the kit empty state with the existing first-post copy', async () => {
    // Act
    renderCommunity();

    // Assert
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Share the first song' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Paste a link from Spotify/)).toBeInTheDocument();
  });

  it('shows not-found on a 404', async () => {
    // Arrange
    getCommunity.mockRejectedValue(httpError(404, 'Community not found.'));

    // Act
    renderCommunity();

    // Assert
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });
});
