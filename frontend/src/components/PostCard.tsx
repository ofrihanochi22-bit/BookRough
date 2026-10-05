import { useState } from 'react';
import { isAxiosError } from 'axios';

import { type PublicPost, retryConversion } from '../api/posts';
import { allLinks, mainLink, relativeTime } from '../lib/postLinks';
import { CONVERTING_COPY } from '../lib/postText';
import { streamingServiceLabel } from '../lib/streamingServices';
import type { StreamingService } from '../stores/auth';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

interface PostCardProps {
  post: PublicPost;
  viewerService: StreamingService | null;
  online: boolean;
  /** A retried post comes back converted (or still pending). */
  onUpdated: (post: PublicPost) => void;
  /** The post changed elsewhere (409) or is gone for the caller (404): reload the feed. */
  onStale: () => void;
}

const linkButton =
  'inline-flex min-h-11 items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium';

/** A neutral square while there is no cover, or the cover fails to load. */
function CoverArt({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div
        aria-hidden="true"
        className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-line text-2xl text-muted"
      >
        ♪
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={80}
      height={80}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-20 shrink-0 rounded-xl object-cover"
    />
  );
}

/**
 * One recommendation in the feed — docs/features/posts-feed.md §5.3. The main
 * button opens the viewer's own service; a pending post links to the original
 * and its author can try the conversion again.
 */
export function PostCard({ post, viewerService, online, onUpdated, onStale }: PostCardProps) {
  const [showingLinks, setShowingLinks] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const main = mainLink(post, viewerService);

  async function retry() {
    setRetrying(true);
    setRetryMessage(null);
    try {
      const updated = await retryConversion(post.id);
      if (updated.conversionPending) {
        setRetryMessage('Still unavailable. Try again later.');
      }
      onUpdated(updated);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      if (status === 404 || status === 409) {
        onStale();
      } else {
        setRetryMessage("Couldn't try again. Check your connection.");
      }
    } finally {
      setRetrying(false);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-center gap-3">
        <Avatar
          id={post.author.id}
          name={post.author.displayName}
          pictureUrl={post.author.profilePictureUrl}
          size={32}
          decorative
        />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {post.isMine ? 'You' : post.author.displayName}
        </p>
        <time dateTime={post.createdAt} className="text-xs text-muted">
          {relativeTime(post.createdAt)}
        </time>
      </header>

      <div className="flex gap-4">
        <CoverArt url={post.coverArtUrl} />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          {post.conversionPending ? (
            <>
              <p className="font-medium">Shared from {streamingServiceLabel(post.sourceService)}</p>
              <p className="text-xs text-muted">Other services unavailable</p>
            </>
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

      {post.comment && <p className="whitespace-pre-line break-words text-sm">{post.comment}</p>}

      <div className="flex flex-wrap gap-3">
        <a
          href={main.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkButton} bg-accent text-on-accent`}
        >
          Open in {main.label}
        </a>
        {!post.conversionPending && (
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

      {showingLinks && (
        <Sheet title="Other services" onClose={() => setShowingLinks(false)}>
          <ul className="flex flex-col gap-2">
            {allLinks(post).map((link) => (
              <li key={link.service}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkButton} w-full border border-line`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </article>
  );
}
