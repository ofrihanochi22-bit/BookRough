import type { PublicPost } from '../api/posts';
import type { StreamingService } from '../stores/auth';
import { STREAMING_SERVICES, streamingServiceLabel } from './streamingServices';

export interface PostLink {
  service: StreamingService;
  url: string;
  label: string;
}

/**
 * The card's main button (docs/features/posts-feed.md §5.3): the viewer's own
 * service when a link was found for it, otherwise the link that was pasted.
 */
export function mainLink(post: PublicPost, viewerService: StreamingService | null): PostLink {
  const own = viewerService ? post.links[viewerService] : undefined;
  if (viewerService && own) {
    return { service: viewerService, url: own, label: streamingServiceLabel(viewerService) };
  }
  return {
    service: post.sourceService,
    url: post.originalUrl,
    label: streamingServiceLabel(post.sourceService),
  };
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
