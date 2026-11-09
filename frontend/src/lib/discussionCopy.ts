import { isAxiosError } from 'axios';

/** docs/features/discussion-threads.md §5.1 (UC-22). */
export const DISCUSSION_COPY = {
  empty: 'No comments yet. Start the conversation.',
  loadFailed: "Couldn't load the discussion.",
  sendFailed: "Couldn't send your comment. Try again.",
  offline: "You're offline. Connect to comment.",
  deleted: 'Comment deleted',
  deleteFailed: "Couldn't delete the comment. Try again.",
  gone: 'That comment is gone.',
} as const;

export function messageOf(error: unknown, fallback: string): string {
  if (isAxiosError<{ message?: string }>(error) && error.response) {
    return error.response.data?.message ?? fallback;
  }
  return fallback;
}
