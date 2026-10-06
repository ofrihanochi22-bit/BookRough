import { create } from 'zustand';

import { countFriendRequests } from '../api/friends';
import { countMyInvitations } from '../api/invitations';

interface FriendRequestsState {
  /** Friend requests plus community invitations waiting for the viewer. */
  count: number;
  refresh: () => Promise<void>;
  setCount: (count: number) => void;
}

/**
 * The Friends tab's badge — docs/features/friend-requests.md §5.1, and since
 * invite-friends.md §5.5 it counts invitations too. Refreshed on app load and
 * navigation; the Friends screen sets it after an answer. A failed fetch keeps
 * the last count: the badge is a hint, not an error state.
 */
export const useFriendRequests = create<FriendRequestsState>()((set) => ({
  count: 0,
  refresh: async () => {
    try {
      const [requests, invitations] = await Promise.all([
        countFriendRequests(),
        countMyInvitations(),
      ]);
      set({ count: requests + invitations });
    } catch {
      // Keep the last count.
    }
  },
  setCount: (count) => set({ count: Math.max(0, count) }),
}));
