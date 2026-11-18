import { useState } from 'react';
import { isAxiosError } from 'axios';

import { type PublicPost, retryConversion } from '../api/posts';

/** What a pending post says before any retry (conversion-retry.md §5). */
export const PENDING_NOTICE =
  "Couldn't convert this link to other services. Something went wrong on our side.";
/** The Public Profile ratings row, which has no button (pending-notice-lists.md §5.2). */
export const PENDING_SHORT_NOTICE = "Couldn't convert this link to other services.";
export const STILL_PENDING_NOTICE = "Still couldn't convert it. Try again in a little while.";
/** No answer from the server at all. */
export const RETRY_FAILED_NOTICE = "Couldn't try again. Check your connection.";
/** The server answered with an error (429, 5xx). The request skips the global toast, so this line is all the viewer sees. */
export const RETRY_ERROR_NOTICE = "Couldn't try again right now.";

/**
 * Any viewer tries a pending post's conversion again (conversion-retry.md §5).
 * `notice` is the card's one line about the failure: it starts as
 * PENDING_NOTICE and is replaced by the latest retry's outcome.
 */
export function useRetryConversion(
  post: PublicPost,
  onUpdated: (post: PublicPost) => void,
  onStale: () => void,
) {
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState(PENDING_NOTICE);

  async function retry() {
    setRetrying(true);
    try {
      const updated = await retryConversion(post.id);
      if (updated.conversionPending) {
        setNotice(STILL_PENDING_NOTICE);
      }
      onUpdated(updated);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      if (status === 404 || status === 409) {
        onStale();
      } else {
        setNotice(status === undefined ? RETRY_FAILED_NOTICE : RETRY_ERROR_NOTICE);
      }
    } finally {
      setRetrying(false);
    }
  }

  return { retrying, notice, retry };
}
