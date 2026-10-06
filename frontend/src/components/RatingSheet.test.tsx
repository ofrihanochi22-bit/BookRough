import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { httpError, makePendingPost, makePost, networkError } from '../test/fixtures';
import { RatingSheet } from './RatingSheet';

const { ratePost, editRating, toastSuccess, toastError } = vi.hoisted(() => ({
  ratePost: vi.fn(),
  editRating: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/ratings', () => ({ ratePost, editRating }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: toastError } }));

function renderSheet(post: PublicPost = makePost(), online = true) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<RatingSheet post={post} online={online} onClose={onClose} onDone={onDone} />);
  return { onClose, onDone };
}

const submit = () => screen.getByRole('button', { name: 'Submit Rating' });
const comment = () => screen.getByLabelText(/Comment/);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RatingSheet (rate-post.md §5.2)', () => {
  it('shows the song, ten scores and a disabled Submit until a score is chosen', async () => {
    // Arrange
    renderSheet();

    // Assert
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect(submit()).toBeDisabled();

    // Act
    await userEvent.click(screen.getByRole('radio', { name: '7' }));

    // Assert
    expect(screen.getByRole('radio', { name: '7' })).toHaveAttribute('aria-checked', 'true');
    expect(submit()).toBeEnabled();
  });

  it('names a pending post by its source service', () => {
    // Arrange & Act
    renderSheet(makePendingPost());

    // Assert
    expect(screen.getByText('Shared from Spotify')).toBeInTheDocument();
  });

  it('sends the chosen score and the cleaned comment, then toasts and finishes', async () => {
    // Arrange
    let finish!: () => void;
    ratePost.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { onDone } = renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: '7' }));
    await userEvent.type(comment(), '  Still sounds fresh  ');

    // Act
    await userEvent.click(submit());

    // Assert: busy while waiting.
    expect(ratePost).toHaveBeenCalledWith(makePost().id, {
      score: 7,
      comment: 'Still sounds fresh',
    });
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeInTheDocument();
    expect(comment()).toHaveAttribute('readonly');
    expect(screen.getByRole('radio', { name: '7' })).toBeDisabled();

    // Act
    finish();

    // Assert
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(makePost().id));
    expect(toastSuccess).toHaveBeenCalledWith('Rating submitted');
  });

  it('counts the comment and refuses one over 280 characters before any request', async () => {
    // Arrange
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: '5' }));

    // Act
    await userEvent.click(comment());
    await userEvent.paste('a'.repeat(281));

    // Assert
    expect(screen.getByText('281/280')).toBeInTheDocument();
    expect(screen.getByText('Comments can be up to 280 characters.')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(ratePost).not.toHaveBeenCalled();
  });

  it("a 404 finishes with UC-13's message: the post was deleted", async () => {
    // Arrange
    ratePost.mockRejectedValue(httpError(404, 'Post not found.'));
    const { onDone } = renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: '5' }));

    // Act
    await userEvent.click(submit());

    // Assert
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'This recommendation is no longer available as the original post was deleted.',
      ),
    );
    expect(onDone).toHaveBeenCalledWith(makePost().id);
  });

  it('a 409 finishes with "You already rated this post."', async () => {
    // Arrange
    ratePost.mockRejectedValue(httpError(409, 'You already rated this post.'));
    const { onDone } = renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: '5' }));

    // Act
    await userEvent.click(submit());

    // Assert
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith('You already rated this post.');
  });

  it("a 403 toasts the server's message and closes without finishing", async () => {
    // Arrange
    ratePost.mockRejectedValue(httpError(403, "You can't rate your own post."));
    const { onClose, onDone } = renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: '5' }));

    // Act
    await userEvent.click(submit());

    // Assert
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith("You can't rate your own post.");
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a 422 shows its message inline and keeps the draft', async () => {
    // Arrange
    ratePost.mockRejectedValue(httpError(422, 'Choose a score from 1 to 10.'));
    const { onDone } = renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: '5' }));
    await userEvent.type(comment(), 'Nice');

    // Act
    await userEvent.click(submit());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a score from 1 to 10.');
    expect(comment()).toHaveValue('Nice');
    expect(submit()).toBeEnabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a network failure shows the retry message inline and keeps the draft', async () => {
    // Arrange
    ratePost.mockRejectedValue(networkError());
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.type(comment(), 'Nice');

    // Act
    await userEvent.click(submit());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't submit your rating. Check your connection and try again.",
    );
    expect(comment()).toHaveValue('Nice');
    expect(screen.getByRole('radio', { name: '9' })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables Submit offline', async () => {
    // Arrange
    renderSheet(makePost(), false);

    // Act
    await userEvent.click(screen.getByRole('radio', { name: '5' }));

    // Assert
    expect(submit()).toBeDisabled();
  });
});

describe('RatingSheet editing (post-detail.md §5.2)', () => {
  function renderEdit() {
    const onClose = vi.fn();
    const onDone = vi.fn();
    const onGone = vi.fn();
    render(
      <RatingSheet
        post={makePost()}
        online
        onClose={onClose}
        onDone={onDone}
        onGone={onGone}
        editing={{ score: 6, comment: 'nise song' }}
      />,
    );
    return { onClose, onDone, onGone };
  }

  it('starts filled in, titled "Edit your rating", and saves the changes', async () => {
    // Arrange
    editRating.mockResolvedValue({});
    const { onDone } = renderEdit();
    expect(screen.getByRole('dialog', { name: 'Edit your rating' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '6' })).toHaveAttribute('aria-checked', 'true');
    expect(comment()).toHaveValue('nise song');

    // Act
    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.clear(comment());
    await userEvent.type(comment(), 'nice song');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(makePost().id));
    expect(editRating).toHaveBeenCalledWith(makePost().id, { score: 9, comment: 'nice song' });
    expect(ratePost).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Rating updated');
  });

  it('a 404 while editing means the post or your access is gone', async () => {
    // Arrange
    editRating.mockRejectedValue(httpError(404, 'Post not found.'));
    const { onGone, onDone } = renderEdit();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    await vi.waitFor(() => expect(onGone).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a network failure while editing stays inline with the draft', async () => {
    // Arrange
    editRating.mockRejectedValue(networkError());
    renderEdit();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't submit your rating. Check your connection and try again.",
    );
    expect(comment()).toHaveValue('nise song');
  });
});
