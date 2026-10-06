import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError } from '../test/fixtures';
import { InvitePanel } from './InvitePanel';

const { getInvite, resetInvite } = vi.hoisted(() => ({
  getInvite: vi.fn(),
  resetInvite: vi.fn(),
}));

const invitationsApi = vi.hoisted(() => ({
  listCandidates: vi.fn(),
  inviteFriends: vi.fn(),
  cancelInvitation: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/invitations', () => ({
  listCandidates: invitationsApi.listCandidates,
  inviteFriends: invitationsApi.inviteFriends,
  cancelInvitation: invitationsApi.cancelInvitation,
}));
vi.mock('react-hot-toast', () => ({ default: { error: invitationsApi.toastError } }));

vi.mock('../api/invites', () => ({
  getInvite,
  resetInvite,
  inviteUrl: (token: string) => `${window.location.origin}/invite/${token}`,
}));

const ORIGIN = window.location.origin;
const onClose = vi.fn();

function renderPanel() {
  return render(
    <MemoryRouter>
      <InvitePanel communityId="c-1" communityName="Friday Jazz" onClose={onClose} />
    </MemoryRouter>,
  );
}

const linkField = () => screen.getByLabelText('Invite link');

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

function stubShare(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

beforeEach(() => {
  vi.resetAllMocks();
  getInvite.mockResolvedValue({ token: 'tok-1' });
  invitationsApi.listCandidates.mockResolvedValue([]);
  stubShare(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InvitePanel', () => {
  it('shows a spinner, then the full link for this community', async () => {
    // Act
    renderPanel();

    // Assert
    expect(screen.getByText('Getting your link…')).toBeInTheDocument();
    expect(await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`)).toBeInTheDocument();
    expect(getInvite).toHaveBeenCalledWith('c-1');
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();
  });

  it('copies the link and says so for two seconds', async () => {
    // Arrange
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    // Assert
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/invite/tok-1`);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await act(() => new Promise((done) => setTimeout(done, 2100)));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('selects the link for copying by hand when the clipboard is unavailable', async () => {
    // Arrange
    stubClipboard(() => Promise.reject(new Error('denied')));
    renderPanel();
    const field = (await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`)) as HTMLInputElement;

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    // Assert
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it('opens the share sheet where the browser has one, and hides Share where it does not', async () => {
    // Arrange
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);
    const { unmount } = renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    // Assert
    expect(share).toHaveBeenCalledWith({
      title: 'Friday Jazz',
      text: 'Join Friday Jazz on BookRough',
      url: `${ORIGIN}/invite/tok-1`,
    });
    unmount();
    stubShare(undefined);
    renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('resets after confirmation and shows the new link', async () => {
    // Arrange
    resetInvite.mockResolvedValue({ token: 'tok-2' });
    renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reset link' }));
    expect(screen.getByText(/The current link will stop working/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    // Assert
    expect(resetInvite).toHaveBeenCalledWith('c-1');
    expect(linkField()).toHaveValue(`${ORIGIN}/invite/tok-2`);
    expect(screen.getByText('New link created. The old one no longer works.')).toBeInTheDocument();
  });

  it('changes nothing when the reset is cancelled', async () => {
    // Arrange
    renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reset link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(resetInvite).not.toHaveBeenCalled();
    expect(linkField()).toHaveValue(`${ORIGIN}/invite/tok-1`);
  });

  it('shows an error when the reset fails and keeps the old link', async () => {
    // Arrange
    resetInvite.mockRejectedValue(httpError(500, 'Something went wrong.'));
    renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reset link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reset the link.");
    expect(linkField()).toHaveValue(`${ORIGIN}/invite/tok-1`);
  });

  it('stays open while a reset is in flight — Escape and Close do nothing until it lands', async () => {
    // Arrange
    let resolve: (value: unknown) => void = () => {};
    resetInvite.mockReturnValue(new Promise((done) => (resolve = done)));
    renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);
    await userEvent.click(screen.getByRole('button', { name: 'Reset link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    // Act
    await userEvent.keyboard('{Escape}');

    // Assert
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await act(async () => resolve({ token: 'tok-2' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with the Close button and locks page scrolling while open', async () => {
    // Arrange
    const { unmount } = renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);
    expect(document.body.style.overflow).toBe('hidden');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps Tab inside the panel', async () => {
    // Arrange
    renderPanel();
    await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`);
    screen.getByRole('button', { name: 'Reset link' }).focus();

    // Act
    await userEvent.tab();

    // Assert
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('offers Try again when the link cannot be loaded', async () => {
    // Arrange
    getInvite.mockRejectedValueOnce(httpError(500, 'Something went wrong.'));
    renderPanel();

    // Act
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't get the invite link.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByDisplayValue(`${ORIGIN}/invite/tok-1`)).toBeInTheDocument();
  });
});
