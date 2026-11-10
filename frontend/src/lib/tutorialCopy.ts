/** The onboarding tutorial's copy — docs/features/onboarding-tutorial.md §5. */

export interface WalkthroughCard {
  title: string;
  body: string;
}

export const WALKTHROUGH_CARDS: readonly WalkthroughCard[] = [
  {
    title: 'Welcome to BookRough',
    body: 'Share music with your friends, whatever service each of you listens on.',
  },
  {
    title: 'Share a song',
    body: 'Tap Share in the middle of the bar. Send a song to a community or straight to a friend — paste a link from any service.',
  },
  {
    title: 'Links that travel',
    body: 'Each friend gets the song on their own service, the one in their profile. Converting a link takes a few seconds.',
  },
  {
    title: 'Save, listen, rate',
    body: "Save a community post with the bookmark and it goes to My List. Once you've listened, rate it there, 1 to 10. A song a friend sends you can be rated right from Recommendations.",
  },
  {
    title: 'Friends and notifications',
    body: 'Add friends on the Friends tab — search finds anyone. The bell on Home shows new posts, ratings, replies and invitations.',
  },
];

export const SAVE_TIP = "Save a song to listen later — you'll rate it from My List.";
export const LIST_TIP = 'Listened? Rate it here — your score shows on the post.';
export const REPLAY_LABEL = 'How BookRough works';
