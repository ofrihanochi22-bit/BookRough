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
  /** Classes for the visible button, e.g. its share of the Mixtape action row. */
  className?: string;
  /**
   * `row`: a search result's control, where Add Friend and Respond are the
   * accent pill (search-friend-button.md §5.2). `profile`
   * keeps them secondary beside "Send a song" (ui-redesign.md §5.6).
   */
  emphasis?: 'profile' | 'row';
}

/**
 * The friend control on the Public Profile and on each Global Search result
 * (search-friend-button.md §5) — docs/features/friend-requests.md §5.3:
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
  className = '',
  emphasis = 'profile',
}: FriendButtonProps) {
  const refreshCount = useFriendRequests((state) => state.refresh);
  const mainVariant = emphasis === 'profile' ? 'secondary' : 'primary';
  const offline = !online;
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
        <Button
          variant="secondary"
          offline={offline}
          disabled={!online}
          onClick={() => setSheet('remove')}
          className={className}
        >
          ✓ Friends
        </Button>
      )}

      {sheet === 'remove' && (
        <RemoveFriendSheet
          userId={userId}
          name={name}
          online={online}
          onClose={() => setSheet(null)}
          onRemoved={onChanged}
          onGone={onStale}
        />
      )}

      {friendship === 'NONE' && (
        <Button
          variant={mainVariant}
          busy={busy === 'send'}
          offline={offline}
          disabled={!online}
          className={className}
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
        <Button
          variant="secondary"
          offline={offline}
          disabled={!online}
          onClick={() => setSheet('sent')}
          className={className}
        >
          Request sent
        </Button>
      )}

      {friendship === 'REQUEST_RECEIVED' && (
        <Button
          variant={mainVariant}
          offline={offline}
          disabled={!online}
          onClick={() => setSheet('respond')}
          className={className}
        >
          Respond
        </Button>
      )}

      {sheet === 'sent' && (
        <Sheet title="Request sent" onClose={() => setSheet(null)} dismissible={busy === null}>
          <div className="flex flex-col gap-4">
            <p className="text-sm">You asked {name} to be friends.</p>
            <Button
              variant="secondary"
              busy={busy === 'cancel'}
              disabled={!online}
              onClick={() => void run('cancel', () => cancelFriendRequest(userId))}
              className="w-full"
            >
              Cancel request
            </Button>
          </div>
        </Sheet>
      )}

      {sheet === 'respond' && (
        <Sheet title="Friend request" onClose={() => setSheet(null)} dismissible={busy === null}>
          <div className="flex flex-col gap-4">
            <p className="text-sm">{requestFrom(name)}</p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                busy={busy === 'ignore'}
                disabled={!online || busy !== null}
                className="flex-1"
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
              <Button
                busy={busy === 'accept'}
                disabled={!online || busy !== null}
                className="flex-1"
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
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
