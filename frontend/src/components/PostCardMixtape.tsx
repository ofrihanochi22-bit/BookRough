import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { PublicPost } from '../api/posts';
import { useRetryConversion } from '../hooks/useRetryConversion';
import { badgeText } from '../lib/friendCopy';
import { displayTitle, kindLabel, mainLink, pendingTitle, relativeTime } from '../lib/postLinks';
import { CONVERTING_COPY } from '../lib/postText';
import { commentCountLine, ratingSummaryLine } from '../lib/ratingCopy';
import { noLongerFriends } from '../lib/recommendationCopy';
import { BookmarkButton } from './BookmarkButton';
import { EditCommentSheet } from './EditCommentSheet';
import { PersonLink } from './PersonLink';
import { DeletePostSheet, OtherServicesSheet, type PostCardProps } from './postCardParts';
import { ActionSheet, type SheetAction } from './ui/ActionSheet';
import { Button } from './ui/Button';
import { ReelCassette } from './ui/Cassette';
import { CHIP } from './ui/chip';
import { CoverArt } from './ui/CoverArt';
import { LineIcon } from './ui/LineIcon';
import { TAPE_PAPER } from './ui/tape';

/**
 * The rating sticker on the cover (ui-redesign.md §3.6): the group average
 * large, the number of ratings small. Absent until someone rates. Leads to
 * Post Detail, as "View ratings" did.
 */
function RatingSticker({
  post,
  to,
  large,
}: {
  post: PublicPost;
  to: string | null;
  /** Post Detail's large sticker (§5.3). */
  large: boolean;
}) {
  const line = ratingSummaryLine(post.ratingSummary);
  if (line === null) {
    return null;
  }
  const disc = (
    <>
      <span
        className={`font-display leading-none font-extrabold ${large ? 'text-3xl' : 'text-lg'}`}
      >
        {post.ratingSummary.average}
      </span>
      <span
        className={`flex items-center gap-0.5 leading-none font-semibold ${large ? 'text-xs' : 'text-[10px]'}`}
      >
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-2.5" fill="currentColor">
          <circle cx="6" cy="3.5" r="2.5" />
          <path d="M1 11.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4z" />
        </svg>
        {badgeText(post.ratingSummary.count)}
      </span>
    </>
  );
  const className = `absolute -top-2 -right-2 flex rotate-6 flex-col items-center justify-center gap-0.5 rounded-full bg-sticker text-sticker-ink shadow-[0_2px_6px_rgb(0_0_0/0.25)] ${
    large ? 'size-20' : 'size-14'
  }`;
  return to ? (
    <Link to={to} aria-label={line} data-testid="rating-sticker" className={className}>
      {disc}
    </Link>
  ) : (
    <span role="img" aria-label={line} data-testid="rating-sticker" className={className}>
      {disc}
    </span>
  );
}

/**
 * The cover slot: album art, or a `tape` square with two reels while
 * conversion is pending. A 116px thumbnail on the card; the card's full width
 * on Post Detail (§5.3).
 */
function Cover({
  post,
  retrying,
  detailPath,
  large,
}: {
  post: PublicPost;
  retrying: boolean;
  detailPath: string | null;
  large: boolean;
}) {
  return (
    <div className={`relative shrink-0 ${large ? 'w-full' : ''}`}>
      {post.conversionPending ? (
        <div
          data-testid="pending-cover"
          className={`flex items-center justify-center ${
            large ? 'aspect-square w-full rounded-2xl' : 'size-[116px] rounded-xl'
          } ${TAPE_PAPER}`}
        >
          <ReelCassette spinning={retrying} className={large ? 'w-40' : 'w-20'} />
        </div>
      ) : (
        <CoverArt url={post.coverArtUrl} size={large ? 'full' : 116} />
      )}
      <RatingSticker post={post} to={detailPath} large={large} />
      {post.myScore !== null && (
        <span className="absolute -bottom-1.5 -left-1.5 rounded-md bg-tape-ink px-1.5 py-0.5 text-xs font-bold text-tape shadow-[0_1px_3px_rgb(0_0_0/0.25)]">
          You: {post.myScore}
        </span>
      )}
    </div>
  );
}

/**
 * The ⋯ menu as a bottom action sheet (ui-redesign.md §5.0): one row per
 * permitted action, Delete in danger, and a Cancel pill.
 */
