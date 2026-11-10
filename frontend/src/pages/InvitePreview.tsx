import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { acceptInvite, previewInvite, type InvitePreview as Preview } from '../api/invites';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { InstallHint } from '../components/InstallHint';
import { Button } from '../components/ui/Button';
import { CHIP } from '../components/ui/chip';
import { CommunityCover } from '../components/ui/CommunityCover';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { memberCountLabel } from '../lib/communityCopy';
import { clearPendingInvite, rememberPendingInvite } from '../lib/pendingInvite';
import { useAuthStore } from '../stores/auth';

/** UC-15's fail-path wording; the server sends the same text with its 404. */
const INVALID_LINK =
  'This invite link is invalid or has expired. Please request a new link from the Community Admin.';

function isNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/**
 * Join Community preview — docs/features/communities-invites.md §5.3 (UC-15).
 * Public: a signed-out visitor sees the community and signs in right here; a
 * new user goes through onboarding and is brought back (§5.4).
 */
export function InvitePreview() {
  const { token = '' } = useParams();
  const status = useAuthStore((state) => state.status);
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);
  // Only a visitor who still has to sign in or onboard needs the way back here.
  const needsReturnTrip = status !== 'signedIn' || needsOnboarding;

  useEffect(() => {
    if (needsReturnTrip) {
      rememberPendingInvite(`/invite/${token}`);
    }
  }, [needsReturnTrip, token]);

  if (status === 'signedIn' && needsOnboarding) {
    // The pending invite brings them back here once onboarding is done.
    return <Navigate to="/onboarding" replace />;
  }

  // Remounted when the visitor signs in, so the preview is fetched again with the
  // session and can say whether they are already in.
  return <InviteContent key={status} token={token} />;
}

function InviteContent({ token }: { token: string }) {
  const status = useAuthStore((state) => state.status);
  const load = useCallback(() => previewInvite(token), [token]);
  const preview = useRequest(load);
  const invalid = preview.status === 'error' && isNotFound(preview.error);

  useEffect(() => {
    if (invalid) {
      clearPendingInvite();
    }
  }, [invalid]);

  return (
    <ScreenLayout>
      <TopBar />
      {preview.status !== 'ready' && (
        // The cassette label is the h1 once the invite loads; until then (and
        // on an error) the screen still needs one.
        <h1 className="sr-only">Join community</h1>
      )}
      <InstallHint />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {preview.status === 'loading' && (
          <div role="status" aria-label="Loading the invite" className="flex w-full flex-col gap-3">
            <Skeleton className="mx-auto h-5 w-1/3" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="mx-auto h-5 w-1/4" />
          </div>
        )}

        {invalid && <InvalidLink />}

        {preview.status === 'error' && !invalid && (
          <LoadError message="Couldn't load this invite." onRetry={preview.reload} />
        )}

        {preview.status === 'ready' && (
          <>
            <div className="flex w-full flex-col gap-4">
              <p className="text-sm text-muted">You&apos;re invited to</p>
              {/* ui-redesign.md §5.14: a large cassette tilted about +2°, the name on its label as the h1. */}
              <div className="rotate-2 px-2">
                <CommunityCover
                  id={preview.data.communityId}
                  name={preview.data.name}
                  variant="banner"
                  label="h1"
                />
              </div>
              <p className="text-sm text-muted">{memberCountLabel(preview.data.memberCount)}</p>
            </div>

            {status === 'signedIn' ? (
              <JoinAction token={token} preview={preview.data} />
            ) : (
              <div className="flex w-full flex-col items-center gap-3">
                <p className="text-sm">Sign in or create an account to join</p>
                {/* Someone opening an invite is usually new (sign-in-sign-up.md §5.3). */}
                <GoogleSignIn defaultIntent="signup" />
              </div>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
}

function InvalidLink() {
  // The kit's empty treatment with the existing copy and link (§5.14).
  return (
    <div role="alert" className="w-full">
      <EmptyState
        action={
          <Link to="/" className={CHIP}>
            Go to BookRough
          </Link>
        }
      >
        {INVALID_LINK}
      </EmptyState>
    </div>
  );
}

function JoinAction({ token, preview }: { token: string; preview: Preview }) {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkGone, setLinkGone] = useState(false);

  if (linkGone) {
    return <InvalidLink />;
  }

  if (preview.alreadyMember) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm">You&apos;re already in this community.</p>
        <Link
          to={`/communities/${preview.communityId}`}
          onClick={clearPendingInvite}
          className="flex min-h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-on-accent"
        >
          Open
        </Link>
      </div>
    );
  }

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const { community } = await acceptInvite(token);
      clearPendingInvite();
      navigate(`/communities/${community.id}`, { replace: true });
    } catch (caught) {
      setJoining(false);
      if (isNotFound(caught)) {
        clearPendingInvite();
        setLinkGone(true);
      } else if (isAxiosError<{ message?: string }>(caught) && caught.response) {
        setError(caught.response.data?.message ?? 'Joining failed. Please try again.');
      } else {
        setError("Can't reach the server. Check your connection and try again.");
      }
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {!online && (
        <p role="alert" className="w-full rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          You&apos;re offline. Connect to join.
        </p>
      )}
      {error && (
        <p role="alert" className="w-full rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button onClick={join} busy={joining} disabled={!online} offline={!online} className="w-full">
        {joining ? 'Joining…' : 'Join community'}
      </Button>
    </div>
  );
}
