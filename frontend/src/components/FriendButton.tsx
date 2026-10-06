import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import {
  acceptFriendRequest,
  cancelFriendRequest,
  type Friendship,
  ignoreFriendRequest,
  sendFriendRequest,
} from '../api/friends';
import { ACTION_FAILED, nowFriends, REQUEST_SENT, requestFrom } from '../lib/friendCopy';
import { useFriendRequests } from '../stores/friendRequests';
import { RemoveFriendSheet } from './RemoveFriendSheet';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

interface FriendButtonProps {
  userId: string;
  name: string;
  friendship: Friendship;
  online: boolean;
  /** The server's answer after an action — the button never guesses. */
  onChanged: (friendship: Friendship) => void;
  /** The request vanished under an Accept: reload the profile to the true state. */
  onStale: () => void;
}

/**
 * The Public Profile's friend control — docs/features/friend-requests.md §5.3:
 * Add Friend, Request sent (cancel in a sheet), Respond (Accept / Ignore in a
 * sheet), or Friends (remove in a sheet, docs/features/unfriend.md §5.3).
 */
export function FriendButton({
  userId,
  name,
  friendship,
  online,
  onChanged,
  onStale,
}: FriendButtonProps) {
  const refreshCount = useFriendRequests((state) => state.refresh);
  const [busy, setBusy] = useState<'send' | 'cancel' | 'accept' | 'ignore' | null>(null);
  const [sheet, setSheet] = useState<'sent' | 'respond' | 'remove' | null>(null);

  async function run(
    action: NonNullable<typeof busy>,
    request: () => Promise<Friendship>,
    done?: (next: Friendship) => void,
  ) {
    setBusy(action);
    try {
      const next = await request();
      setSheet(null);
      onChanged(next);
      done?.(next);
    } catch (error) {
      if (action === 'accept' && isAxiosError(error) && error.response?.status === 404) {
        setSheet(null);
        void refreshCount();
        const message = (error.response.data as { message?: string } | undefined)?.message;
        toast.error(message ?? ACTION_FAILED);
        onStale();
      } else {
        toast.error(ACTION_FAILED);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {friendship === 'FRIENDS' && (
        <Button variant="secondary" disabled={!online} onClick={() => setSheet('remove')}>
          ✓ Friends
        </Button>
      )}

      {sheet === 'remove' && (
        <RemoveFriendSheet
          userId={userId}
          name={name}
          online={online}
          onClose={() => setSheet(null)}
          onRemoved={() => onChanged('NONE')}
          onGone={onStale}
        />
      )}

      {friendship === 'NONE' && (
        <Button
          busy={busy === 'send'}
          disabled={!online}
          onClick={() =>
            void run(
              'send',
              () => sendFriendRequest(userId),
              (next) => {
                toast.success(next === 'FRIENDS' ? nowFriends(name) : REQUEST_SENT);
                // Sending back accepted their request: it leaves the badge.
                if (next === 'FRIENDS') {
                  void refreshCount();
                }
              },
            )
          }
        >
          Add Friend
        </Button>
      )}

      {friendship === 'REQUEST_SENT' && (
        <Button variant="secondary" disabled={!online} onClick={() => setSheet('sent')}>
          Request sent
        </Button>
      )}

      {friendship === 'REQUEST_RECEIVED' && (
        <Button disabled={!online} onClick={() => setSheet('respond')}>
          Respond
        </Button>
      )}

      {sheet === 'sent' && (
        <Sheet title="Request sent" onClose={() => setSheet(null)} dismissible={busy === null}>
          <p className="text-sm text-muted">You asked {name} to be friends.</p>
          <Button
            variant="secondary"
            busy={busy === 'cancel'}
            disabled={!online}
            onClick={() => void run('cancel', () => cancelFriendRequest(userId))}
          >
            Cancel request
          </Button>
        </Sheet>
      )}

      {sheet === 'respond' && (
        <Sheet title="Friend request" onClose={() => setSheet(null)} dismissible={busy === null}>
          <p className="text-sm text-muted">{requestFrom(name)}</p>
          <div className="flex gap-2">
            <Button
              busy={busy === 'accept'}
              disabled={!online || busy !== null}
              onClick={() =>
                void run(
                  'accept',
                  async () => {
                    await acceptFriendRequest(userId);
                    return 'FRIENDS';
                  },
                  () => {
                    toast.success(nowFriends(name));
                    void refreshCount();
                  },
                )
              }
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              busy={busy === 'ignore'}
              disabled={!online || busy !== null}
              onClick={() =>
                void run(
                  'ignore',
                  async () => {
                    await ignoreFriendRequest(userId);
                    return 'NONE';
                  },
                  () => void refreshCount(),
                )
              }
            >
              Ignore
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
