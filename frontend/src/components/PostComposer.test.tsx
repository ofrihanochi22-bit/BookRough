import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONVERTING_COPY } from '../lib/postText';
import { INVALID_LINK } from '../lib/supportedLinks';
import { httpError, makePost, networkError } from '../test/fixtures';
import { PostComposer } from './PostComposer';

const { createPost } = vi.hoisted(() => ({ createPost: vi.fn() }));
vi.mock('../api/posts', () => ({ createPost }));

const ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';
const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

function renderComposer(online = true) {
  const onPosted = vi.fn();
  const onGone = vi.fn();
  render(<PostComposer communityId={ID} online={online} onPosted={onPosted} onGone={onGone} />);
  return { onPosted, onGone };
}

const linkField = () => screen.getByLabelText('Share a song or album');
const commentField = () => screen.getByLabelText(/Comment/);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PostComposer', () => {
  it('keeps Post disabled until a link is typed', async () => {
    // Arrange
    renderComposer();

    // Act & Assert
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
    await userEvent.type(linkField(), TRACK);
    expect(screen.getByRole('button', { name: 'Post' })).toBeEnabled();
  });

  it('shows the designed wait, read-only fields, then clears and hands the post over', async () => {
    // Arrange
    let resolve: (value: unknown) => void = () => undefined;
    createPost.mockReturnValue(new Promise((r) => (resolve = r)));
    const { onPosted } = renderComposer();
    await userEvent.type(linkField(), TRACK);
    await userEvent.type(commentField(), '  A classic ');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert: waiting
    const busy = screen.getByRole('button', { name: CONVERTING_COPY });
    expect(busy).toBeDisabled();
    expect(linkField()).toHaveAttribute('readonly');
    expect(commentField()).toHaveAttribute('readonly');
    expect(createPost).toHaveBeenCalledWith(ID, { url: TRACK, comment: 'A classic' });

    // Act: the post is born
    const post = makePost();
    resolve(post);

    // Assert: done
    expect(await screen.findByRole('button', { name: 'Post' })).toBeInTheDocument();
    expect(onPosted).toHaveBeenCalledWith(post);
    expect(linkField()).toHaveValue('');
    expect(commentField()).toHaveValue('');
  });

  it('refuses an unsupported link inline, without a request', async () => {
    // Arrange
    renderComposer();
    await userEvent.type(linkField(), 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert
    expect(screen.getByText(INVALID_LINK)).toBeInTheDocument();
    expect(linkField()).toHaveAttribute('aria-invalid', 'true');
    expect(createPost).not.toHaveBeenCalled();
  });

  it("shows the server's 422 under the link and keeps the draft", async () => {
    // Arrange
    createPost.mockRejectedValue(httpError(422, INVALID_LINK));
    renderComposer();
    await userEvent.type(linkField(), TRACK);
    await userEvent.type(commentField(), 'Keep me');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert
    expect(await screen.findByText(INVALID_LINK)).toBeInTheDocument();
    expect(linkField()).toHaveValue(TRACK);
    expect(commentField()).toHaveValue('Keep me');
  });

  it('shows a network failure inline and keeps the draft', async () => {
    // Arrange
    createPost.mockRejectedValue(networkError());
    renderComposer();
    await userEvent.type(linkField(), TRACK);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't post. Check your connection and try again.",
    );
    expect(linkField()).toHaveValue(TRACK);
  });

  it('reports a 404 as lost access', async () => {
    // Arrange
    createPost.mockRejectedValue(httpError(404, 'Community not found.'));
    const { onGone } = renderComposer();
    await userEvent.type(linkField(), TRACK);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert
    await vi.waitFor(() => expect(onGone).toHaveBeenCalled());
  });

  it('flags a comment over 280 characters and disables Post', async () => {
    // Arrange
    renderComposer();
    await userEvent.type(linkField(), TRACK);

    // Act
    await userEvent.click(commentField());
    await userEvent.paste('a'.repeat(281));

    // Assert
    expect(screen.getByText('Comments can be up to 280 characters.')).toBeInTheDocument();
    expect(screen.getByText('281/280')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('cannot post while offline', async () => {
    // Arrange
    renderComposer(false);

    // Act
    await userEvent.type(linkField(), TRACK);

    // Assert
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });
});
