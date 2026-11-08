import { create } from 'zustand';

import { countUnreadNotifications } from '../api/notifications';

interface NotificationsState {
  /** Unread notifications the viewer can see; a community group counts once. */
  unread: number;
  refresh: () => Promise<void>;
  setUnread: (unread: number) => void;
  /** One was read here; applied to the latest count, so quick taps each count. */
  readOne: () => void;
}

/**
 * The Home tab's badge and the bell's count — docs/features/notifications.md
 * §5.2. Refreshed on app load and navigation, like the Friends badge; a failed
 * fetch keeps the last count, because the badge is a hint, not an error state.
 */
export const useNotifications = create<NotificationsState>()((set) => ({
  unread: 0,
  refresh: async () => {
    try {
      set({ unread: await countUnreadNotifications() });
    } catch {
      // Keep the last count.
    }
  },
  setUnread: (unread) => set({ unread: Math.max(0, unread) }),
  readOne: () => set((state) => ({ unread: Math.max(0, state.unread - 1) })),
}));
