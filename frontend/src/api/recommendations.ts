import { api, type SuccessBody } from './client';
import {
  CONVERSION_REQUEST_TIMEOUT_MS,
  type NewPost,
  type PostsPage,
  type PublicPost,
} from './posts';

/** Every caller shows its own outcome, so no global error toast. */
const quiet = { skipErrorToast: true } as const;

/**
 * Waits for the whole conversion, like posting (CLAUDE.md §7). UC-20,
 * docs/features/direct-recommendations.md §4.
 */
export async function sendRecommendation(recipientId: string, input: NewPost): Promise<PublicPost> {
  const response = await api.post<SuccessBody<{ post: PublicPost }>>(
    '/recommendations',
    { recipientId, ...input },
    { ...quiet, timeout: CONVERSION_REQUEST_TIMEOUT_MS },
  );
  return response.data.data.post;
}

export async function listReceived(before?: string): Promise<PostsPage> {
  const response = await api.get<SuccessBody<PostsPage>>('/recommendations/received', {
    ...quiet,
    params: before ? { before } : undefined,
  });
  return response.data.data;
}

export async function listSent(before?: string): Promise<PostsPage> {
  const response = await api.get<SuccessBody<PostsPage>>('/recommendations/sent', {
    ...quiet,
    params: before ? { before } : undefined,
  });
  return response.data.data;
}

export async function countUnseenRecommendations(): Promise<number> {
  const response = await api.get<SuccessBody<{ count: number }>>(
    '/recommendations/unseen-count',
    quiet,
  );
  return response.data.data.count;
}

export async function markRecommendationsSeen(): Promise<void> {
  await api.post('/recommendations/seen', undefined, quiet);
}

export async function hideRecommendation(postId: string): Promise<void> {
  await api.put(`/recommendations/${encodeURIComponent(postId)}/hidden`, undefined, quiet);
}
