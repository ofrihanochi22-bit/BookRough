import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { listFriends } from '../api/friends';
import type { MemberUser } from '../api/membership';
import type { NewPost, PublicPost } from '../api/posts';
import { sendRecommendation } from '../api/recommendations';
import { useRequest } from '../hooks/useRequest';
import { RECIPIENT_GONE, SEND_FAILED, sentTo } from '../lib/recommendationCopy';
import { LinkCommentForm, type LinkFormOutcome } from './LinkCommentForm';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { LoadError } from './ui/LoadError';
import { Sheet } from './ui/Sheet';
import { Skeleton } from './ui/Skeleton';

interface SendRecommendationSheetProps {
  /** Opened from a friend's profile: they are chosen, with no picker. */
  friend?: MemberUser;
  online: boolean;
  onClose: () => void;
  onSent: (post: PublicPost) => void;
  /** Friendship ended while the sheet was open: the screen behind is out of date. */
  onStale?: () => void;
}

/** The friend picker, for when the sheet opens without a friend. */
function ChooseFriend({ onPick }: { onPick: (friend: MemberUser) => void }) {
  const friends = useRequest(listFriends);

  if (friends.status === 'loading') {
    return (
      <div role="status" aria-label="Loading your friends" className="flex flex-col gap-3">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    );
  }
  if (friends.status === 'error') {
    return <LoadError message="Couldn't load your friends." onRetry={friends.reload} />;
  }
  if (friends.data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center">
        <p className="font-medium">Add a friend first</p>
        <p className="mt-1 text-sm text-muted">
          Find people on the{' '}
          <Link to="/search" className="text-accent underline">
            Search
          </Link>{' '}
          tab.
        </p>
      </div>
    );
  }
  return (
    <ul aria-label="Choose a friend" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
      {friends.data.map(({ user }) => (
        <li key={user.id}>
          <button
            type="button"
            onClick={() => onPick(user)}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1 text-left text-sm font-medium"
          >
            <Avatar
              id={user.id}
              name={user.displayName}
              pictureUrl={user.profilePictureUrl}
              size={32}
              decorative
            />
            <span className="min-w-0 break-words">{user.displayName}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Send a song to one friend — docs/features/direct-recommendations.md §5.3.
 * The same sheet opens from Recommendations, with a picker, and from a friend's
 * profile, with them chosen. It cannot be dismissed during the conversion, and
 * no outcome but success clears the draft.
 */
export function SendRecommendationSheet({
  friend,
  online,
  onClose,
  onSent,
  onStale,
}: SendRecommendationSheetProps) {
  const [picked, setPicked] = useState<MemberUser | null>(friend ?? null);
  const [choosing, setChoosing] = useState(!friend);
  const [busy, setBusy] = useState(false);
  // Told on closing, so a reload behind the sheet does not unmount it and its draft.
  const stale = useRef(false);

  function close() {
    onClose();
    if (stale.current) {
      onStale?.();
    }
  }

  async function send(recipient: MemberUser, input: NewPost): Promise<LinkFormOutcome> {
    try {
      const post = await sendRecommendation(recipient.id, input);
      toast.success(sentTo(recipient.displayName));
      onSent(post);
      return { status: 'done' };
    } catch (caught) {
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      if (response?.status === 422 && response.data?.message) {
        return { status: 'link-error', message: response.data.message };
      }
      // Rate limited: the draft stays and says why (production-hardening.md §3.1).
      if (response?.status === 429 && response.data?.message) {
        return { status: 'error', message: response.data.message };
      }
      if (response?.status === 403) {
        stale.current = true;
        return { status: 'error', message: response.data?.message ?? SEND_FAILED };
      }
      if (response?.status === 404) {
        stale.current = true;
        return { status: 'error', message: RECIPIENT_GONE };
      }
      return { status: 'error', message: SEND_FAILED };
    }
  }

  return (
    <Sheet title="Send a song" onClose={close} dismissible={!busy}>
      {choosing && (
        <ChooseFriend
          onPick={(next) => {
            setPicked(next);
            setChoosing(false);
          }}
        />
      )}
      {/* Hidden, not unmounted, while choosing: the draft must survive a change of friend. */}
      {picked && (
        <div className={`${choosing ? 'hidden' : 'flex'} flex-col gap-4`}>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 break-words text-sm">
              To <span className="font-medium">{picked.displayName}</span>
            </p>
            {!friend && (
              <Button variant="secondary" disabled={busy} onClick={() => setChoosing(true)}>
                Change
              </Button>
            )}
          </div>
          <LinkCommentForm
            name="Send a song"
            linkLabel="Song or album link"
            submitLabel="Send"
            online={online}
            submit={(input) => send(picked, input)}
            onBusyChange={setBusy}
          />
        </div>
      )}
    </Sheet>
  );
}
