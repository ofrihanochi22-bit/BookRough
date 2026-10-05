import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { CONVERTING_COPY } from '../lib/postText';
import type { StreamingService } from '../stores/auth';
import { httpError, makePendingPost, makePost, networkError } from '../test/fixtures';
import { PostCard } from './PostCard';

const { retryConversion } = vi.hoisted(() => ({ retryConversion: vi.fn() }));
vi.mock('../api/posts', () => ({ retryConversion }));

function renderCard(
  post: PublicPost,
  viewerService: StreamingService | null = 'APPLE_MUSIC',
  online = true,
) {
  const onUpdated = vi.fn();
  const onStale = vi.fn();
  render(
    <PostCard
      post={post}
      viewerService={viewerService}
      online={online}
      onUpdated={onUpdated}
      onStale={onStale}
    />,
  );
  return { onUpdated, onStale };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PostCard — converted', () => {
  it("shows the song, the author, the comment, and opens the viewer's service", () => {
    // Act
    renderCard(makePost({ comment: 'Line one\nLine two' }));

    // Assert
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getByText('Queen')).toBeInTheDocument();
    expect(screen.getByText('Dana')).toBeInTheDocument();
    expect(screen.getByText(/Line one/).textContent).toBe('Line one\nLine two');
    const open = screen.getByRole('link', { name: 'Open in Apple Music' });
    expect(open).toHaveAttribute('href', 'https://music.apple.com/us/album/x/1?i=2');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('Album')).not.toBeInTheDocument();
  });

  it('labels an album and says "You" on your own post', () => {
    // Act
    renderCard(makePost({ kind: 'ALBUM', isMine: true }));

    // Assert
    expect(screen.getByText('Album')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it("falls back to the original link when the viewer's service has none", () => {
    // Act
    renderCard(makePost(), 'TIDAL');

    // Assert
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    );
  });

  it('lists every found link in the Other services sheet', async () => {
    // Arrange
    renderCard(makePost());

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Other services' }));

    // Assert
    const sheet = screen.getByRole('dialog', { name: 'Other services' });
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Spotify', 'Apple Music', 'Deezer']);
  });

  it('replaces a cover that fails to load with the placeholder', () => {
    // Arrange
    const { container } = render(
      <PostCard
        post={makePost()}
        viewerService="SPOTIFY"
        online
        onUpdated={vi.fn()}
        onStale={vi.fn()}
      />,
    );
    const image = container.querySelector('img[src="https://img.example/cover.jpg"]')!;

    // Act
    fireEvent.error(image);

    // Assert
    expect(container.querySelector('img[src="https://img.example/cover.jpg"]')).toBeNull();
    expect(screen.getByText('♪')).toBeInTheDocument();
  });
});

describe('PostCard — pending', () => {
  it('says other services are unavailable and links to the original; others cannot retry', () => {
    // Act
    renderCard(makePendingPost());

    // Assert
    expect(screen.getByText('Shared from Spotify')).toBeInTheDocument();
    expect(screen.getByText('Other services unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other services' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Find on other services' }),
    ).not.toBeInTheDocument();
  });

  it('lets the author retry: the designed wait, then the converted post', async () => {
    // Arrange
    let resolve: (value: unknown) => void = () => undefined;
    retryConversion.mockReturnValue(new Promise((r) => (resolve = r)));
    const post = makePendingPost({ isMine: true });
    const { onUpdated } = renderCard(post);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Find on other services' }));

    // Assert
    expect(screen.getByRole('button', { name: CONVERTING_COPY })).toBeDisabled();
    const converted = makePost({ id: post.id, isMine: true });
    resolve(converted);
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(converted));
    expect(retryConversion).toHaveBeenCalledWith(post.id);
  });

  it('says so when it is still unavailable', async () => {
    // Arrange
    const post = makePendingPost({ isMine: true });
    retryConversion.mockResolvedValue(post);
    renderCard(post);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Find on other services' }));

    // Assert
    expect(await screen.findByText('Still unavailable. Try again later.')).toBeInTheDocument();
  });

  it.each([404, 409])('asks the feed to reload on %i', async (status) => {
    // Arrange
    retryConversion.mockRejectedValue(httpError(status, 'x'));
    const { onStale } = renderCard(makePendingPost({ isMine: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Find on other services' }));

    // Assert
    await vi.waitFor(() => expect(onStale).toHaveBeenCalled());
  });

  it('shows a network failure, and cannot retry offline', async () => {
    // Arrange
    retryConversion.mockRejectedValue(networkError());
    renderCard(makePendingPost({ isMine: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Find on other services' }));

    // Assert
    expect(
      await screen.findByText("Couldn't try again. Check your connection."),
    ).toBeInTheDocument();
  });

  it('disables retry offline', () => {
    // Act
    renderCard(makePendingPost({ isMine: true }), 'SPOTIFY', false);

    // Assert
    expect(screen.getByRole('button', { name: 'Find on other services' })).toBeDisabled();
  });
});
