import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import {
  acceptFriendRequest,
  type FriendView,
  ignoreFriendRequest,
  listFriendRequests,
  listFriends,
} from '../api/friends';
import {
  acceptInvitation,
  declineInvitation,
  listMyInvitations,
  type MyInvitation,
} from '../api/invitations';
import { PersonLink } from '../components/PersonLink';
import { RemoveFriendSheet } from '../components/RemoveFriendSheet';
import { Button } from '../components/ui/Button';
import { CommunityCover } from '../components/ui/CommunityCover';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { ACTION_FAILED, FRIENDS_LOAD_FAILED, FRIENDS_OFFLINE, nowFriends } from '../lib/friendCopy';
import { INVITATION_GONE, invitedBy, joinedCommunity } from '../lib/invitationCopy';
import { relativeTime } from '../lib/postLinks';
import { useFriendRequests } from '../stores/friendRequests';

interface FriendsData {
  invitations: MyInvitation[];
  requests: FriendView[];
  friends: FriendView[];
}

/** Answers given on this screen, kept against the load they were made on. */
interface LocalChanges {
  base: FriendsData;
  answered: string[];
  accepted: FriendView[];
  /** Friends removed here (UC-8, unfriend.md §5.2). */
  removed: string[];
  /** Invitations declined or gone, by community id (invite-friends.md §5.4). */
  invitationsDone: string[];
}

async function loadFriends(): Promise<FriendsData> {
  const [invitations, requests, friends] = await Promise.all([
    listMyInvitations(),
    listFriendRequests(),
    listFriends(),
  ]);
  return { invitations, requests, friends };
}

const byName = (a: FriendView, b: FriendView) =>
  a.user.displayName.localeCompare(b.user.displayName);

/**
 * Friends & Requests — docs/features/friend-requests.md §5.2 (UC-7). Community
 * invitations first (invite-friends.md §5.4), then pending
 * requests to you, newest first, with Accept and Ignore; then your friends,
 * alphabetical, each removable behind a confirmation (UC-8, unfriend.md §5.2).
 */
