import { Link } from 'react-router-dom';

import type { SavedPost } from '../api/bookmarks';
import { mainLink, relativeTime } from '../lib/postLinks';
import { streamingServiceLabel } from '../lib/streamingServices';
import type { StreamingService } from '../stores/auth';
import { Button } from './ui/Button';
import { CoverArt } from './ui/CoverArt';

interface SavedPostCardProps {
  saved: SavedPost;
  viewerService: StreamingService | null;
  online: boolean;
  onRemove: (postId: string) => void;
  /** Opens the rating sheet; members only (rate-post.md §5.1). */
  onRate: (saved: SavedPost) => void;
}

/**
 * One song on My List — docs/features/bookmarks-my-list.md §5.2. Opens in the
 * viewer's own service, like the feed; the community links to its page only
 * while the viewer is still a member, and only a member can rate it
 * (rate-post.md §5.1).
 */
export function SavedPostCard({
  saved,
  viewerService,
  online,
  onRemove,
  onRate,
}: SavedPostCardProps) {
  const { post, community } = saved;
  const main = mainLink(post, viewerService);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex gap-4">
        <CoverArt url={post.coverArtUrl} />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          {post.conversionPending ? (
            <p className="font-medium">Shared from {streamingServiceLabel(post.sourceService)}</p>
          ) : (
            <>
              <p className="break-words font-medium">{post.title}</p>
              {post.artist && <p className="break-words text-sm text-muted">{post.artist}</p>}
              {post.kind === 'ALBUM' && (
                <p className="w-fit rounded-full border border-line px-2 text-xs text-muted">
                  Album
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        Shared by {post.author.displayName} in{' '}
        {saved.isMember ? (
          <Link to={`/communities/${community.id}`} className="font-medium underline">
            {community.name}
          </Link>
        ) : (
          <span className="font-medium">{community.name}</span>
        )}{' '}
        · Saved <time dateTime={saved.savedAt}>{relativeTime(saved.savedAt)}</time>
      </p>

      {saved.isMember ? (
        <Button
          disabled={!online}
          onClick={() => onRate(saved)}
          aria-label={`Rate & Review ${post.title ?? 'this song'}`}
        >
          Rate &amp; Review
        </Button>
      ) : (
        <p className="text-xs text-muted">You&apos;re no longer in {community.name}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href={main.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-6 py-2.5 text-sm font-medium"
        >
          Open in {main.label}
        </a>
        <Button variant="secondary" disabled={!online} onClick={() => onRemove(post.id)}>
          Remove
        </Button>
      </div>
    </article>
  );
}
