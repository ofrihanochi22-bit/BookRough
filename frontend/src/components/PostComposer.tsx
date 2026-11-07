import { isAxiosError } from 'axios';

import { createPost, type NewPost, type PublicPost } from '../api/posts';
import { LinkCommentForm, type LinkFormOutcome } from './LinkCommentForm';

interface PostComposerProps {
  communityId: string;
  online: boolean;
  onPosted: (post: PublicPost) => void;
  /** The community vanished or the caller was removed (404). */
  onGone: () => void;
}

const NETWORK_ERROR = "Couldn't post. Check your connection and try again.";

/** Paste a link, optionally comment, Post — docs/features/posts-feed.md §5.2. */
export function PostComposer({ communityId, online, onPosted, onGone }: PostComposerProps) {
  async function share(input: NewPost): Promise<LinkFormOutcome> {
    try {
      onPosted(await createPost(communityId, input));
      return { status: 'done' };
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      const message = isAxiosError<{ message?: string }>(caught)
        ? caught.response?.data?.message
        : undefined;
      if (status === 404) {
        onGone();
        return { status: 'gone' };
      }
      if (status === 422 && message) {
        return { status: 'link-error', message };
      }
      // Rate limited: the draft stays, and the wait is the reason, not the
      // connection (production-hardening.md §3.1).
      if (status === 429 && message) {
        return { status: 'error', message };
      }
      return { status: 'error', message: NETWORK_ERROR };
    }
  }

  return (
    <LinkCommentForm
      name="Share a song"
      linkLabel="Share a song or album"
      submitLabel="Post"
      online={online}
      submit={share}
      className="rounded-2xl border border-line bg-surface p-4"
    />
  );
}
