import { api, type SuccessBody } from './client';

/** Mirrors the backend's PublicRating (docs/features/rate-post.md §4). */
export interface PublicRating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
}

export interface NewRating {
  score: number;
  comment: string | null;
}

/** The rating sheet shows its own outcome, so the global toast is skipped. */
export async function ratePost(postId: string, input: NewRating): Promise<PublicRating> {
  const response = await api.post<SuccessBody<{ rating: PublicRating }>>(
    `/posts/${encodeURIComponent(postId)}/ratings`,
    input,
    { skipErrorToast: true },
  );
  return response.data.data.rating;
}
