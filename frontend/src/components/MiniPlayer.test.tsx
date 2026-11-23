import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { useAuthStore } from '../stores/auth';
import { usePlayer } from '../stores/player';
import {
  makeLinkOnlyPost,
  makePost,
  makeSession,
  makeUser,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { MiniPlayer } from './MiniPlayer';
import { PlayHereButton } from './PlayHereButton';
import { PostCard } from './PostCard';
import { SavedPostCard } from './SavedPostCard';

/* docs/features/in-app-player.md §5, §7. */

vi.mock('../api/posts', () => ({
  retryConversion: vi.fn(),
  deletePost: vi.fn(),
  editPostComment: vi.fn(),
}));
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('../api/recommendations', () => ({ checkInBackground: vi.fn() }));

const SOUNDCLOUD_EMBED =
  'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fsets%2Fsoulhack&auto_play=true';
const BANDCAMP_EMBED = 'https://bandcamp.com/EmbeddedPlayer/album=1836174753/size=large/';

function soundcloudPost(overrides: Partial<PublicPost> = {}): PublicPost {
  return makeLinkOnlyPost({
    id: 'post-sc',
    embed: { platform: 'SOUNDCLOUD', url: SOUNDCLOUD_EMBED },
    ...overrides,
  });
}

function bandcampPost(): PublicPost {
  return makeLinkOnlyPost({
    id: 'post-bc',
    originalUrl: 'https://khruangbin.bandcamp.com/album/a-la-sala',
    platform: 'BANDCAMP',
    kind: 'ALBUM',
    title: 'A LA SALA',
    artist: 'Khruangbin',
    embed: { platform: 'BANDCAMP', url: BANDCAMP_EMBED },
  });
}

function signIn() {
  useAuthStore.getState().setSession(makeSession({ user: makeUser() }));
}

/** The player beside the routes, as `App` renders it. */
function renderApp(posts: PublicPost[], start = '/feed') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route
          path="/feed"
          element={
            <>
              {posts.map((post) => (
                <PlayHereButton key={post.id} post={post} />
              ))}
              <Link to="/elsewhere">Elsewhere</Link>
            </>
          }
        />
        <Route path="/elsewhere" element={<p>Another screen</p>} />
      </Routes>
      <MiniPlayer />
    </MemoryRouter>,
  );
}

const frame = () => document.querySelector('iframe');

