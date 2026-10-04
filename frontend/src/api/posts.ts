import type { StreamingService } from '../stores/auth';
import { api, type SuccessBody } from './client';

export type PostKind = 'TRACK' | 'ALBUM';

/** Mirrors the backend's PublicPost (docs/features/posts-feed.md §4). */
export interface PublicPost {
  id: string;
  author: { id: string; displayName: string; profilePictureUrl: string | null };
  isMine: boolean;
  originalUrl: string;
  sourceService: StreamingService;
  kind: PostKind | null;
  title: string | null;
  artist: string | null;
  coverArtUrl: string | null;
  links: Partial<Record<StreamingService, string>>;
  comment: string | null;
  conversionPending: boolean;
  createdAt: string;
}

export interface PostsPage {
  posts: PublicPost[];
  nextCursor: string | null;
}

export interface NewPost {
  url: string;
  comment: string | null;
}

/**
 * Waits for the whole conversion (CLAUDE.md §7: up to 12 s on the server). The
 * composer shows its own errors, so the global toast is skipped.
 */
export async function createPost(communityId: string, input: NewPost): Promise<PublicPost> {
  const response = await api.post<SuccessBody<{ post: PublicPost }>>(
    `/communities/${encodeURIComponent(communityId)}/posts`,
    input,
    { skipErrorToast: true },
  );
  return response.data.data.post;
}

/** The feed shows an inline retry on failure, so no toast. */
export async function listPosts(communityId: string, before?: string): Promise<PostsPage> {
  const response = await api.get<SuccessBody<PostsPage>>(
    `/communities/${encodeURIComponent(communityId)}/posts`,
    { params: before ? { before } : undefined, skipErrorToast: true },
  );
  return response.data.data;
}

/** The card shows its own outcome, so no toast. */
export async function retryConversion(postId: string): Promise<PublicPost> {
  const response = await api.post<SuccessBody<{ post: PublicPost }>>(
    `/posts/${encodeURIComponent(postId)}/conversion`,
    undefined,
    { skipErrorToast: true },
  );
  return response.data.data.post;
}
