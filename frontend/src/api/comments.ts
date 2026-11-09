import { api, type SuccessBody } from './client';

/** Mirrors the backend's PublicComment — docs/features/discussion-threads.md §4 (UC-22). */
export interface PublicComment {
  id: string;
  author: { id: string; displayName: string; profilePictureUrl: string | null };
  /** Null once deleted with its replies kept ("Comment deleted"). */
  body: string | null;
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  ratingId: string | null;
  parentId: string | null;
  replyTo: { id: string; displayName: string; profilePictureUrl: string | null } | null;
  isMine: boolean;
  canDelete: boolean;
}

export interface NewComment {
  body: string;
  ratingId?: string;
  parentId?: string;
  replyToId?: string;
}

/** Every caller shows its own outcome, so no global error toast. */
const quiet = { skipErrorToast: true } as const;

export async function listComments(postId: string): Promise<PublicComment[]> {
  const response = await api.get<SuccessBody<{ comments: PublicComment[] }>>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    quiet,
  );
  return response.data.data.comments;
}

export async function addComment(postId: string, input: NewComment): Promise<PublicComment> {
  const response = await api.post<SuccessBody<{ comment: PublicComment }>>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    input,
    quiet,
  );
  return response.data.data.comment;
}

export async function editComment(commentId: string, body: string): Promise<PublicComment> {
  const response = await api.patch<SuccessBody<{ comment: PublicComment }>>(
    `/comments/${encodeURIComponent(commentId)}`,
    { body },
    quiet,
  );
  return response.data.data.comment;
}

export async function deleteComment(commentId: string): Promise<'removed' | 'hidden'> {
  const response = await api.delete<SuccessBody<{ deleted: 'removed' | 'hidden' }>>(
    `/comments/${encodeURIComponent(commentId)}`,
    quiet,
  );
  return response.data.data.deleted;
}
