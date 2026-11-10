import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makeCommunity,
  makeSession,
  networkError,
  setDesign,
  setOnline,
} from '../test/fixtures';
import { InvitePreview } from './InvitePreview';

const { previewInvite, acceptInvite } = vi.hoisted(() => ({
  previewInvite: vi.fn(),
  acceptInvite: vi.fn(),
}));
vi.mock('../api/invites', () => ({ previewInvite, acceptInvite }));
vi.mock('../api/auth', () => ({ signInWithGoogle: vi.fn() }));
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({ text }: { text?: string }) => (
    <button>{text === 'signin_with' ? 'Sign in with Google' : 'Sign up with Google'}</button>
  ),
}));

const TOKEN = 'qEP_iUKg0kWils3eSHVHZQ';
const INVALID =
  'This invite link is invalid or has expired. Please request a new link from the Community Admin.';
const PREVIEW = {
  communityId: makeCommunity().id,
  name: 'Friday Jazz',
  memberCount: 3,
  alreadyMember: false,
};

function Where() {
  return <p>At {useLocation().pathname}</p>;
}

function renderPreview() {
  return render(
    <MemoryRouter initialEntries={[`/invite/${TOKEN}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePreview />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  setDesign('mixtape');
  setOnline(true);
  useAuthStore.getState().clear();
});

afterEach(() => {
  window.localStorage.clear();
  setDesign('current');
});

describe('Join Community under Mixtape (ui-redesign.md §5.14)', () => {
  it('shows the community as a tilted cassette whose label is the h1, with its members', async () => {
    // Arrange
    previewInvite.mockResolvedValue(PREVIEW);

    // Act
    renderPreview();

    // Assert
    const heading = await screen.findByRole('heading', { level: 1, name: 'Friday Jazz' });
    const cassette = screen.getByTestId('community-cover');
    expect(cassette).toContainElement(heading);
    expect(cassette.parentElement).toHaveClass('rotate-2');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText("You're invited to")).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByText('BookRough')).toBeInTheDocument();
  });

  it('offers the sign-in track with Create account chosen to a signed-out visitor', async () => {
    // Arrange
    previewInvite.mockResolvedValue(PREVIEW);

    // Act
    renderPreview();

    // Assert
    const create = await screen.findByRole('button', { name: 'Create account' });
    expect(create).toHaveAttribute('aria-pressed', 'true');
    expect(create).toHaveClass('bg-tape');
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
  });

  it('joins from the full-width Join button and opens the feed', async () => {
    // Arrange
    useAuthStore.getState().setSession(makeSession());
    previewInvite.mockResolvedValue(PREVIEW);
    acceptInvite.mockResolvedValue({ community: { id: PREVIEW.communityId } });
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Join community' }));

    // Assert
    expect(await screen.findByText(`At /communities/${PREVIEW.communityId}`)).toBeInTheDocument();
  });

  it('shows the dashed offline Join while offline', async () => {
    // Arrange
    setOnline(false);
    useAuthStore.getState().setSession(makeSession());
    previewInvite.mockResolvedValue(PREVIEW);

    // Act
    renderPreview();

    // Assert
    const join = await screen.findByRole('button', { name: 'Join community' });
    expect(join).toBeDisabled();
    expect(join).toHaveClass('border-dashed');
  });

  it('shows skeletons and a screen h1 while the invite loads', () => {
    // Arrange
    previewInvite.mockReturnValue(new Promise(() => {}));

    // Act
    renderPreview();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the invite' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Join community' })).toBeInTheDocument();
  });

  it('shows an invalid link in the kit empty state with its copy and the way home', async () => {
    // Arrange
    previewInvite.mockRejectedValue(httpError(404, INVALID));

    // Act
    renderPreview();

    // Assert
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(INVALID);
    expect(within(alert).getByRole('link', { name: 'Go to BookRough' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(alert.querySelector('.border-dashed')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Join community' })).toBeInTheDocument();
  });

  it('shows a load error with Try again, which loads the invite again', async () => {
    // Arrange
    previewInvite.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(PREVIEW);
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Assert
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Friday Jazz' }),
    ).toBeInTheDocument();
  });

  it('turns into the invalid-link state when Join is answered 404', async () => {
    // Arrange
    useAuthStore.getState().setSession(makeSession());
    previewInvite.mockResolvedValue(PREVIEW);
    acceptInvite.mockRejectedValue(httpError(404, INVALID));
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Join community' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(INVALID);
    expect(screen.getByRole('link', { name: 'Go to BookRough' })).toBeInTheDocument();
  });
});
