import { create } from 'zustand';

import { countFriendRequests } from '../api/friends';

interface FriendRequestsState {
  /** Pending requests to the viewer; 0 until known, and after a failed fetch. */
  count: number;
  refresh: () => Promise<void>;
  setCount: (count: number) => void;
}

/**
 * The Friends tab's badge (docs/features/friend-requests.md §5.1). Refreshed on
 * app load and navigation; the Friends screen sets it after accepting or ignoring.
 * A failed fetch keeps the last count: the badge is a hint, not an error state.
 */
export const useFriendRequests = create<FriendRequestsState>()((set) => ({
  count: 0,
  refresh: async () => {
    try {
      set({ count: await countFriendRequests() });
    } catch {
      // Keep the last count.
    }
  },
  setCount: (count) => set({ count: Math.max(0, count) }),
}));
