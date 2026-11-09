import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicComment } from '../api/comments';
import type { PublicPostRating } from '../api/ratings';
import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makePost,
  makeSession,
  makeUser,
  networkError,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { PostDetail } from './PostDetail';

const {
  getPost,
  deletePost,
  listPostRatings,
  editRating,
  toastSuccess,
  editPostComment,
  comments,
} = vi.hoisted(() => ({
  comments: {
    listComments: vi.fn(),
    addComment: vi.fn(),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
  },
  editPostComment: vi.fn(),
  getPost: vi.fn(),
  deletePost: vi.fn(),
  listPostRatings: vi.fn(),
  editRating: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('../api/posts', () => ({
  getPost,
  deletePost,
  editPostComment,
  retryConversion: vi.fn(),
}));
vi.mock('../api/ratings', () => ({ listPostRatings, editRating, ratePost: vi.fn() }));
vi.mock('../api/comments', () => comments);
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: vi.fn() } }));

const POST = makePost({ myScore: 6, ratingSummary: { average: 7.5, count: 2 } });
const COMMUNITY = { id: '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40', name: 'Friday Jazz' };

function rating(overrides: Partial<PublicPostRating>): PublicPostRating {
  return {
    id: 'r1',
    rater: { id: 'u1', displayName: 'Noa', profilePictureUrl: null },
    isMine: false,
    score: 9,
    comment: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  };
}

