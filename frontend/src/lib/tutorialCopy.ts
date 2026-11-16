/** The onboarding tutorial's copy — docs/features/onboarding-tutorial.md §5. */

import type { StreamingService } from '../stores/auth';
import { streamingServiceLabel } from './streamingServices';

/** Which picture a slide shows (components/guide/GuidePictures.tsx). */
export type GuidePicture = 'songs' | 'communities' | 'share' | 'save' | 'rate' | 'friends';

export interface GuideSlide {
  picture: GuidePicture;
  title: string;
  body: string;
  /** The picture's accessible name: what it shows and which control is marked. */
  label: string;
}

/** What the slides adapt to (§5.1 "Adapted to the user"). */
export interface GuideContext {
  /** Touch screens read "Tap", a mouse reads "Click". */
  touch: boolean;
  /** The user's streaming service; unset reads as Apple Music. */
  service: StreamingService | null;
}

/** The friend's service on slide 1: Spotify, unless that is the user's own. */
export function guideServices(service: StreamingService | null): {
  yours: string;
  theirs: string;
} {
  const own = service ?? 'APPLE_MUSIC';
  return {
    yours: streamingServiceLabel(own),
    theirs: streamingServiceLabel(own === 'SPOTIFY' ? 'APPLE_MUSIC' : 'SPOTIFY'),
  };
}

/** The six slides of the guide, in order (§5.1). */
export function guideSlides({ touch, service }: GuideContext): GuideSlide[] {
  const Tap = touch ? 'Tap' : 'Click';
  const tap = touch ? 'tap' : 'click';
  const { yours, theirs } = guideServices(service);
  return [
    {
      picture: 'songs',
      title: 'Songs that travel',
      body: `A friend shares a song from ${theirs}. You get it on ${yours}, the service in your profile. Converting a link takes a few seconds.`,
      label: `A post from a friend, with a button to open it on ${yours} marked.`,
    },
    {
      picture: 'communities',
      title: 'Join or start a community',
      body: `Communities are your friend groups. ${Tap} Create community on Home to start one. Got an invite link? Open it to join.`,
      label: 'The Home screen, with the Create community tile marked.',
    },
    {
      picture: 'share',
      title: 'Share a song',
      body: `${Tap} Share in the middle of the bar. Pick a community or a friend, then paste a link from any service.`,
      label: 'The Home screen, with the Share button in the middle of the bottom bar marked.',
    },
    {
      picture: 'save',
      title: 'Save it for later',
      body: `In a community, ${tap} the bookmark on a post. The song goes to My List.`,
      label: 'A community feed, with the bookmark on a post marked.',
    },
    {
      picture: 'rate',
      title: 'Rate what you heard',
      body: `Once you've listened, open My List and ${tap} Rate & Review. Score it 1 to 10. A song a friend sends you is rated right from Recommendations.`,
      label: 'My List, with the Rate and Review button on a saved song marked.',
    },
    {
      picture: 'friends',
      title: 'Friends and the bell',
      body: 'Add friends on the Friends tab, then send a song straight to one. The bell on Home shows new posts, ratings, replies and invitations.',
      label: 'The Home screen, with the bell and the Friends tab marked.',
    },
  ];
}

export const SWIPE_HINT = 'Swipe to move between slides.';
export const KEYS_HINT = 'Use the arrow keys to move between slides.';
export const REOPEN_HINT = 'You can open this guide again from Profile.';

export const SAVE_TIP = "Save a song to listen later. You'll rate it from My List.";
export const LIST_TIP = 'Listened? Rate it here. Your score shows on the post.';
export const REPLAY_LABEL = 'How BookRough works';