beforeEach(() => {
  resetAuthStore();
  signIn();
  setOnline(true);
  usePlayer.setState({ current: null, space: 0, aboveTabBar: false });
});

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe('Play here and the docked player', () => {
  it('opens the player with the embed, sandboxed, and marks the card as playing', async () => {
    // Arrange
    renderApp([soundcloudPost()]);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));

    // Assert
    const iframe = frame();
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe(SOUNDCLOUD_EMBED);
    expect(iframe!.getAttribute('title')).toBe('SoundCloud player: Soulhack');
    expect(iframe!.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation',
    );
    expect(iframe!.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(iframe!.getAttribute('allow')).toBe('autoplay; encrypted-media; picture-in-picture');
    expect(screen.getByRole('region', { name: 'Player' })).toHaveTextContent('Soulhack');
    expect(screen.getByText('Loading player…')).toBeInTheDocument();
    const playing = screen.getByRole('button', { name: 'Playing Soulhack' });
    expect(playing).toBeDisabled();
    expect(playing).toHaveTextContent('Playing');
  });

  it('hides the loading line once the player has loaded', async () => {
    // Arrange
    renderApp([soundcloudPost()]);
    await userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));

    // Act
    act(() => {
      frame()!.dispatchEvent(new Event('load'));
    });

    // Assert
    expect(screen.queryByText('Loading player…')).not.toBeInTheDocument();
  });

  it('swaps to another post: still one player, the new song', async () => {
    // Arrange
    renderApp([soundcloudPost(), bandcampPost()]);
    await userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Play A LA SALA here' }));

    // Assert
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(frame()!.getAttribute('src')).toBe(BANDCAMP_EMBED);
    expect(screen.getByRole('button', { name: 'Play Soulhack here' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Playing A LA SALA' })).toBeDisabled();
  });

  it('closes with ✕, removing the iframe', async () => {
    // Arrange
    renderApp([soundcloudPost()]);
    await userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Close player' }));

    // Assert
    expect(frame()).toBeNull();
    expect(screen.queryByRole('region', { name: 'Player' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Soulhack here' })).toBeEnabled();
  });

  it('keeps the same iframe when the route changes', async () => {
    // Arrange
    renderApp([soundcloudPost()]);
    await userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));
    const before = frame();

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));

    // Assert
    expect(screen.getByText('Another screen')).toBeInTheDocument();
    expect(frame()).toBe(before);
  });

  it('closes when the session is cleared (sign-out or a 401)', async () => {
    // Arrange
    renderApp([soundcloudPost()]);
    await userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));

    // Act
    act(() => {
      useAuthStore.getState().clear();
    });

    // Assert
    expect(usePlayer.getState().current).toBeNull();
    expect(frame()).toBeNull();
  });

  it('shows the loading line again when the same post is replayed after closing', async () => {
    // Arrange
    renderApp([soundcloudPost()]);
    const play = () => userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));
    await play();
    act(() => {
      frame()!.dispatchEvent(new Event('load'));
    });
    await userEvent.click(screen.getByRole('button', { name: 'Close player' }));

    // Act
    await play();

    // Assert
    expect(screen.getByText('Loading player…')).toBeInTheDocument();
  });

  it('adds a spacer on a screen without a tab bar, and none above one', async () => {
    // Arrange
    renderApp([soundcloudPost()]);
    await userEvent.click(screen.getByRole('button', { name: 'Play Soulhack here' }));

    // Act
    act(() => {
      usePlayer.getState().setSpace(164);
    });

    // Assert
    const spacer = document.querySelector<HTMLElement>('div[aria-hidden="true"]');
    expect(spacer?.style.height).toBe('164px');
    act(() => {
      usePlayer.getState().setAboveTabBar(true);
    });
    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull();
  });
});

describe('Play here, when it does not play', () => {
  it('is disabled and reads Offline when offline', () => {
    // Arrange
    setOnline(false);

    // Act
    renderApp([soundcloudPost()]);

    // Assert
    const button = screen.getByRole('button', { name: 'Play Soulhack here' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Offline');
  });

  it('is not shown for an embed that fails the host check', () => {
    // Act
    renderApp([soundcloudPost({ embed: { platform: 'SOUNDCLOUD', url: 'https://evil.test/' } })]);

    // Assert
    expect(screen.queryByRole('button', { name: /Play Soulhack/ })).not.toBeInTheDocument();
  });

  it('is not shown for a converted post', () => {
    // Act
    renderApp([makePost()]);

    // Assert
    expect(screen.queryByRole('button', { name: /here$/ })).not.toBeInTheDocument();
  });

  it('never renders a player whose stored address fails the host check', () => {
    // Arrange
    usePlayer.setState({
      current: { postId: 'x', platform: 'YOUTUBE', url: 'https://evil.test/', title: 'x' },
    });

    // Act
    renderApp([]);

    // Assert
    expect(frame()).toBeNull();
  });
});

describe('Play here on the cards', () => {
  it('sits beside the main button on a post card', () => {
    // Act
    render(
      <MemoryRouter>
        <PostCard
          post={soundcloudPost()}
          viewerService="SPOTIFY"
          online
          onUpdated={vi.fn()}
          onStale={vi.fn()}
          onDeleted={vi.fn()}
          onBookmarkChanged={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Assert
    expect(screen.getByRole('link', { name: 'Listen on SoundCloud' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Soulhack here' })).toBeInTheDocument();
  });

  it('sits beside the main button on a saved card', () => {
    // Act
    render(
      <MemoryRouter>
        <SavedPostCard
          saved={{
            savedAt: '2026-11-22T10:00:00.000Z',
            community: { id: 'c-1', name: 'Friday Jazz' },
            isMember: true,
            post: bandcampPost(),
          }}
          viewerService="SPOTIFY"
          online
          onRemove={vi.fn()}
          onRate={vi.fn()}
          onUpdated={vi.fn()}
          onStale={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Assert
    expect(screen.getByRole('link', { name: 'Listen on Bandcamp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play A LA SALA here' })).toBeInTheDocument();
  });
});