const RATINGS = {
  ratingSummary: { average: 7.5, count: 2 },
  ratings: [
    rating({ id: 'mine', isMine: true, score: 6, comment: 'nise song' }),
    rating({ id: 'noa', score: 9, comment: 'A classic.\nStill gives me chills.' }),
  ],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/posts/${POST.id}`]}>
      <Routes>
        <Route path="/posts/:postId" element={<PostDetail />} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const ratingsRegion = () => screen.getByRole('region', { name: 'Ratings' });

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore
    .getState()
    .setSession(makeSession({ user: makeUser({ preferredService: 'SPOTIFY' }) }));
  getPost.mockResolvedValue({ post: POST, community: COMMUNITY });
  listPostRatings.mockResolvedValue(RATINGS);
  comments.listComments.mockResolvedValue([]);
});

afterEach(() => {
  // Unmount first: resetting the store under a mounted screen re-renders it outside act.
  cleanup();
  resetAuthStore();
});

describe('PostDetail (post-detail.md §5.2)', () => {
  it('shows skeletons while loading', () => {
    // Arrange
    getPost.mockReturnValue(new Promise(() => {}));
    listPostRatings.mockReturnValue(new Promise(() => {}));

    // Act
    renderDetail();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the post' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading ratings' })).toBeInTheDocument();
  });

  it('shows the card, the average and every rating, with Edit on yours only', async () => {
    // Act
    renderDetail();

    // Assert
    expect(await screen.findByRole('link', { name: '← Friday Jazz' })).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY.id}`,
    );
    expect(screen.getByText('You rated 6/10')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View ratings' })).not.toBeInTheDocument();
    const region = ratingsRegion();
    expect(await within(region).findByText('7.5')).toBeInTheDocument();
    expect(within(region).getByText('out of 10 · 2 ratings')).toBeInTheDocument();
    const rows = within(region).getAllByRole('listitem');
    expect(within(rows[0]!).getByText('You')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('6/10')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Noa')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/Still gives me chills/)).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it("links each rater to their profile, and the author's name too (find-people.md §5.3)", async () => {
    // Act
    renderDetail();

    // Assert
    const region = ratingsRegion();
    expect(await within(region).findByRole('link', { name: 'Noa' })).toHaveAttribute(
      'href',
      '/users/u1',
    );
    expect(screen.getByRole('link', { name: 'Dana' })).toHaveAttribute(
      'href',
      `/users/${POST.author.id}`,
    );
  });

  it('says "No ratings yet" when nobody has rated', async () => {
    // Arrange
    getPost.mockResolvedValue({ post: makePost(), community: COMMUNITY });
    listPostRatings.mockResolvedValue({
      ratingSummary: { average: null, count: 0 },
      ratings: [],
    });

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByText('No ratings yet')).toBeInTheDocument();
  });

  it('edits your rating in the pre-filled sheet, then reloads the list and the card', async () => {
    // Arrange
    editRating.mockResolvedValue({});
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const sheet = screen.getByRole('dialog', { name: 'Edit your rating' });
    expect(within(sheet).getByRole('radio', { name: '6' })).toHaveAttribute('aria-checked', 'true');

    // Act
    await userEvent.click(within(sheet).getByRole('radio', { name: '9' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));

    // Assert
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Rating updated'));
    expect(editRating).toHaveBeenCalledWith(POST.id, { score: 9, comment: 'nise song' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(listPostRatings).toHaveBeenCalledTimes(2));
    expect(getPost).toHaveBeenCalledTimes(2);
  });

  it('shows the not-found page for a post you cannot see', async () => {
    // Arrange
    getPost.mockRejectedValue(httpError(404, 'Post not found.'));
    listPostRatings.mockRejectedValue(httpError(404, 'Post not found.'));

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByText("This page doesn't exist")).toBeInTheDocument();
  });

  it('shows the not-found page when an edit finds the post gone', async () => {
    // Arrange
    editRating.mockRejectedValue(httpError(404, 'Post not found.'));
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    expect(await screen.findByText("This page doesn't exist")).toBeInTheDocument();
  });

  it("keeps the card when the ratings fail, with UC-16's message and Try again", async () => {
    // Arrange
    listPostRatings.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(RATINGS);
    renderDetail();

    // Assert
    expect(await screen.findByText('Could not load comments at this time.')).toBeInTheDocument();
    expect(screen.getByText('You rated 6/10')).toBeInTheDocument();
    expect(within(ratingsRegion()).getByText('7.5')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await within(ratingsRegion()).findByText('Noa')).toBeInTheDocument();
  });

  it('disables Edit offline, keeping the ratings readable', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByText('Noa')).toBeInTheDocument();
  });

  it('returns to the community after deleting the post from its menu', async () => {
    // Arrange
    getPost.mockResolvedValue({ post: { ...POST, canDelete: true }, community: COMMUNITY });
    deletePost.mockResolvedValue(undefined);
    renderDetail();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Post options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete post' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    // Assert
    expect(await screen.findByText('Community screen')).toBeInTheDocument();
  });

  it('a direct recommendation goes back to Recommendations, with no delete for the recipient', async () => {
    // Arrange
    getPost.mockResolvedValue({
      post: makePost({
        direct: {
          recipient: { id: 'me', displayName: 'Me', profilePictureUrl: null },
          isFriend: true,
        },
      }),
      community: null,
    });
    listPostRatings.mockResolvedValue(RATINGS);

    // Act
    renderDetail();

    // Assert
    const back = await screen.findByRole('link', { name: '← Recommendations' });
    expect(back).toHaveAttribute('href', '/recommendations');
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post options' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('after unfriending the recipient cannot edit their rating', async () => {
    // Arrange
    getPost.mockResolvedValue({
      post: makePost({
        direct: {
          recipient: { id: 'me', displayName: 'Me', profilePictureUrl: null },
          isFriend: false,
        },
      }),
      community: null,
    });
    listPostRatings.mockResolvedValue(RATINGS);

    // Act
    renderDetail();

    // Assert
    expect(await within(ratingsRegion()).findByText('nise song')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('the sender deletes and returns to Recommendations', async () => {
    // Arrange
    const user = userEvent.setup();
    getPost.mockResolvedValue({
      post: makePost({
        isMine: true,
        canDelete: true,
        direct: {
          recipient: { id: 'noam', displayName: 'Noam', profilePictureUrl: null },
          isFriend: true,
        },
      }),
      community: null,
    });
    listPostRatings.mockResolvedValue(RATINGS);
    deletePost.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={[`/posts/${POST.id}`]}>
        <Routes>
          <Route path="/posts/:postId" element={<PostDetail />} />
          <Route path="/recommendations" element={<p>Recommendations screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Act
    await user.click(await screen.findByRole('button', { name: 'Post options' }));
    await user.click(screen.getByRole('button', { name: 'Delete post' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // Assert
    expect(await screen.findByText('Recommendations screen')).toBeInTheDocument();
  });
});

describe('PostDetail — editing the comment (edit-post-comment.md §7)', () => {
  it('updates the page in place, marked edited', async () => {
    // Arrange
    const mine = makePost({ isMine: true, canDelete: true, comment: 'Old' });
    getPost.mockResolvedValue({ post: mine, community: COMMUNITY });
    editPostComment.mockResolvedValue({
      ...mine,
      comment: 'New words',
      commentEditedAt: '2026-11-08T10:00:00.000Z',
    });
    renderDetail();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Post options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    await userEvent.clear(screen.getByLabelText('Comment'));
    await userEvent.type(screen.getByLabelText('Comment'), 'New words');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Assert
    expect(await screen.findByText('New words')).toBeInTheDocument();
    expect(screen.getByText('· edited')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit comment' })).not.toBeInTheDocument();
  });
});

function comment(overrides: Partial<PublicComment>): PublicComment {
  return {
    id: 'c1',
    author: { id: 'u2', displayName: 'Dana', profilePictureUrl: null },
    body: 'Love this one',
    deleted: false,
    createdAt: '2026-11-09T10:00:00.000Z',
    editedAt: null,
    ratingId: null,
    parentId: null,
    replyTo: null,
    isMine: false,
    canDelete: false,
    ...overrides,
  };
}

const discussion = () => screen.getByRole('region', { name: 'Discussion' });
const ready = () => screen.findByRole('region', { name: 'Discussion' });

describe('PostDetail — discussion (discussion-threads.md §7)', () => {
  it('shows a skeleton, then the empty state', async () => {
    // Arrange
    let resolve: (value: PublicComment[]) => void = () => {};
    comments.listComments.mockReturnValue(new Promise((done) => (resolve = done)));

    // Act
    renderDetail();

    // Assert
    expect(
      await screen.findByRole('status', { name: 'Loading the discussion' }),
    ).toBeInTheDocument();
    resolve([]);
    expect(
      await within(await ready()).findByText('No comments yet. Start the conversation.'),
    ).toBeInTheDocument();
  });

  it('adds a comment to the list, clearing the box', async () => {
    // Arrange
    const user = userEvent.setup();
    comments.addComment.mockResolvedValue(comment({ isMine: true, body: 'Great pick' }));
    renderDetail();
    const box = await within(await ready()).findByLabelText('Add a comment');

    // Act
    await user.type(box, '  Great pick ');
    await user.click(within(discussion()).getByRole('button', { name: 'Send' }));

    // Assert
    expect(comments.addComment).toHaveBeenCalledWith(POST.id, { body: 'Great pick' });
    expect(await within(await ready()).findByText('Great pick')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('keeps the draft and shows the reason when sending fails', async () => {
    // Arrange
    const user = userEvent.setup();
    comments.addComment.mockRejectedValue(
      httpError(403, 'You can only comment on songs from friends.'),
    );
    renderDetail();
    const box = await within(await ready()).findByLabelText('Add a comment');

    // Act
    await user.type(box, 'Hello');
    await user.click(within(discussion()).getByRole('button', { name: 'Send' }));

    // Assert
    expect(
      await screen.findByText('You can only comment on songs from friends.'),
    ).toBeInTheDocument();
    expect(box).toHaveValue('Hello');
  });

  it('refuses over 500 characters before sending', async () => {
    // Arrange
    renderDetail();
    const box = await within(await ready()).findByLabelText('Add a comment');

    // Act
    fireEvent.change(box, { target: { value: 'a'.repeat(501) } });

    // Assert
    expect(within(discussion()).getByText('501/500')).toBeInTheDocument();
    expect(within(discussion()).getByRole('alert')).toHaveTextContent(
      'Comments can be up to 500 characters.',
    );
    expect(within(discussion()).getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows a thread under a review and replies to someone in it', async () => {
    // Arrange
    const user = userEvent.setup();
    comments.listComments.mockResolvedValue([
      comment({
        id: 'c2',
        ratingId: 'noa',
        author: { id: 'u3', displayName: 'Ada', profilePictureUrl: null },
        replyTo: { id: 'u1', displayName: 'Noa', profilePictureUrl: null },
        body: 'Agreed',
      }),
    ]);
    comments.addComment.mockResolvedValue(
      comment({ id: 'c3', ratingId: 'noa', isMine: true, body: 'Me too' }),
    );
    renderDetail();
    expect(await screen.findByText('Agreed')).toBeInTheDocument();
    const noaRow = within(ratingsRegion()).getAllByRole('listitem')[1]!;

    // Act
    await user.click(within(noaRow).getAllByRole('button', { name: 'Reply' })[1]!);
    expect(within(noaRow).getByText(/Replying to Ada/)).toBeInTheDocument();
    await user.type(within(noaRow).getByLabelText('Your reply'), 'Me too');
    await user.click(within(noaRow).getByRole('button', { name: 'Send' }));

    // Assert
    expect(comments.addComment).toHaveBeenCalledWith(POST.id, {
      body: 'Me too',
      ratingId: 'noa',
      replyToId: 'u3',
    });
    expect(await within(noaRow).findByText('Me too')).toBeInTheDocument();
  });

  it('cancels a reply without sending', async () => {
    // Arrange
    const user = userEvent.setup();
    comments.listComments.mockResolvedValue([comment({})]);
    renderDetail();
    await within(await ready()).findByText('Love this one');

    // Act
    await user.click(within(discussion()).getByRole('button', { name: 'Reply' }));
    expect(within(discussion()).getByText(/Replying to Dana/)).toBeInTheDocument();
    await user.click(within(discussion()).getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(within(discussion()).queryByText(/Replying to/)).not.toBeInTheDocument();
    expect(comments.addComment).not.toHaveBeenCalled();
  });

  it('edits your comment in place, marked edited', async () => {
    // Arrange
    const user = userEvent.setup();
    const mine = { isMine: true, canDelete: true };
    comments.listComments.mockResolvedValue([comment(mine)]);
    comments.editComment.mockResolvedValue(
      comment({ ...mine, body: 'Even better', editedAt: '2026-11-09T11:00:00.000Z' }),
    );
    renderDetail();
    await within(await ready()).findByText('Love this one');

    // Act
    await user.click(within(discussion()).getByRole('button', { name: 'Comment options' }));
    await user.click(within(discussion()).getByRole('button', { name: 'Edit' }));
    const box = within(discussion()).getByLabelText('Edit comment');
    await user.clear(box);
    await user.type(box, 'Even better');
    await user.click(within(discussion()).getByRole('button', { name: 'Save' }));

    // Assert
    expect(comments.editComment).toHaveBeenCalledWith('c1', 'Even better');
    expect(await within(await ready()).findByText('Even better')).toBeInTheDocument();
    expect(within(discussion()).getByText('· edited')).toBeInTheDocument();
  });

  it('deletes after confirming; a comment with replies stays as "Comment deleted"', async () => {
    // Arrange
    const user = userEvent.setup();
    comments.listComments.mockResolvedValue([
      comment({ isMine: true, canDelete: true }),
      comment({ id: 'c2', parentId: 'c1', body: 'A reply' }),
    ]);
    comments.deleteComment.mockResolvedValue('hidden');
    renderDetail();
    await within(await ready()).findByText('Love this one');

    // Act
    await user.click(within(discussion()).getByRole('button', { name: 'Comment options' }));
    await user.click(within(discussion()).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this comment?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    // Assert
    expect(comments.deleteComment).toHaveBeenCalledWith('c1');
    expect(await within(await ready()).findByText('Comment deleted')).toBeInTheDocument();
    expect(within(discussion()).getByText('A reply')).toBeInTheDocument();
  });

  it('keeps a comment when deleting fails, and removes it on a second try', async () => {
    // Arrange
    const user = userEvent.setup();
    comments.listComments.mockResolvedValue([comment({ canDelete: true })]);
    comments.deleteComment.mockRejectedValueOnce(networkError()).mockResolvedValueOnce('removed');
    renderDetail();
    await within(await ready()).findByText('Love this one');
    const confirmDelete = async () => {
      const dialog = screen.getByRole('dialog', { name: 'Delete this comment?' });
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    };

    // Act
    await user.click(within(discussion()).getByRole('button', { name: 'Comment options' }));
    await user.click(within(discussion()).getByRole('button', { name: 'Delete' }));
    await confirmDelete();
    expect(within(discussion()).getByText('Love this one')).toBeInTheDocument();
    await confirmDelete();

    // Assert
    expect(
      await within(await ready()).findByText('No comments yet. Start the conversation.'),
    ).toBeInTheDocument();
  });

  it('shows the error with Try again when the discussion fails to load', async () => {
    // Arrange
    const user = userEvent.setup();
    comments.listComments
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce([comment({})]);
    renderDetail();

    // Act
    expect(
      await within(await ready()).findByText("Couldn't load the discussion."),
    ).toBeInTheDocument();
    await user.click(within(discussion()).getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await within(await ready()).findByText('Love this one')).toBeInTheDocument();
  });

  it('disables Send and Reply offline, with a note', async () => {
    // Arrange
    setOnline(false);
    comments.listComments.mockResolvedValue([comment({})]);

    // Act
    renderDetail();

    // Assert
    await within(await ready()).findByText('Love this one');
    expect(
      within(discussion()).getByText("You're offline. Connect to comment."),
    ).toBeInTheDocument();
    expect(within(discussion()).getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(within(discussion()).getByRole('button', { name: 'Reply' })).toBeDisabled();
  });

  it('after unfriending, the discussion is read-only with a note', async () => {
    // Arrange
    getPost.mockResolvedValue({
      post: makePost({
        direct: {
          recipient: { id: 'me', displayName: 'Me', profilePictureUrl: null },
          isFriend: false,
        },
      }),
      community: null,
    });
    comments.listComments.mockResolvedValue([comment({})]);

    // Act
    renderDetail();

    // Assert
    await within(await ready()).findByText('Love this one');
    expect(within(discussion()).getByText(/no longer friends with/)).toBeInTheDocument();
    expect(within(discussion()).queryByLabelText('Add a comment')).not.toBeInTheDocument();
    expect(within(discussion()).queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('keeps replies under a review that was emptied, without a Reply', async () => {
    // Arrange
    listPostRatings.mockResolvedValue({
      ...RATINGS,
      ratings: [rating({ id: 'noa', comment: null })],
    });
    comments.listComments.mockResolvedValue([comment({ ratingId: 'noa', body: 'Still here' })]);

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByText('Still here')).toBeInTheDocument();
    const row = within(ratingsRegion()).getAllByRole('listitem')[0]!;
    expect(within(row).getByText('Still here')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it("counts the discussion on the page's card as it changes", async () => {
    // Arrange
    const user = userEvent.setup();
    comments.addComment.mockResolvedValue(comment({ isMine: true }));
    renderDetail();
    const box = await within(await ready()).findByLabelText('Add a comment');

    // Act
    await user.type(box, 'Hi');
    await user.click(within(discussion()).getByRole('button', { name: 'Send' }));

    // Assert
    expect(await screen.findByText(/1 comment/)).toBeInTheDocument();
  });
});
