import { create } from 'zustand';

import { countFriendRequests } from '../api/friends';
import { countMyInvitations } from '../api/invitations';
import { countUnseenRecommendations } from '../api/recommendations';

interface FriendRequestsState {
  /** Friend requests plus community invitations waiting for the viewer. */
  count: number;
  /** Recommendations received since Received was last opened. */
  unseen: number;
  refresh: () => Promise<void>;
  setCount: (count: number) => void;
}

/**
 * The Friends tab's badge — docs/features/friend-requests.md §5.1, and since
 * invite-friends.md §5.5 it counts invitations too; unseen recommendations are
 * kept apart (direct-recommendations.md §5.1), and the tab shows the sum. Refreshed
 * on app load and navigation; the Friends screen sets `count` after an answer. A failed fetch keeps
 * the last count: the badge is a hint, not an error state.
 */
export const useFriendRequests = create<FriendRequestsState>()((set) => ({
  count: 0,
  unseen: 0,
  refresh: async () => {
    try {
      const [requests, invitations, unseen] = await Promise.all([
        countFriendRequests(),
        countMyInvitations(),
        countUnseenRecommendations(),
      ]);
      set({ count: requests + invitations, unseen });
    } catch {
      // Keep the last count.
    }
  },
  setCount: (count) => set({ count: Math.max(0, count) }),
}));