function PostActionsSheet({
  online,
  onClose,
  onHide,
  onEdit,
  onDelete,
}: {
  online: boolean;
  onClose: () => void;
  onHide?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const actions: SheetAction[] = [];
  if (onHide) {
    actions.push({
      label: 'Hide',
      disabled: !online,
      onSelect: onHide,
      icon: (
        <LineIcon>
          <path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 4.5 10 6-.4.7-1.4 2-2.8 3.3M6.5 7.6C4.6 8.9 3.4 10.6 2 12c1 1.5 5 6 10 6 1.6 0 3-.4 4.3-1" />
        </LineIcon>
      ),
    });
  }
  if (onEdit) {
    actions.push({
      label: 'Edit comment',
      disabled: !online,
      onSelect: onEdit,
      icon: (
        <LineIcon>
          <path d="M4 20h4L19 9l-4-4L4 16z" />
          <path d="M13.5 6.5l4 4" />
        </LineIcon>
      ),
    });
  }
  if (onDelete) {
    actions.push({
      label: 'Delete post',
      danger: true,
      disabled: !online,
      onSelect: onDelete,
      icon: (
        <LineIcon>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </LineIcon>
      ),
    });
  }
  return <ActionSheet title="Post options" actions={actions} onClose={onClose} />;
}

/**
 * The Mixtape post card — docs/features/ui-redesign.md §5.0. Same data, same
 * actions and copy as the Current card: a 116px cover with the rating sticker
 * and a "You: N" tag, the comment on `tape` paper, one accent "Open in …" pill
 * and quiet chips. The ⋯ menu is a bottom action sheet.
 */
export function MixtapePostCard({
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
  const detailPath = linkToDetail ? `/posts/${post.id}` : null;
  // Post Detail shows the card in its detail mode (§5.3): full-width cover, large sticker.
  const large = !linkToDetail;
  const titleSize = large ? 'text-2xl' : 'text-lg';
  // On Post Detail the song's title is the page's h1; on a card it is text.
  const Title = large ? 'h1' : 'p';
  // The author edits their comment; a direct item only while still friends (edit-post-comment.md §5.1).
  const canEdit = post.isMine && (!post.direct || post.direct.isFriend);
  const hasMenu = canEdit || post.canDelete || onHide !== undefined;
  const person = post.direct && post.isMine ? post.direct.recipient : post.author;
  const kind = kindLabel(post.kind);

  /** Closes the action sheet, then opens what the row leads to. */
  function fromMenu(open: () => void) {
    return () => {
      setMenuOpen(false);
      open();
    };
  }

  return (
    <article className="flex flex-col gap-4 rounded-[22px] bg-surface p-4">
      <header className="flex items-center gap-2">
        {post.direct && <span className="text-xs text-muted">{post.isMine ? 'To' : 'From'}</span>}
        <PersonLink
          user={person}
          label={post.isMine && !post.direct ? 'You' : person.displayName}
          className="min-w-0 text-sm font-semibold"
        />
        <time dateTime={post.createdAt} className="shrink-0 text-xs text-muted">
          {relativeTime(post.createdAt)}
        </time>
        {post.commentEditedAt && (
          <span
            title={`Edited ${new Date(post.commentEditedAt).toLocaleString('en')}`}
            className="shrink-0 text-xs text-muted"
          >
            · edited
          </span>
        )}
        <span className="ml-auto flex items-center">
          {post.myScore === null && !post.isMine && (
            <BookmarkButton
              post={post}
              online={online}
              onChanged={onBookmarkChanged}
              onStale={onStale}
            />
          )}
          {hasMenu && (
            <button
              type="button"
              aria-label="Post options"
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
              className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ⋯
              </span>
            </button>
          )}
        </span>
      </header>

      <div className={large ? 'flex flex-col gap-4' : 'flex gap-4'}>
        <Cover post={post} retrying={retrying} detailPath={detailPath} large={large} />
        <div className="flex min-w-0 flex-col justify-center gap-1.5">
          {post.conversionPending ? (
            <>
              <Title className={`font-display leading-tight font-bold break-words ${titleSize}`}>
                {pendingTitle(post)}
              </Title>
              <p className="text-xs text-muted">Other services unavailable</p>
            </>
          ) : (
            <>
              <Title className={`font-display leading-tight font-bold break-words ${titleSize}`}>
                {detailPath ? (
                  <Link to={detailPath}>{displayTitle(post)}</Link>
                ) : (
                  displayTitle(post)
                )}
              </Title>
              {post.artist && <p className="text-sm break-words text-muted">{post.artist}</p>}
              {kind && (
                <p className="w-fit rounded-sm border border-line px-1.5 text-xs text-muted">
                  {kind}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {post.comment && (
        <p
          className={`rounded-[10px] px-3.5 py-2.5 text-sm whitespace-pre-line break-words ${TAPE_PAPER}`}
        >
          {post.comment}
        </p>
      )}

      {onRate &&
        !post.isMine &&
        post.myScore === null &&
        (post.direct?.isFriend ? (
          <Button
            variant="rating"
            offline={!online}
            onClick={() => onRate(post)}
            aria-label={`Rate & Review ${post.title ?? 'this song'}`}
          >
            Rate &amp; Review
          </Button>
        ) : (
          <p className="text-xs text-muted">{noLongerFriends(post.author.displayName)}</p>
        ))}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={main.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {main.text}
        </a>
        {!post.conversionPending && !post.platform && (
          <button type="button" className={CHIP} onClick={() => setShowingLinks(true)}>
            Other services
          </button>
        )}
        {post.conversionPending && post.isMine && (
          <button
            type="button"
            className={`${CHIP} ${online ? '' : 'border-dashed text-muted'}`}
            disabled={!online || retrying}
            aria-busy={retrying || undefined}
            onClick={retry}
          >
            {retrying ? CONVERTING_COPY : 'Find on other services'}
          </button>
        )}
        {detailPath && (
          <Link to={detailPath} className={CHIP}>
            <LineIcon>
              <path d="M4 5h16v11H9l-5 4z" />
            </LineIcon>
            {commentCountLine(post.commentCount) ?? 'Comments'}
          </Link>
        )}
      </div>
      {retryMessage && (
        <p role="status" className="text-xs text-muted">
          {retryMessage}
        </p>
      )}

      {menuOpen && (
        <PostActionsSheet
          online={online}
          onClose={() => setMenuOpen(false)}
          onHide={onHide && fromMenu(() => onHide(post))}
          onEdit={canEdit ? fromMenu(() => setEditing(true)) : undefined}
          onDelete={post.canDelete ? fromMenu(() => setDeleting(true)) : undefined}
        />
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
