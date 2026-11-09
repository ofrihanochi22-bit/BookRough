import { type FormEvent, useId, useState } from 'react';
import toast from 'react-hot-toast';

import type { PublicComment } from '../api/comments';
import { type Discussion, type Opener, type Person } from '../hooks/useDiscussion';
import { DISCUSSION_COPY, messageOf } from '../lib/discussionCopy';
import { cleanPostComment, DISCUSSION_MAX_GRAPHEMES, discussionBodyProblem } from '../lib/postText';
import { relativeTime } from '../lib/postLinks';
import { graphemeCount } from '../lib/textRules';
import { PersonLink } from './PersonLink';
import { Button } from './ui/Button';
import { LoadError } from './ui/LoadError';
import { Sheet } from './ui/Sheet';
import { Skeleton } from './ui/Skeleton';

interface ComposerProps {
  online: boolean;
  label: string;
  submitLabel?: string;
  initial?: string;
  /** "Replying to Dana" above the field, with Cancel. */
  replyingTo?: string;
  onCancel?: () => void;
  onSubmit: (body: string) => Promise<void>;
}

/** One text box for a comment, a reply or an edit. The draft survives any failure. */
export function CommentComposer({
  online,
  label,
  submitLabel = 'Send',
  initial = '',
  replyingTo,
  onCancel,
  onSubmit,
}: ComposerProps) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleaned = cleanPostComment(body);
  const problem = discussionBodyProblem(cleaned);
  const tooLong = problem !== null;
  const fieldId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || cleaned.length === 0 || tooLong) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cleaned);
      setBody('');
    } catch (caught) {
      setError(messageOf(caught, DISCUSSION_COPY.sendFailed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      {replyingTo && (
        <p className="text-xs text-muted">
          Replying to {replyingTo}
          {onCancel && (
            <button type="button" onClick={onCancel} className="ml-2 min-h-11 underline">
              Cancel
            </button>
          )}
        </p>
      )}
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium" htmlFor={fieldId}>
          {label}
        </label>
        <span className={`text-xs ${tooLong ? 'text-danger' : 'text-muted'}`} aria-hidden="true">
          {graphemeCount(cleaned)}/{DISCUSSION_MAX_GRAPHEMES}
        </span>
      </div>
      <textarea
        id={fieldId}
        rows={2}
        value={body}
        readOnly={busy}
        maxLength={4000}
        onChange={(event) => {
          setBody(event.target.value);
          setError(null);
        }}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
      />
      {problem && (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {!online && (
        <p role="note" className="text-xs text-muted">
          {DISCUSSION_COPY.offline}
        </p>
      )}
      <div className="flex gap-2 self-end">
        {onCancel && !replyingTo && (
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          busy={busy}
          disabled={!online || cleaned.length === 0 || tooLong}
          className="px-5"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface CommentItemProps {
  comment: PublicComment;
  /** Shown as "↩ to Dana" when the reply answers someone other than the opener's author. */
  openerAuthorId: string | null;
  online: boolean;
  canWrite: boolean;
  discussion: Discussion;
  onReply?: (person: Person) => void;
}

function CommentItem({
  comment,
  openerAuthorId,
  online,
  canWrite,
  discussion,
  onReply,
}: CommentItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (comment.deleted) {
    return <p className="text-sm italic text-muted">{DISCUSSION_COPY.deleted}</p>;
  }

  const showReplyTo = comment.replyTo !== null && comment.replyTo.id !== openerAuthorId;
  const hasMenu = (comment.isMine && canWrite) || comment.canDelete;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <PersonLink
          user={comment.author}
          label={comment.isMine ? 'You' : comment.author.displayName}
          className="text-sm font-medium"
        />
        {showReplyTo && (
          <span className="text-xs text-muted">↩ to {comment.replyTo!.displayName}</span>
        )}
        <time dateTime={comment.createdAt} className="text-xs text-muted">
          {relativeTime(comment.createdAt)}
        </time>
        {comment.editedAt && <span className="text-xs text-muted">· edited</span>}
        {hasMenu && (
          <button
            type="button"
            aria-label="Comment options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="-mr-2 ml-auto flex size-11 items-center justify-center rounded-full text-muted"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ⋯
            </span>
          </button>
        )}
      </div>
      {menuOpen && (
        <div className="flex justify-end gap-2">
          {comment.isMine && canWrite && (
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
          {comment.canDelete && (
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => {
                setMenuOpen(false);
                setDeleting(true);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}
      {editing ? (
        <CommentComposer
          online={online}
          label="Edit comment"
          submitLabel="Save"
          initial={comment.body ?? ''}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            await discussion.edit(comment, body);
            setEditing(false);
          }}
        />
      ) : (
        <p className="whitespace-pre-line break-words text-sm">{comment.body}</p>
      )}
      {onReply && canWrite && !editing && (
        <button
          type="button"
          disabled={!online}
          onClick={() => onReply(comment.author)}
          className="min-h-11 self-start text-sm font-medium text-accent disabled:opacity-60"
        >
          Reply
        </button>
      )}
      {deleting && (
        <DeleteCommentSheet
          onClose={() => setDeleting(false)}
          onConfirm={() => discussion.remove(comment)}
        />
      )}
    </div>
  );
}

function DeleteCommentSheet({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      toast.success('Comment deleted');
      onClose();
    } catch (caught) {
      toast.error(messageOf(caught, DISCUSSION_COPY.deleteFailed));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Delete this comment?" onClose={onClose} dismissible={!busy}>
      <div className="flex gap-3">
        <Button variant="secondary" disabled={busy} onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button busy={busy} onClick={() => void confirm()} className="flex-1">
          Delete
        </Button>
      </div>
    </Sheet>
  );
}

interface ThreadProps {
  opener: Opener;
  openerAuthor: Person;
  online: boolean;
  canWrite: boolean;
  discussion: Discussion;
}

/** One flat thread under a review or a post comment (D2), with its Reply composer. */
export function Thread({ opener, openerAuthor, online, canWrite, discussion }: ThreadProps) {
  const [replyTo, setReplyTo] = useState<Person | null>(null);
  const replies = discussion.repliesTo(opener);

  return (
    <div className="flex flex-col gap-3">
      {canWrite && !replyTo && (
        <button
          type="button"
          disabled={!online}
          onClick={() => setReplyTo(openerAuthor)}
          className="min-h-11 self-start text-sm font-medium text-accent disabled:opacity-60"
        >
          Reply
        </button>
      )}
      {replies.length > 0 && (
        <ul className="ml-4 flex flex-col gap-3 border-l border-line pl-3">
          {replies.map((reply) => (
            <li key={reply.id}>
              <CommentItem
                comment={reply}
                openerAuthorId={openerAuthor.id}
                online={online}
                canWrite={canWrite}
                discussion={discussion}
                onReply={setReplyTo}
              />
            </li>
          ))}
        </ul>
      )}
      {replyTo && (
        <div className="ml-4 pl-3">
          <CommentComposer
            online={online}
            label="Your reply"
            replyingTo={replyTo.displayName}
            onCancel={() => setReplyTo(null)}
            onSubmit={async (body) => {
              await discussion.send({
                body,
                ...(opener.kind === 'review'
                  ? { ratingId: opener.ratingId }
                  : { parentId: opener.commentId }),
                replyToId: replyTo.id,
              });
              setReplyTo(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

interface DiscussionSectionProps {
  discussion: Discussion;
  online: boolean;
  canWrite: boolean;
  /** On a direct item after unfriending, in place of the composer. */
  noLongerFriendsNote: string | null;
}

/** "Discussion": the composer and the post comments, each with its thread (§5.1). */
export function DiscussionSection({
  discussion,
  online,
  canWrite,
  noLongerFriendsNote,
}: DiscussionSectionProps) {
  const { state, postComments } = discussion;

  return (
    <section aria-label="Discussion" className="mt-8 flex flex-col gap-4">
      <h2 className="font-display text-xl font-medium">Discussion</h2>
      {canWrite ? (
        <CommentComposer
          online={online}
          label="Add a comment"
          onSubmit={(body) => discussion.send({ body })}
        />
      ) : (
        noLongerFriendsNote && <p className="text-sm text-muted">{noLongerFriendsNote}</p>
      )}

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading the discussion" className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {state.status === 'error' && (
        <LoadError message={DISCUSSION_COPY.loadFailed} onRetry={state.reload} />
      )}
      {state.status === 'ready' && postComments.length === 0 && (
        <p className="text-sm text-muted">{DISCUSSION_COPY.empty}</p>
      )}
      {postComments.length > 0 && (
        <ul className="flex flex-col gap-3">
          {postComments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
            >
              <CommentItem
                comment={comment}
                openerAuthorId={null}
                online={online}
                canWrite={canWrite}
                discussion={discussion}
              />
              <Thread
                opener={{ kind: 'comment', commentId: comment.id }}
                openerAuthor={comment.author}
                online={online}
                canWrite={canWrite && !comment.deleted}
                discussion={discussion}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
