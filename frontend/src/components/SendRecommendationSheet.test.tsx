import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONVERTING_COPY } from '../lib/postText';
import { httpError, makePost, networkError } from '../test/fixtures';
import { SendRecommendationSheet } from './SendRecommendationSheet';

const { listFriends, sendRecommendation, toastSuccess } = vi.hoisted(() => ({
  listFriends: vi.fn(),
  sendRecommendation: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('../api/friends', () => ({ listFriends }));
vi.mock('../api/recommendations', () => ({ sendRecommendation }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: vi.fn() } }));

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const NOAM = { id: 'noam-id', displayName: 'Noam', profilePictureUrl: null };
const YAEL = { id: 'yael-id', displayName: 'Yael', profilePictureUrl: null };
const friends = (...users: (typeof NOAM)[]) =>
  users.map((user) => ({ user, since: '2026-10-06T10:00:00.000Z' }));

function renderSheet(props: { friend?: typeof NOAM; online?: boolean } = {}) {
  const onClose = vi.fn();
  const onSent = vi.fn();
  const onStale = vi.fn();
  render(
    <MemoryRouter>
      <SendRecommendationSheet
        {...(props.friend && { friend: props.friend })}
        online={props.online ?? true}
        onClose={onClose}
        onSent={onSent}
        onStale={onStale}
      />
    </MemoryRouter>,
  );
  return { onClose, onSent, onStale };
}

const link = () => screen.getByLabelText('Song or album link');
const submit = () => screen.getByRole('button', { name: 'Send' });

async function fillAndSend(user: ReturnType<typeof userEvent.setup>) {
  await user.type(link(), TRACK);
  await user.click(submit());
}

beforeEach(() => {
  vi.resetAllMocks();
  listFriends.mockResolvedValue(friends(NOAM, YAEL));
});

describe('SendRecommendationSheet', () => {
  it('asks who for, then sends to the chosen friend', async () => {
    // Arrange
    const user = userEvent.setup();
    const post = makePost();
    sendRecommendation.mockResolvedValue(post);
    const { onSent } = renderSheet();

    // Act
    await user.click(await screen.findByRole('button', { name: 'Noam' }));
    await user.type(link(), TRACK);
    await user.type(screen.getByLabelText(/Comment/), 'Our trip');
    await user.click(submit());

    // Assert
    expect(sendRecommendation).toHaveBeenCalledWith('noam-id', { url: TRACK, comment: 'Our trip' });
    expect(onSent).toHaveBeenCalledWith(post);
    expect(toastSuccess).toHaveBeenCalledWith('Sent to Noam');
  });

  it('from a profile the friend is chosen, with no picker and no Change', async () => {
    // Arrange
    renderSheet({ friend: NOAM });

    // Assert
    expect(screen.getByText('Noam')).toBeInTheDocument();
    expect(listFriends).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it('shows skeletons while the friends load', () => {
    // Arrange
    listFriends.mockReturnValue(new Promise(() => {}));

    // Act
    renderSheet();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading your friends' })).toBeInTheDocument();
  });

  it('tells someone with no friends to add one, with no form', async () => {
    // Arrange
    listFriends.mockResolvedValue([]);

    // Act
    renderSheet();

    // Assert
    expect(await screen.findByText('Add a friend first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
    expect(screen.queryByLabelText('Song or album link')).not.toBeInTheDocument();
  });

  it('offers Try again when the friends fail to load', async () => {
    // Arrange
    const user = userEvent.setup();
    listFriends.mockRejectedValueOnce(networkError());

    // Act
    renderSheet();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('button', { name: 'Noam' })).toBeInTheDocument();
  });

  it('shows the busy copy, read-only fields and no close while converting', async () => {
    // Arrange
    const user = userEvent.setup();
    sendRecommendation.mockReturnValue(new Promise(() => {}));
    renderSheet({ friend: NOAM });

    // Act
    await fillAndSend(user);

    // Assert
    expect(screen.getByRole('button', { name: CONVERTING_COPY })).toBeInTheDocument();
    expect(link()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('refuses an unsupported link without a request', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSheet({ friend: NOAM });

    // Act
    await user.type(link(), 'https://example.com/song');
    await user.click(submit());

    // Assert
    expect(await screen.findByText(/^Invalid link/)).toBeInTheDocument();
    expect(sendRecommendation).not.toHaveBeenCalled();
  });

  it('disables sending for a comment over 280 characters', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSheet({ friend: NOAM });

    // Act
    await user.type(link(), TRACK);
    await user.click(screen.getByLabelText(/Comment/));
    await user.paste('x'.repeat(281));

    // Assert
    expect(submit()).toBeDisabled();
    expect(screen.getByText('Comments can be up to 280 characters.')).toBeInTheDocument();
  });

  it('is disabled offline', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSheet({ friend: NOAM, online: false });

    // Act
    await user.type(link(), TRACK);

    // Assert
    expect(submit()).toBeDisabled();
  });

  it.each([
    ['a 422', httpError(422, 'Invalid link from the server.'), 'Invalid link from the server.'],
    [
      'a 403',
      httpError(403, 'You can only send songs to friends.'),
      'You can only send songs to friends.',
    ],
    ['a 404', httpError(404, 'User not found.'), 'This person is no longer available.'],
    ['a network failure', networkError(), "Couldn't send. Check your connection and try again."],
  ])('keeps the draft on %s', async (_label, error, message) => {
    // Arrange
    const user = userEvent.setup();
    sendRecommendation.mockRejectedValue(error);
    renderSheet({ friend: NOAM });

    // Act
    await fillAndSend(user);

    // Assert
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(link()).toHaveValue(TRACK);
  });

  it('keeps the draft while changing friend after a refusal, with a fresh list', async () => {
    // Arrange
    const user = userEvent.setup();
    sendRecommendation
      .mockRejectedValueOnce(httpError(403, 'You can only send songs to friends.'))
      .mockResolvedValueOnce(makePost());
    listFriends.mockResolvedValueOnce(friends(NOAM, YAEL)).mockResolvedValueOnce(friends(YAEL));
    renderSheet();
    await user.click(await screen.findByRole('button', { name: 'Noam' }));
    await fillAndSend(user);
    await screen.findByText('You can only send songs to friends.');

    // Act
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(await screen.findByRole('button', { name: 'Yael' }));

    // Assert
    expect(screen.queryByRole('button', { name: 'Noam' })).not.toBeInTheDocument();
    expect(link()).toHaveValue(TRACK);
    await user.click(submit());
    await waitFor(() =>
      expect(sendRecommendation).toHaveBeenLastCalledWith('yael-id', {
        url: TRACK,
        comment: null,
      }),
    );
  });

  it('tells the screen behind on closing after a refusal, not before', async () => {
    // Arrange
    const user = userEvent.setup();
    sendRecommendation.mockRejectedValue(httpError(403, 'You can only send songs to friends.'));
    const { onClose, onStale } = renderSheet({ friend: NOAM });
    await fillAndSend(user);
    await screen.findByText('You can only send songs to friends.');
    expect(onStale).not.toHaveBeenCalled();

    // Act
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(onStale).toHaveBeenCalled();
  });

  it('tells nobody on an ordinary close', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose, onStale } = renderSheet({ friend: NOAM });

    // Act
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(onStale).not.toHaveBeenCalled();
  });
});
