import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { type Friendship, removeFriend } from '../api/friends';
import { ACTION_FAILED, removedFriend, removeFriendBody } from '../lib/friendCopy';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

interface RemoveFriendSheetProps {
  userId: string;
  name: string;
  online: boolean;
  onClose: () => void;
  /** The friendship is gone (or already was); the server's relation afterwards. */
  onRemoved: (friendship: Friendship) => void;
  /** The person no longer exists: the server said 404. */
  onGone: () => void;
}

/**
 * UC-8's confirmation — docs/features/unfriend.md §5.1. Opened from the
 * Friends row's ⋯ and the profile's Friends button. Silent for the other person.
 */
export function RemoveFriendSheet({
  userId,
  name,
  online,
  onClose,
  onRemoved,
  onGone,
}: RemoveFriendSheetProps) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const friendship = await removeFriend(userId);
      toast.success(removedFriend(name));
      onRemoved(friendship);
    } catch (error) {
      if (isAxiosError<{ message?: string }>(error) && error.response?.status === 404) {
        toast.error(error.response.data?.message ?? ACTION_FAILED);
        onGone();
      } else {
        toast.error(ACTION_FAILED);
      }
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Sheet title="Remove friend?" onClose={onClose} dismissible={!busy}>
      <p className="text-sm text-muted">{removeFriendBody(name)}</p>
      <div className="flex gap-2">
        <Button busy={busy} disabled={!online} onClick={() => void remove()}>
          Remove friend
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}
