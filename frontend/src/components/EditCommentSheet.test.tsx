import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makePost, networkError } from '../test/fixtures';
import { COMMENT_UPDATED, EDIT_OFFLINE, EditCommentSheet } from './EditCommentSheet';

const { editPostComment, toastSuccess, toastError } = vi.hoisted(() => ({
  editPostComment: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/posts', () => ({ editPostComment }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: toastError } }));

const BAD_CHARACTER = "The comment has a character that isn't allowed.";

function renderSheet(comment: string | null = 'Old', online = true) {
  const post = makePost({ isMine: true, comment });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onStale = vi.fn();
  render(
    <EditCommentSheet
      post={post}
      online={online}
      onClose={onClose}
      onSaved={onSaved}
      onStale={onStale}
    />,
  );
  return { post, onClose, onSaved, onStale };
}

const field = () => screen.getByLabelText('Comment');
const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('EditCommentSheet', () => {
  it('opens prefilled, with the counter, and Save disabled until something changes', async () => {
    // Arrange
    renderSheet('Old');

    // Assert
    expect(field()).toHaveValue('Old');
    expect(screen.getByText('3/280')).toBeInTheDocument();
    expect(save()).toBeDisabled();

    // Act — only whitespace around it: the same comment once cleaned.
    await userEvent.type(field(), '   ');

    // Assert
    expect(save()).toBeDisabled();
  });

  it('saves the cleaned comment, toasts, hands back the post and closes', async () => {
    // Arrange
    const { post, onSaved, onClose } = renderSheet('Old');
    const updated = { ...post, comment: 'Old, better', commentEditedAt: '2026-11-08T10:00:00Z' };
    editPostComment.mockResolvedValue(updated);

    // Act
    await userEvent.type(field(), ', better  ');
    await userEvent.click(save());

    // Assert
    expect(editPostComment).toHaveBeenCalledWith(post.id, 'Old, better');
    expect(toastSuccess).toHaveBeenCalledWith(COMMENT_UPDATED);
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onClose).toHaveBeenCalled();
  });

  it('sends null when the comment is cleared', async () => {
    // Arrange
    const { post } = renderSheet('Old');
    editPostComment.mockResolvedValue(post);

    // Act
    await userEvent.clear(field());
    await userEvent.click(save());

    // Assert
    expect(editPostComment).toHaveBeenCalledWith(post.id, null);
  });

  it('disables Save for a comment that is too long, and says why', async () => {
    // Arrange
    renderSheet(null);

    // Act
    await userEvent.click(field());
    await userEvent.paste('x'.repeat(281));

    // Assert
    expect(save()).toBeDisabled();
    expect(screen.getByText('Comments can be up to 280 characters.')).toBeInTheDocument();
  });

  it('shows a server 422 inline and keeps the draft', async () => {
    // Arrange
    renderSheet('Old');
    editPostComment.mockRejectedValue(httpError(422, BAD_CHARACTER));

    // Act
    await userEvent.type(field(), '!');
    await userEvent.click(save());

    // Assert
    expect(screen.getByText(BAD_CHARACTER)).toBeInTheDocument();
    expect(field()).toHaveValue('Old!');
  });

  it('toasts, closes and reloads when the post is gone or no longer editable', async () => {
    // Arrange
    const { onClose, onStale } = renderSheet('Old');
    editPostComment.mockRejectedValue(httpError(404, 'Post not found.'));

    // Act
    await userEvent.type(field(), '!');
    await userEvent.click(save());

    // Assert
    expect(toastError).toHaveBeenCalledWith('Post not found.');
    expect(onClose).toHaveBeenCalled();
    expect(onStale).toHaveBeenCalled();
  });

  it('keeps the sheet open with a toast when the network fails', async () => {
    // Arrange
    const { onClose } = renderSheet('Old');
    editPostComment.mockRejectedValue(networkError());

    // Act
    await userEvent.type(field(), '!');
    await userEvent.click(save());

    // Assert
    expect(toastError).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
  });

  it('is disabled offline, with a note', async () => {
    // Arrange
    renderSheet('Old', false);

    // Act
    await userEvent.type(field(), '!');

    // Assert
    expect(save()).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(EDIT_OFFLINE);
  });

  it('Cancel closes without saving', async () => {
    // Arrange
    const { onClose } = renderSheet('Old');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(editPostComment).not.toHaveBeenCalled();
  });
});
