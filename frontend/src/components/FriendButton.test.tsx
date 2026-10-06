import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Friendship } from '../api/friends';
import { ACTION_FAILED, REQUEST_SENT } from '../lib/friendCopy';
import { httpError, networkError } from '../test/fixtures';
import { FriendButton } from './FriendButton';

const api = vi.hoisted(() => ({
  sendFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  ignoreFriendRequest: vi.fn(),
  countFriendRequests: vi.fn(),
  removeFriend: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/friends', () => ({
  sendFriendRequest: api.sendFriendRequest,
  cancelFriendRequest: api.cancelFriendRequest,
  acceptFriendRequest: api.acceptFriendRequest,
  ignoreFriendRequest: api.ignoreFriendRequest,
  countFriendRequests: api.countFriendRequests,
  removeFriend: api.removeFriend,
}));
vi.mock('react-hot-toast', () => ({
  default: { success: api.toastSuccess, error: api.toastError },
}));

const DANA = 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const onStale = vi.fn();

/** Holds the friendship the way the profile does: whatever the button reports. */
function Harness({ initial, online = true }: { initial: Friendship; online?: boolean }) {
  const [friendship, setFriendship] = useState(initial);
  return (
    <FriendButton
      userId={DANA}
      name="Dana"
      friendship={friendship}
      online={online}
      onChanged={setFriendship}
      onStale={onStale}
    />
  );
}

const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  api.countFriendRequests.mockResolvedValue(0);
});

describe('FriendButton', () => {
  it('renders each state', () => {
    // Act & Assert
    const { rerender } = render(<Harness initial="NONE" />);
    expect(button('Add Friend')).toBeEnabled();
    rerender(<Harness key="sent" initial="REQUEST_SENT" />);
    expect(button('Request sent')).toBeEnabled();
    rerender(<Harness key="received" initial="REQUEST_RECEIVED" />);
    expect(button('Respond')).toBeEnabled();
    rerender(<Harness key="friends" initial="FRIENDS" />);
    expect(button('✓ Friends')).toBeEnabled();
  });

  it('Add Friend sends and becomes Request sent', async () => {
    // Arrange
    api.sendFriendRequest.mockResolvedValue('REQUEST_SENT');
    render(<Harness initial="NONE" />);

    // Act
    await userEvent.click(button('Add Friend'));

    // Assert
    expect(api.sendFriendRequest).toHaveBeenCalledWith(DANA);
    expect(button('Request sent')).toBeInTheDocument();
    expect(api.toastSuccess).toHaveBeenCalledWith(REQUEST_SENT);
    expect(api.countFriendRequests).not.toHaveBeenCalled();
  });

  it('Add Friend that accepts their request shows Friends and refreshes the badge', async () => {
    // Arrange
    api.sendFriendRequest.mockResolvedValue('FRIENDS');
    render(<Harness initial="NONE" />);

    // Act
    await userEvent.click(button('Add Friend'));

    // Assert
    expect(screen.getByText('✓ Friends')).toBeInTheDocument();
    expect(api.toastSuccess).toHaveBeenCalledWith("You're now friends with Dana.");
    expect(api.countFriendRequests).toHaveBeenCalled();
  });

  it('Request sent opens a sheet whose Cancel request returns to Add Friend', async () => {
    // Arrange
    api.cancelFriendRequest.mockResolvedValue('NONE');
    render(<Harness initial="REQUEST_SENT" />);

    // Act
    await userEvent.click(button('Request sent'));
    await userEvent.click(button('Cancel request'));

    // Assert
    expect(api.cancelFriendRequest).toHaveBeenCalledWith(DANA);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button('Add Friend')).toBeInTheDocument();
  });

  it('Respond → Accept makes you friends and refreshes the badge', async () => {
    // Arrange
    api.acceptFriendRequest.mockResolvedValue({});
    render(<Harness initial="REQUEST_RECEIVED" />);

    // Act
    await userEvent.click(button('Respond'));
    expect(screen.getByRole('dialog', { name: 'Friend request' })).toHaveTextContent(
      'Dana sent you a friend request.',
    );
    await userEvent.click(button('Accept'));

    // Assert
    expect(api.acceptFriendRequest).toHaveBeenCalledWith(DANA);
    expect(screen.getByText('✓ Friends')).toBeInTheDocument();
    expect(api.countFriendRequests).toHaveBeenCalled();
  });

  it('Respond → Ignore returns to Add Friend', async () => {
    // Arrange
    api.ignoreFriendRequest.mockResolvedValue(undefined);
    render(<Harness initial="REQUEST_RECEIVED" />);

    // Act
    await userEvent.click(button('Respond'));
    await userEvent.click(button('Ignore'));

    // Assert
    expect(api.ignoreFriendRequest).toHaveBeenCalledWith(DANA);
    expect(button('Add Friend')).toBeInTheDocument();
    expect(api.toastSuccess).not.toHaveBeenCalled();
  });

  it('an Accept answered 404 toasts the message and asks for a reload', async () => {
    // Arrange
    api.acceptFriendRequest.mockRejectedValue(
      httpError(404, 'This request is no longer available.'),
    );
    render(<Harness initial="REQUEST_RECEIVED" />);

    // Act
    await userEvent.click(button('Respond'));
    await userEvent.click(button('Accept'));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith('This request is no longer available.');
    expect(onStale).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a failure toasts and keeps the state', async () => {
    // Arrange
    api.sendFriendRequest.mockRejectedValue(networkError());
    render(<Harness initial="NONE" />);

    // Act
    await userEvent.click(button('Add Friend'));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith(ACTION_FAILED);
    expect(button('Add Friend')).toBeEnabled();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('Friends → Remove friend returns to Add Friend (unfriend.md §5.3)', async () => {
    // Arrange
    api.removeFriend.mockResolvedValue('NONE');
    render(<Harness initial="FRIENDS" />);

    // Act
    await userEvent.click(button('✓ Friends'));
    await userEvent.click(button('Remove friend'));

    // Assert
    expect(api.removeFriend).toHaveBeenCalledWith(DANA);
    expect(api.toastSuccess).toHaveBeenCalledWith('Removed Dana from your friends.');
    expect(button('Add Friend')).toBeInTheDocument();
  });

  it('shows the relation the removal reports, not a guess', async () => {
    // Arrange: they had removed us and asked again meanwhile.
    api.removeFriend.mockResolvedValue('REQUEST_RECEIVED');
    render(<Harness initial="FRIENDS" />);

    // Act
    await userEvent.click(button('✓ Friends'));
    await userEvent.click(button('Remove friend'));

    // Assert
    expect(button('Respond')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Friend' })).not.toBeInTheDocument();
  });

  it('a failed removal keeps Friends and toasts', async () => {
    // Arrange
    api.removeFriend.mockRejectedValue(networkError());
    render(<Harness initial="FRIENDS" />);

    // Act
    await userEvent.click(button('✓ Friends'));
    await userEvent.click(button('Remove friend'));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith(ACTION_FAILED);
    expect(button('✓ Friends')).toBeInTheDocument();
  });

  it('a removal answered 404 asks for a reload', async () => {
    // Arrange
    api.removeFriend.mockRejectedValue(httpError(404, 'User not found.'));
    render(<Harness initial="FRIENDS" />);

    // Act
    await userEvent.click(button('✓ Friends'));
    await userEvent.click(button('Remove friend'));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith('User not found.');
    expect(onStale).toHaveBeenCalled();
  });

  it('is disabled offline', () => {
    // Act
    render(<Harness initial="NONE" online={false} />);

    // Assert
    expect(button('Add Friend')).toBeDisabled();
  });
});
