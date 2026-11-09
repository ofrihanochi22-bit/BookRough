import { useCallback, useState } from 'react';

import {
  addComment,
  deleteComment,
  editComment,
  listComments,
  type NewComment,
  type PublicComment,
} from '../api/comments';
import { useRequest } from './useRequest';

export type Person = PublicComment['author'];

/** A thread's opener: a review (its rating) or a post comment. */
export type Opener = { kind: 'review'; ratingId: string } | { kind: 'comment'; commentId: string };

export interface Discussion {
  state: ReturnType<typeof useRequest<PublicComment[]>>;
  comments: PublicComment[];
  /** Post comments, oldest first: the openers that aren't reviews. */
  postComments: PublicComment[];
  repliesTo: (opener: Opener) => PublicComment[];
  send: (input: NewComment) => Promise<void>;
  edit: (comment: PublicComment, body: string) => Promise<void>;
  remove: (comment: PublicComment) => Promise<void>;
}

/** The post's discussion: loaded once, then changed in place as the viewer writes. */
export function useDiscussion(postId: string): Discussion {
  const load = useCallback(() => listComments(postId), [postId]);
  const state = useRequest(load);
  const [local, setLocal] = useState<{ base: PublicComment[]; comments: PublicComment[] } | null>(
    null,
  );

  const base = state.status === 'ready' ? state.data : null;
  const comments = base ? (local?.base === base ? local.comments : base) : [];

  function update(change: (current: PublicComment[]) => PublicComment[]) {
    if (base) {
      setLocal((previous) => ({
        base,
        comments: change(previous?.base === base ? previous.comments : base),
      }));
    }
  }

  return {
    state,
    comments,
    postComments: comments.filter((c) => c.ratingId === null && c.parentId === null),
    repliesTo: (opener) =>
      comments.filter((c) =>
        opener.kind === 'review' ? c.ratingId === opener.ratingId : c.parentId === opener.commentId,
      ),
    send: async (input) => {
      const created = await addComment(postId, input);
      update((current) => [...current, created]);
    },
    edit: async (comment, body) => {
      const updated = await editComment(comment.id, body);
      update((current) => current.map((c) => (c.id === updated.id ? updated : c)));
    },
    remove: async (comment) => {
      const outcome = await deleteComment(comment.id);
      update((current) => {
        if (outcome === 'hidden') {
          return current.map((c) =>
            c.id === comment.id ? { ...c, body: null, deleted: true, canDelete: false } : c,
          );
        }
        const left = current.filter((c) => c.id !== comment.id);
        // The last reply under a hidden opener takes the opener with it (§4).
        const parent = left.find((c) => c.id === comment.parentId);
        if (parent?.deleted && !left.some((c) => c.parentId === parent.id)) {
          return left.filter((c) => c.id !== parent.id);
        }
        return left;
      });
    },
  };
}
