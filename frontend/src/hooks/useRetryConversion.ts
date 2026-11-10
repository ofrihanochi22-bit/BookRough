import { useState } from 'react';
import { isAxiosError } from 'axios';

import { type PublicPost, retryConversion } from '../api/posts';

/** The author tries a pending post's conversion again (posts-feed.md §5.3). */
export function useRetryConversion(
  post: PublicPost,
  onUpdated: (post: PublicPost) => void,
  onStale: () => void,
) {
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setRetryMessage(null);
    try {
      const updated = await retryConversion(post.id);
      if (updated.conversionPending) {
        setRetryMessage('Still unavailable. Try again later.');
      }
      onUpdated(updated);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      if (status === 404 || status === 409) {
        onStale();
      } else {
        setRetryMessage("Couldn't try again. Check your connection.");
      }
    } finally {
      setRetrying(false);
    }
  }

  return { retrying, retryMessage, retry };
}
