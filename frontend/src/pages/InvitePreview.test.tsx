import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingInvite } from '../lib/pendingInvite';
import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makeCommunity,
  makeSession,
  makeUser,
  networkError,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { InvitePreview } from './InvitePreview';

const { previewInvite, acceptInvite, signInWithGoogle } = vi.hoisted(() => ({
  previewInvite: vi.fn(),
  acceptInvite: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../api/invites', () => ({ previewInvite, acceptInvite }));
vi.mock('../api/auth', () => ({ signInWithGoogle }));
// Google's button is an external boundary: one plain button that succeeds.
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({ onSuccess }: { onSuccess: (response: { credential?: string }) => void }) => (
    <button onClick={() => onSuccess({ credential: 'google-id-token' })}>
      Continue with Google
    </button>
  ),
}));

const TOKEN = 'qEP_iUKg0kWils3eSHVHZQ';
const INVALID =
  'This invite link is invalid or has expired. Please request a new link from the Community Admin.';

function preview(overrides: Partial<{ memberCount: number; alreadyMember: boolean }> = {}) {
  return {
    communityId: makeCommunity().id,
    name: 'Friday Jazz',
    memberCount: 3,
    alreadyMember: false,
    ...overrides,
  };
}

function Where() {
  const location = useLocation();
  return (
    <p>
      At {location.pathname} by {useNavigationType()}
    </p>
  );
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

function signIn(needsOnboarding = false) {
  useAuthStore.getState().setSession(
    makeSession({
      user: makeUser(needsOnboarding ? { displayName: null, preferredService: null } : {}),
      needsOnboarding,
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  setOnline(true);
  useAuthStore.getState().clear();
});

describe('InvitePreview — signed out', () => {
  it('shows the community and the Google sign-in, and remembers the invite', async () => {
    // Arrange
    previewInvite.mockResolvedValue(preview());

    // Act
    renderPreview();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Friday Jazz' })).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByText('Continue with Google to join')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(previewInvite).toHaveBeenCalledWith(TOKEN);
    expect(pendingInvite()).toBe(`/invite/${TOKEN}`);
  });

  it('after signing in, loads the preview again and offers Join', async () => {
    // Arrange
    previewInvite.mockResolvedValue(preview());
    signInWithGoogle.mockResolvedValue(makeSession());
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(await screen.findByRole('button', { name: 'Join community' })).toBeInTheDocument();
    expect(previewInvite).toHaveBeenCalledTimes(2);
  });

  it('sends a new user who signs in to onboarding, keeping the invite for the way back', async () => {
    // Arrange
    previewInvite.mockResolvedValue(preview());
    signInWithGoogle.mockResolvedValue(
      makeSession({
        user: makeUser({ displayName: null, preferredService: null }),
        needsOnboarding: true,
      }),
    );
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(await screen.findByText('At /onboarding by REPLACE')).toBeInTheDocument();
    expect(pendingInvite()).toBe(`/invite/${TOKEN}`);
  });
});

describe('InvitePreview — signed in', () => {
  it('joins: "Joining…", then the community replaces the preview, and the invite is forgotten', async () => {
    // Arrange
    signIn();
    previewInvite.mockResolvedValue(preview());
    let resolve: (value: unknown) => void = () => {};
    acceptInvite.mockReturnValue(new Promise((done) => (resolve = done)));
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Join community' }));

    // Assert
    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
    await act(async () => resolve({ community: makeCommunity({ id: 'joined-id' }), joined: true }));
    expect(await screen.findByText('At /communities/joined-id by REPLACE')).toBeInTheDocument();
    expect(acceptInvite).toHaveBeenCalledWith(TOKEN);
    expect(pendingInvite()).toBeNull();
  });

  it('does not remember the invite for an onboarded user — there is no trip to come back from', async () => {
    // Arrange
    signIn();
    previewInvite.mockResolvedValue(preview());

    // Act
    renderPreview();

    // Assert
    await screen.findByRole('button', { name: 'Join community' });
    expect(pendingInvite()).toBeNull();
  });

  it('tells an existing member they are already in, with a way to open the community', async () => {
    // Arrange
    signIn();
    previewInvite.mockResolvedValue(preview({ alreadyMember: true }));
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('link', { name: 'Open' }));

    // Assert
    expect(screen.getByText(`At /communities/${makeCommunity().id} by PUSH`)).toBeInTheDocument();
  });

  it('redirects a signed-in user who still needs onboarding, remembering the invite', async () => {
    // Arrange
    signIn(true);

    // Act
    renderPreview();

    // Assert
    expect(await screen.findByText('At /onboarding by REPLACE')).toBeInTheDocument();
    expect(pendingInvite()).toBe(`/invite/${TOKEN}`);
  });

  it('shows the invalid-link state when the link was reset between preview and Join', async () => {
    // Arrange
    signIn();
    previewInvite.mockResolvedValue(preview());
    acceptInvite.mockRejectedValue(httpError(404, INVALID));
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Join community' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(INVALID);
    expect(screen.queryByRole('button', { name: 'Join community' })).not.toBeInTheDocument();
  });

  it.each([
    ['a server error', httpError(500, 'Something went wrong.'), 'Something went wrong.'],
    [
      'no connection',
      networkError(),
      "Can't reach the server. Check your connection and try again.",
    ],
  ])('shows %s above Join and lets the user retry', async (_case, error, message) => {
    // Arrange
    signIn();
    previewInvite.mockResolvedValue(preview());
    acceptInvite.mockRejectedValue(error);
    renderPreview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Join community' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Join community' })).toBeEnabled();
  });

  it('disables Join while offline', async () => {
    // Arrange
    signIn();
    setOnline(false);
    previewInvite.mockResolvedValue(preview());

    // Act
    renderPreview();

    // Assert
    expect(await screen.findByRole('button', { name: 'Join community' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline. Connect to join.");
  });
});

describe('InvitePreview — loading and errors', () => {
  it('shows a skeleton while loading', () => {
    // Arrange
    previewInvite.mockReturnValue(new Promise(() => {}));

    // Act
    renderPreview();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the invite' })).toBeInTheDocument();
  });

  it('shows the UC-15 message for an invalid or reset link, and forgets the invite', async () => {
    // Arrange
    previewInvite.mockRejectedValue(httpError(404, INVALID));

    // Act
    renderPreview();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(INVALID);
    expect(screen.getByRole('link', { name: 'Go to BookRough' })).toHaveAttribute('href', '/');
    expect(pendingInvite()).toBeNull();
  });

  it('offers Try again for any other failure, and recovers', async () => {
    // Arrange
    previewInvite.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(preview());
    renderPreview();

    // Act
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this invite.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Friday Jazz' })).toBeInTheDocument();
  });
});

// Keep the store tidy for suites that run after this one.
afterAll(() => resetAuthStore());
