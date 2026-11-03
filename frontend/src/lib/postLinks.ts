import type { LinkPlatform, PostKind, PublicPost } from '../api/posts';
import type { StreamingService } from '../stores/auth';
import { STREAMING_SERVICES, streamingServiceLabel } from './streamingServices';

export interface PostLink {
  service: StreamingService;
  url: string;
  label: string;
}

/** The card's main button: where it goes and what it says. */
export interface MainLink {
  url: string;
  text: string;
}

const PLATFORMS: Readonly<Record<LinkPlatform, { label: string; verb: string }>> = {
  BANDCAMP: { label: 'Bandcamp', verb: 'Listen on' },
  SOUNDCLOUD: { label: 'SoundCloud', verb: 'Listen on' },
  YOUTUBE: { label: 'YouTube', verb: 'Watch on' },
};

export function platformLabel(platform: LinkPlatform): string {
  return PLATFORMS[platform].label;
}

/**
 * The card's main button (docs/features/posts-feed.md §5.3): the viewer's own
 * service when a link was found for it, otherwise the link that was pasted. A
 * link-only post always opens on its platform (link-only-posts.md §5.2).
 */
export function mainLink(
  post: Pick<PublicPost, 'platform' | 'sourceService' | 'originalUrl' | 'links'>,
  viewerService: StreamingService | null,
): MainLink {
  if (post.platform) {
    const { verb, label } = PLATFORMS[post.platform];
    return { url: post.originalUrl, text: `${verb} ${label}` };
  }
  const own = viewerService ? post.links[viewerService] : undefined;
  if (viewerService && own) {
    return { url: own, text: `Open in ${streamingServiceLabel(viewerService)}` };
  }
  return {
    url: post.originalUrl,
    text: post.sourceService ? `Open in ${streamingServiceLabel(post.sourceService)}` : 'Open',
  };
}

type Titled = Pick<PublicPost, 'title' | 'platform' | 'sourceService'>;

/** A converted post's title, or a link-only post's platform when no title was found. */
export function displayTitle(post: Titled): string {
  return post.title ?? (post.platform ? platformLabel(post.platform) : '');
}

/** The title line of a pending post (posts-feed.md §5.3). */
export function pendingTitle(post: Titled): string {
  return post.sourceService ? `Shared from ${streamingServiceLabel(post.sourceService)}` : '';
}

const KIND_LABELS: Partial<Record<PostKind, string>> = {
  ALBUM: 'Album',
  SET: 'Set',
  VIDEO: 'Video',
};

/** The small label under the artist; none for a track. */
export function kindLabel(kind: PostKind | null): string | null {
  return kind ? (KIND_LABELS[kind] ?? null) : null;
}

/** Every found link, in the order the onboarding picker lists the services. */
export function allLinks(post: PublicPost): PostLink[] {
  return STREAMING_SERVICES.flatMap(({ value, label }) => {
    const url = post.links[value];
    return url ? [{ service: value, url, label }] : [];
  });
}

/** "now", "5m", "3h", "2d", then a short date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) {
    return 'now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}
