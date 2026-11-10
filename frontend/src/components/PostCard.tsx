import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useRetryConversion } from '../hooks/useRetryConversion';
import { displayTitle, kindLabel, mainLink, pendingTitle, relativeTime } from '../lib/postLinks';
import { CONVERTING_COPY } from '../lib/postText';
import { commentCountLine, ratingSummaryLine } from '../lib/ratingCopy';
import { noLongerFriends } from '../lib/recommendationCopy';
import { useMixtape } from '../stores/design';
import { BookmarkButton } from './BookmarkButton';
import { EditCommentSheet } from './EditCommentSheet';
import { PersonLink } from './PersonLink';
import { MixtapePostCard } from './PostCardMixtape';
import {
  DeletePostSheet,
  linkButton,
  OtherServicesSheet,
  type PostCardProps,
} from './postCardParts';
import { Button } from './ui/Button';
import { CoverArt } from './ui/CoverArt';

export type { PostCardProps } from './postCardParts';

/** Picks the card for the device's design (ui-redesign.md §4). */
export function PostCard(props: PostCardProps) {
  const mixtape = useMixtape();
  return mixtape ? <MixtapePostCard {...props} /> : <CurrentPostCard {...props} />;
}

/**
 * One recommendation in the feed — docs/features/posts-feed.md §5.3. The main
 * button opens the viewer's own service; a pending post links to the original
 * and its author can try the conversion again. Its author and the
 * community's admins can delete it from the ⋯ menu (posts-delete.md §5).
 * Anyone else can save it to Listen Later (bookmarks-my-list.md §5.1) until
 * they rate it; then it shows their score (rate-post.md §5.3). The average and
 * View ratings lead to Post Detail (post-detail.md §5.1). A direct recommendation
 * names the other person instead, and its recipient can rate or hide it on
 * Received (direct-recommendations.md §5.2).
 */
function CurrentPostCard({
  post,
  viewerService,
  online,
  onUpdated,
  onStale,
  onDeleted,
  onBookmarkChanged,
  linkToDetail = true,
  onRate,
  onHide,
}: PostCardProps) {
  const [showingLinks, setShowingLinks] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const { retrying, retryMessage, retry } = useRetryConversion(post, onUpdated, onStale);
  const main = mainLink(post, viewerService);
  const detailPath = `/posts/${post.id}`;
  const summary =
    [ratingSummaryLine(post.ratingSummary), commentCountLine(post.commentCount)]
      .filter(Boolean)
      .join(' · ') || null;
  // The author edits their comment; a direct item only while still friends (edit-post-comment.md §5.1).
  const canEdit = post.isMine && (!post.direct || post.direct.isFriend);
  const hasMenu = canEdit || post.canDelete || onHide !== undefined;
  const person = post.direct && post.isMine ? post.direct.recipient : post.author;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-center gap-3">
        {post.direct && <span className="text-xs text-muted">{post.isMine ? 'To' : 'From'}</span>}
        <PersonLink
          user={person}
          label={post.isMine && !post.direct ? 'You' : person.displayName}
          className="text-sm font-medium"
        />
        <time dateTime={post.createdAt} className="text-xs text-muted">
          {relativeTime(post.createdAt)}
        </time>
        {post.commentEditedAt && (
          <span
            title={`Edited ${new Date(post.commentEditedAt).toLocaleString('en')}`}
            className="-ml-2 text-xs text-muted"
          >
            · edited
          </span>
        )}
        {post.myScore !== null ? (
          <p className="text-xs text-muted">You rated {post.myScore}/10</p>
        ) : (
          !post.isMine && (
            <BookmarkButton
              post={post}
              online={online}
              onChanged={onBookmarkChanged}
              onStale={onStale}
            />
          )
        )}
        {hasMenu && (
          <button
            type="button"
            aria-label="Post options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ⋯
            </span>
          </button>
        )}
      </header>
      {menuOpen && hasMenu && (
        <div className="flex justify-end gap-3">
          {onHide && (
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => {
                setMenuOpen(false);
                onHide(post);
              }}
            >
              Hide
            </Button>
          )}
          {canEdit && (
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            >
              Edit comment
            </Button>
          )}
          {post.canDelete && (
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => {
                setMenuOpen(false);
                setDeleting(true);
              }}
            >
              Delete post
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-4">
        <CoverArt url={post.coverArtUrl} />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          {post.conversionPending ? (
            <>
              <p className="font-medium">{pendingTitle(post)}</p>
              <p className="text-xs text-muted">Other services unavailable</p>
            </>
          ) : (
            <>
              <p className="break-words font-medium">
                {linkToDetail ? (
                  <Link to={detailPath}>{displayTitle(post)}</Link>
                ) : (
                  displayTitle(post)
                )}
              </p>
              {post.artist && <p className="break-words text-sm text-muted">{post.artist}</p>}
              {kindLabel(post.kind) && (
                <p className="w-fit rounded-full border border-line px-2 text-xs text-muted">
                  {kindLabel(post.kind)}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {post.comment && <p className="whitespace-pre-line break-words text-sm">{post.comment}</p>}

      {(summary || linkToDetail) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">{summary}</span>
          {linkToDetail && (
            <Link to={detailPath} className="flex min-h-11 items-center font-medium text-accent">
              View ratings
            </Link>
          )}
        </div>
      )}

      {onRate &&
        !post.isMine &&
        post.myScore === null &&
        (post.direct?.isFriend ? (
          <Button
            disabled={!online}
            onClick={() => onRate(post)}
            aria-label={`Rate & Review ${post.title ?? 'this song'}`}
          >
            Rate &amp; Review
          </Button>
        ) : (
          <p className="text-xs text-muted">{noLongerFriends(post.author.displayName)}</p>
        ))}

      <div className="flex flex-wrap gap-3">
        <a
          href={main.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkButton} bg-accent text-on-accent`}
        >
          {main.text}
        </a>
        {!post.conversionPending && !post.platform && (
          <Button variant="secondary" onClick={() => setShowingLinks(true)}>
            Other services
          </Button>
        )}
        {post.conversionPending && post.isMine && (
          <Button variant="secondary" busy={retrying} disabled={!online} onClick={retry}>
            {retrying ? CONVERTING_COPY : 'Find on other services'}
          </Button>
        )}
      </div>
      {retryMessage && (
        <p role="status" className="text-xs text-muted">
          {retryMessage}
        </p>
      )}

      {editing && (
        <EditCommentSheet
          post={post}
          online={online}
          onClose={() => setEditing(false)}
          onSaved={onUpdated}
          onStale={onStale}
        />
      )}

      {deleting && (
        <DeletePostSheet
          post={post}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
          onStale={onStale}
        />
      )}

      {showingLinks && <OtherServicesSheet post={post} onClose={() => setShowingLinks(false)} />}
    </article>
  );
}