export function Friends() {
  const loaded = useRequest(loadFriends);
  const online = useOnlineStatus();
  const setCount = useFriendRequests((state) => state.setCount);
  const refreshCount = useFriendRequests((state) => state.refresh);
  const [local, setLocal] = useState<LocalChanges | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FriendView | null>(null);
  const navigate = useNavigate();

  const data = loaded.status === 'ready' ? loaded.data : null;
  const changes = data && local?.base === data ? local : null;
  const requests = data
    ? data.requests.filter((request) => !changes?.answered.includes(request.user.id))
    : [];
  const invitations = data
    ? data.invitations.filter(
        (invitation) => !changes?.invitationsDone.includes(invitation.community.id),
      )
    : [];
  const friends = data
    ? [...data.friends, ...(changes?.accepted ?? [])]
        .filter((friend) => !changes?.removed.includes(friend.user.id))
        .sort(byName)
    : [];

  /** Applied against the latest state, so two quick changes both stick. */
  function change(base: FriendsData, update: (current: LocalChanges) => Partial<LocalChanges>) {
    setLocal((previous) => {
      const current: LocalChanges =
        previous?.base === base
          ? previous
          : { base, answered: [], accepted: [], removed: [], invitationsDone: [] };
      return { ...current, ...update(current) };
    });
  }

  function record(base: FriendsData, userId: string, friend?: FriendView) {
    change(base, (current) => ({
      answered: [...current.answered, userId],
      accepted: friend ? [...current.accepted, friend] : current.accepted,
    }));
    setCount(invitations.length + requests.length - 1);
  }

  function dropFriend(userId: string) {
    if (data) {
      change(data, (current) => ({ removed: [...current.removed, userId] }));
    }
  }

  function invitationDone(communityId: string) {
    if (data) {
      change(data, (current) => ({ invitationsDone: [...current.invitationsDone, communityId] }));
      setCount(invitations.length + requests.length - 1);
    }
  }

  /** Join navigates into the community, as UC-15 does (invite-friends.md §5.4). */
  async function respond(invitation: MyInvitation, action: 'join' | 'decline') {
    const { id, name } = invitation.community;
    setBusy(id);
    try {
      if (action === 'join') {
        await acceptInvitation(id);
        toast.success(joinedCommunity(name));
        void refreshCount();
        navigate(`/communities/${encodeURIComponent(id)}`);
        return;
      }
      await declineInvitation(id);
      invitationDone(id);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        invitationDone(id);
        void refreshCount();
        toast.error(INVITATION_GONE);
      } else {
        toast.error(ACTION_FAILED);
      }
    } finally {
      setBusy(null);
    }
  }

  async function answer(request: FriendView, action: 'accept' | 'ignore') {
    if (!data) {
      return;
    }
    const { id, displayName } = request.user;
    setBusy(id);
    try {
      if (action === 'accept') {
        const friend = await acceptFriendRequest(id);
        record(data, id, friend);
        toast.success(nowFriends(displayName));
      } else {
        await ignoreFriendRequest(id);
        record(data, id);
      }
    } catch (error) {
      if (isAxiosError<{ message?: string }>(error) && error.response?.status === 404) {
        // The request is gone (UC-7's ghost request, or answered elsewhere).
        record(data, id);
        void refreshCount();
        toast.error(error.response.data?.message ?? ACTION_FAILED);
      } else {
        toast.error(ACTION_FAILED);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScreenLayout>
      <h1 className="mb-6 font-display text-2xl font-medium">Friends</h1>

      <div className="flex flex-col gap-6">
        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {FRIENDS_OFFLINE}
          </p>
        )}

        {loaded.status === 'loading' && (
          <div role="status" aria-label="Loading your friends" className="flex flex-col gap-3">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        )}

        {loaded.status === 'error' && (
          <LoadError message={FRIENDS_LOAD_FAILED} onRetry={loaded.reload} />
        )}

        {data && invitations.length === 0 && requests.length === 0 && friends.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">No friends yet</p>
            <p className="mt-1 text-sm text-muted">
              Find people on the{' '}
              <Link to="/search" className="text-accent underline">
                Search
              </Link>{' '}
              tab and add them as friends.
            </p>
          </div>
        )}

        {invitations.length > 0 && (
          <section aria-labelledby="community-invitations" className="flex flex-col gap-2">
            <h2 id="community-invitations" className="font-medium">
              Invitations
            </h2>
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {invitations.map((invitation) => (
                <li key={invitation.community.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 shrink-0">
                      <CommunityCover
                        id={invitation.community.id}
                        name={invitation.community.name}
                        variant="thumb"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{invitation.community.name}</p>
                      <p className="truncate text-xs text-muted">
                        {invitedBy(
                          invitation.invitedBy?.displayName ?? null,
                          invitation.community.memberCount,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      busy={busy === invitation.community.id}
                      disabled={!online || busy !== null}
                      onClick={() => void respond(invitation, 'join')}
                      aria-label={`Join ${invitation.community.name}`}
                    >
                      Join
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!online || busy !== null}
                      onClick={() => void respond(invitation, 'decline')}
                      aria-label={`Decline ${invitation.community.name}`}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {requests.length > 0 && (
          <section aria-labelledby="friend-requests" className="flex flex-col gap-2">
            <h2 id="friend-requests" className="font-medium">
              Requests
            </h2>
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {requests.map((request) => (
                <li key={request.user.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PersonLink user={request.user} className="text-sm font-medium" />
                    <time dateTime={request.since} className="text-xs text-muted">
                      {relativeTime(request.since)}
                    </time>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      busy={busy === request.user.id}
                      disabled={!online || busy !== null}
                      onClick={() => void answer(request, 'accept')}
                      aria-label={`Accept ${request.user.displayName}`}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!online || busy !== null}
                      onClick={() => void answer(request, 'ignore')}
                      aria-label={`Ignore ${request.user.displayName}`}
                    >
                      Ignore
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && (requests.length > 0 || friends.length > 0) && (
          <section aria-labelledby="your-friends" className="flex flex-col gap-2">
            <h2 id="your-friends" className="font-medium">
              Your friends
            </h2>
            {friends.length === 0 ? (
              <p className="text-sm text-muted">Friends you accept appear here.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                {friends.map((friend) => (
                  <li key={friend.user.id} className="flex items-center gap-2 px-4 py-1">
                    <PersonLink user={friend.user} className="text-sm" />
                    <button
                      type="button"
                      aria-label={`Actions for ${friend.user.displayName}`}
                      disabled={!online}
                      onClick={() => setRemoving(friend)}
                      className="flex size-11 items-center justify-center rounded-full text-muted disabled:opacity-50"
                    >
                      <span aria-hidden="true" className="text-lg leading-none">
                        ⋯
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {removing && (
        <RemoveFriendSheet
          userId={removing.user.id}
          name={removing.user.displayName}
          online={online}
          onClose={() => setRemoving(null)}
          onRemoved={() => dropFriend(removing.user.id)}
          onGone={() => dropFriend(removing.user.id)}
        />
      )}
    </ScreenLayout>
  );
}
