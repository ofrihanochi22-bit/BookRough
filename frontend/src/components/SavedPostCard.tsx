import { Link } from 'react-router-dom';

import type { SavedPost } from '../api/bookmarks';
import { displayTitle, kindLabel, mainLink, pendingTitle, relativeTime } from '../lib/postLinks';
import { noLongerFriends } from '../lib/recommendationCopy';
import type { StreamingService } from '../stores/auth';
import { Button } from './ui/Button';
import { KIND_TAG, OPEN_IN_PILL } from './ui/chip';
import { CoverArt } from './ui/CoverArt';

interface SavedPostCardProps {
  saved: SavedPost;
  viewerService: StreamingService | null;
  online: boolean;
  onRemove: (postId: string) => void;
  /** Opens the rating sheet; members only (rate-post.md §5.1). */
  onRate: (saved: SavedPost) => void;
}

export function canRateSaved(saved: SavedPost): boolean {
  return saved.isMember || saved.post.direct?.isFriend === true;
}

/** "Shared by … in … · Saved …" or "Sent by … · Saved …". */
function SourceLine({ saved }: { saved: SavedPost }) {
  const { post, community } = saved;
  return (
    <p className="text-xs text-muted">
      {community ? (
        <>
          Shared by {post.author.displayName} in{' '}
          {saved.isMember ? (
            <Link to={`/communities/${community.id}`} className="font-medium underline">
              {community.name}
            </Link>
          ) : (
            <span className="font-medium">{community.name}</span>
          )}
        </>
      ) : (
        <>Sent by {post.author.displayName}</>
      )}{' '}
      · Saved <time dateTime={saved.savedAt}>{relativeTime(saved.savedAt)}</time>
    </p>
  );
}

/** Why there is no Rate & Review: the community was left, or the friendship ended. */
function CannotRateLine({ saved }: { saved: SavedPost }) {
  return (
    <p className="text-xs text-muted">
      {saved.community ? (
        <>You&apos;re no longer in {saved.community.name}</>
      ) : (
        noLongerFriends(saved.post.author.displayName)
      )}
    </p>
  );
}

/**
 * One song on My List — docs/features/bookmarks-my-list.md §5.2. Opens in the
 * viewer's own service, like the feed; the community links to its page only
 * while the viewer is still a member, and only a member can rate it
 * (rate-post.md §5.1). A direct recommendation names its sender instead, and can
 * be rated while the two are friends (direct-recommendations.md §5.5).
 *
 * The post card's shape (ui-redesign.md §5.9) —
 * a 116px side thumbnail, title, artist and kind tag — with Rate & Review as
 * the sticker pill, "Open in …" as the accent pill and Remove as a chip.
 */
export function SavedPostCard({
  saved,
  viewerService,
  online,
  onRemove,
  onRate,
}: SavedPostCardProps) {
  const { post } = saved;
  const main = mainLink(post, viewerService);
  const kind = kindLabel(post.kind);

  return (
    <article className="flex flex-col gap-4 rounded-[22px] bg-surface p-4">
      <div className="flex gap-4">
        <CoverArt url={post.coverArtUrl} size={116} />
        <div className="flex min-w-0 flex-col justify-center gap-1.5">
          {post.conversionPending ? (
            <p className="font-display text-lg leading-tight font-bold break-words">
              {pendingTitle(post)}
            </p>
          ) : (
            <>
              <p className="font-display text-lg leading-tight font-bold break-words">
                {displayTitle(post)}
              </p>
              {post.artist && <p className="text-sm break-words text-muted">{post.artist}</p>}
              {kind && <p className={KIND_TAG}>{kind}</p>}
            </>
          )}
        </div>
      </div>

      <SourceLine saved={saved} />

      {canRateSaved(saved) ? (
        <Button
          variant="rating"
          offline={!online}
          onClick={() => onRate(saved)}
          aria-label={`Rate & Review ${post.title ?? 'this song'}`}
        >
          Rate &amp; Review
        </Button>
      ) : (
        <CannotRateLine saved={saved} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a href={main.url} target="_blank" rel="noopener noreferrer" className={OPEN_IN_PILL}>
          {main.text}
        </a>
        <Button
          variant="secondary"
          offline={!online}
          onClick={() => onRemove(post.id)}
          className="px-4"
        >
          Remove
        </Button>
      </div>
    </article>
  );
}
