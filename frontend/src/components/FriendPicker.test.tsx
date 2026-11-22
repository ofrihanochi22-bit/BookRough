import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { InviteCandidate } from '../api/invitations';
import { FriendPicker } from './FriendPicker';

const candidate = (id: string, name: string, status: InviteCandidate['status']) => ({
  user: { id, displayName: name, profilePictureUrl: null },
  status,
});

const MIXED: InviteCandidate[] = [
  candidate('ada', 'Ada', 'MEMBER'),
  candidate('bea', 'Bea', 'BLOCKED'),
  candidate('cai', 'Cai', 'INVITED'),
  candidate('dov', 'Dov', 'INVITABLE'),
];

function renderPicker(props: Partial<Parameters<typeof FriendPicker>[0]>) {
  return render(
    <MemoryRouter>
      <FriendPicker
        candidates={MIXED}
        failed={false}
        onRetry={vi.fn()}
        online
        mode="manage"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('FriendPicker (invite-friends.md §5.1)', () => {
  it('manage mode: Member and Blocked as labels, Invited and Invite as buttons', async () => {
    // Arrange
    const onInvite = vi.fn();
    const onCancel = vi.fn();
    renderPicker({ onInvite, onCancel });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Invite Dov' }));
    await userEvent.click(screen.getByRole('button', { name: 'Invited Cai, tap to cancel' }));

    // Assert
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ada|Bea/ })).not.toBeInTheDocument();
    expect(onInvite).toHaveBeenCalledWith(MIXED[3]);
    expect(onCancel).toHaveBeenCalledWith(MIXED[2]);
  });

  it('select mode: a checkbox per invitable friend', async () => {
    // Arrange
    const onToggle = vi.fn();
    renderPicker({
      mode: 'select',
      candidates: [candidate('dov', 'Dov', 'INVITABLE')],
      selected: new Set(['dov']),
      onToggle,
    });

    // Act
    await userEvent.click(screen.getByRole('checkbox', { name: 'Invite Dov' }));

    // Assert
    expect(onToggle).toHaveBeenCalledWith('dov');
    expect(screen.getByRole('checkbox', { name: 'Invite Dov' })).toBeChecked();
  });

  it('select mode: a tap on the name or the avatar toggles the checkbox', async () => {
    // Arrange
    const onToggle = vi.fn();
    renderPicker({
      mode: 'select',
      candidates: [candidate('dov', 'Dov', 'INVITABLE')],
      selected: new Set(),
      onToggle,
    });
    // The name's text sits in a <bdi> inside the name span (manual-test-fixes-1122.md §5.1).
    const name = screen.getByText('Dov').parentElement as HTMLElement;
    const avatar = name.previousElementSibling as HTMLElement;

    // Act
    await userEvent.click(name);
    await userEvent.click(avatar);

    // Assert
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenCalledWith('dov');
  });

  it('select mode offline: a tap on the name does nothing', async () => {
    // Arrange
    const onToggle = vi.fn();
    renderPicker({
      mode: 'select',
      candidates: [candidate('dov', 'Dov', 'INVITABLE')],
      selected: new Set(),
      onToggle,
      online: false,
    });

    // Act
    await userEvent.click(screen.getByText('Dov'));

    // Assert
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Invite Dov' })).toBeDisabled();
  });

  it.each(['select', 'manage'] as const)(
    '%s mode: no name is a link to a profile, so a tap cannot leave the form',
    async (mode) => {
      // Arrange
      const onInvite = vi.fn();
      renderPicker({ mode, onInvite, selected: new Set(), onToggle: vi.fn() });

      // Act
      await userEvent.click(screen.getByText('Dov'));

      // Assert
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(onInvite).not.toHaveBeenCalled();
    },
  );

  it('disables every control offline, and the busy row', () => {
    // Act
    renderPicker({ online: false });

    // Assert
    expect(screen.getByRole('button', { name: 'Invite Dov' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Invited Cai, tap to cancel' })).toBeDisabled();
  });

  it('shows skeletons while loading, the error with Try again, and the empty state', async () => {
    // Arrange
    const onRetry = vi.fn();

    // Act & Assert
    const { rerender } = renderPicker({ candidates: null });
    expect(screen.getByRole('status', { name: 'Loading your friends' })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <FriendPicker candidates={null} failed onRetry={onRetry} online mode="manage" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <FriendPicker candidates={[]} failed={false} onRetry={onRetry} online mode="manage" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/You don't have friends on BookRough yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/search');
  });
});
