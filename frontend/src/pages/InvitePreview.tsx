import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { acceptInvite, previewInvite, type InvitePreview as Preview } from '../api/invites';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { Button } from '../components/ui/Button';
import { CommunityCover } from '../components/ui/CommunityCover';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { Wordmark } from '../components/ui/Wordmark';
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
  const path = `/invite/${token}`;

  useEffect(() => {
    rememberPendingInvite(path);
  }, [path]);

  // Loaded again once the visitor signs in, to learn whether they are already in.
  const load = useCallback(() => previewInvite(token), [token, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useRequest(load);
  const invalid = preview.status === 'error' && isNotFound(preview.error);

  useEffect(() => {
    if (invalid) {
      clearPendingInvite();
    }
  }, [invalid]);

  if (status === 'signedIn' && needsOnboarding) {
    // The pending invite brings them back here once onboarding is done.
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <ScreenLayout>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <Wordmark />

        {preview.status === 'loading' && (
          <div role="status" aria-label="Loading the invite" className="flex w-full flex-col gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="mx-auto h-6 w-1/2" />
          </div>
        )}

        {invalid && <InvalidLink />}

        {preview.status === 'error' && !invalid && (
          <LoadError message="Couldn't load this invite." onRetry={preview.reload} />
        )}

        {preview.status === 'ready' && (
          <>
            <div className="flex w-full flex-col gap-3">
              <p className="text-sm text-muted">You&apos;re invited to</p>
              <CommunityCover
                id={preview.data.communityId}
                name={preview.data.name}
                variant="banner"
              />
              <h2 className="break-words font-display text-2xl font-medium">{preview.data.name}</h2>
              <p className="text-sm text-muted">{memberCountLabel(preview.data.memberCount)}</p>
            </div>

            {status === 'signedIn' ? (
              <JoinAction token={token} preview={preview.data} />
            ) : (
              <div className="flex w-full flex-col items-center gap-3">
                <p className="text-sm">Continue with Google to join</p>
                <GoogleSignIn />
              </div>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
}

function InvalidLink() {
  return (
    <div role="alert" className="flex flex-col items-center gap-4">
      <p className="max-w-xs text-sm">{INVALID_LINK}</p>
      <Link
        to="/"
        className="flex min-h-11 items-center rounded-full border border-line bg-surface px-6 text-sm font-medium"
      >
        Go to BookRough
      </Link>
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
      <Button onClick={join} busy={joining} disabled={!online} className="w-full">
        {joining ? 'Joining…' : 'Join community'}
      </Button>
    </div>
  );
}
