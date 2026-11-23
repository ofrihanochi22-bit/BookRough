import { create } from 'zustand';

import type { LinkPlatform } from '../api/posts';
import { useAuthStore } from './auth';

/** What the docked player shows (docs/features/in-app-player.md §5.1). */
export interface NowPlaying {
  postId: string;
  platform: LinkPlatform;
  url: string;
  title: string;
}

interface PlayerState {
  current: NowPlaying | null;
  /**
   * How far the open bar reaches up from the bottom of the viewport, in px
   * (its height plus whatever sits under it), so pages can leave that much room.
   */
  space: number;
  /** A tab bar is on screen: the bar sits above it. */
  aboveTabBar: boolean;
  /** Replaces whatever is playing: one player at a time. */
  play: (item: NowPlaying) => void;
  close: () => void;
  setSpace: (space: number) => void;
  setAboveTabBar: (above: boolean) => void;
}

export const usePlayer = create<PlayerState>((set) => ({
  current: null,
  space: 0,
  aboveTabBar: false,
  play: (item) => set({ current: item }),
  close: () => set({ current: null, space: 0 }),
  setSpace: (space) => set({ space }),
  setAboveTabBar: (aboveTabBar) => set({ aboveTabBar }),
}));

// Sign-out and every 401 clear the auth store; nothing of the session keeps
// playing on the Welcome screen (§5.1).
useAuthStore.subscribe((state) => {
  if (!state.user && usePlayer.getState().current) {
    usePlayer.getState().close();
  }
});
