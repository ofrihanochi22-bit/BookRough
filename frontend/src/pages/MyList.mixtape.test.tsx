import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedPost } from '../api/bookmarks';
import { useAuthStore } from '../stores/auth';
import {
  makePost,
  makeSession,
  makeUser,
  networkError,
  resetAuthStore,
  setDesign,
  setOnline,
} from '../test/fixtures';
import { MyList } from './MyList';

const { listBookmarks, removeBookmark } = vi.hoisted(() => ({
  listBookmarks: vi.fn(),
  removeBookmark: vi.fn(),
}));
vi.mock('../api/bookmarks', () => ({ listBookmarks, removeBookmark }));
vi.mock('../api/ratings', () => ({ ratePost: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const COMMUNITY = { id: 'jazz', name: 'Friday Jazz' };

function saved(overrides: Partial<SavedPost> = {}): SavedPost {
  return {
    savedAt: '2026-10-05T10:00:00.000Z',
    community: COMMUNITY,
    isMember: true,
    post: makePost({ id: 'post-1', title: 'Song 1', isBookmarked: true }),
    ...overrides,
  };
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/my-list']}>
      <Routes>
        <Route path="/my-list" element={<MyList />} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const card = () => screen.getByRole('article');

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
  setOnline(true);
  useAuthStore
    .getState()
    .setSession(makeSession({ user: makeUser({ preferredService: 'DEEZER' }) }));
  listBookmarks.mockResolvedValue({ items: [saved()], nextCursor: null });
  removeBookmark.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  resetAuthStore();
  setDesign('current');
});

describe('My List under Mixtape (ui-redesign.md §5.9)', () => {
  it('shows the logo, heading and the existing line', async () => {
    // Act
    renderList();

    // Assert
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'My List' })).toBeInTheDocument();
    expect(screen.getByText('Songs you saved to listen later.')).toBeInTheDocument();
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
  });

  it('shows Rate & Review as the sticker pill, Open in as the accent pill and Remove beside it', async () => {
    // Act
    renderList();

    // Assert
    await screen.findByText('Song 1');
    const rate = within(card()).getByRole('button', { name: 'Rate & Review Song 1' });
    expect(rate.className).toContain('bg-sticker');
    const open = within(card()).getByRole('link', { name: /^Open in/ });
    expect(open.className).toContain('bg-accent');
    expect(open.parentElement).toContainElement(
      within(card()).getByRole('button', { name: 'Remove' }),
    );
    expect(within(card()).getByRole('link', { name: 'Friday Jazz' })).toHaveAttribute(
      'href',
      '/communities/jazz',
    );
  });

  it('says why a song cannot be rated after leaving its community', async () => {
    // Arrange
    listBookmarks.mockResolvedValue({ items: [saved({ isMember: false })], nextCursor: null });

    // Act
    renderList();

    // Assert
    expect(await screen.findByText("You're no longer in Friday Jazz")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rate & Review/ })).not.toBeInTheDocument();
  });

  it('removes a song from the list', async () => {
    // Arrange
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    // Assert
    expect(removeBookmark).toHaveBeenCalledWith('post-1');
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument();
  });

  it('shows the empty state in the kit treatment', async () => {
    // Arrange
    listBookmarks.mockResolvedValue({ items: [], nextCursor: null });

    // Act
    renderList();

    // Assert
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nothing saved yet' }),
    ).toBeInTheDocument();
  });

  it('shows skeletons, then the load error', async () => {
    // Arrange
    listBookmarks.mockRejectedValue(networkError());

    // Act
    renderList();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading your list' })).toBeInTheDocument();
    expect(await screen.findByText("Couldn't load your list.")).toBeInTheDocument();
  });

  it('dashes Rate & Review and Remove offline', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderList();

    // Assert
    const remove = await screen.findByRole('button', { name: 'Remove' });
    expect(remove).toBeDisabled();
    expect(remove.className).toContain('border-dashed');
    expect(screen.getByRole('button', { name: 'Rate & Review Song 1' }).className).toContain(
      'border-dashed',
    );
  });
});
