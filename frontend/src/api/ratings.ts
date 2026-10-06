import { api, type SuccessBody } from './client';
import type { RatingSummary } from './posts';

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

/** One row of a post's ratings (docs/features/post-detail.md §4). */
export interface PublicPostRating {
  id: string;
  rater: { id: string; displayName: string; profilePictureUrl: string | null };
  isMine: boolean;
  score: number;
  comment: string | null;
  createdAt: string;
}

export interface PostRatings {
  ratingSummary: RatingSummary;
  ratings: PublicPostRating[];
}

/** Post Detail shows "Could not load comments at this time." itself, so no toast. */
export async function listPostRatings(postId: string): Promise<PostRatings> {
  const response = await api.get<SuccessBody<PostRatings>>(
    `/posts/${encodeURIComponent(postId)}/ratings`,
    { skipErrorToast: true },
  );
  return response.data.data;
}

/** The rating sheet shows its own outcome, so no toast. */
export async function editRating(postId: string, input: NewRating): Promise<PublicPostRating> {
  const response = await api.patch<SuccessBody<{ rating: PublicPostRating }>>(
    `/posts/${encodeURIComponent(postId)}/rating`,
    input,
    { skipErrorToast: true },
  );
  return response.data.data.rating;
}
