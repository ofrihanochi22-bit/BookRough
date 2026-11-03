/**
 * Which pasted links can become a post — docs/features/posts-feed.md §4.1 and
 * docs/features/link-only-posts.md §4.1.
 *
 * A deliberate mirror of backend/src/services/supportedLinks.ts, for an instant
 * inline error and the composer's busy copy; the server stays authoritative
 * (it alone resolves short links). Change both together.
 */

import type { LinkPlatform, PostKind } from '../api/posts';
import type { StreamingService } from '../stores/auth';

export const MAX_URL_LENGTH = 2048;

export const INVALID_LINK =
  "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service.";

/** Exact hosts per service. Also used to map the links squigly returns. */
export const SERVICE_HOSTS: Readonly<Record<StreamingService, readonly string[]>> = {
  SPOTIFY: ['open.spotify.com'],
  APPLE_MUSIC: ['music.apple.com'],
  YOUTUBE: ['music.youtube.com', 'www.youtube.com', 'youtube.com', 'youtu.be'],
  TIDAL: ['tidal.com', 'listen.tidal.com'],
  DEEZER: ['www.deezer.com', 'deezer.com', 'link.deezer.com'],
};

export function serviceForHost(host: string): StreamingService | null {
  for (const [service, hosts] of Object.entries(SERVICE_HOSTS)) {
    if (hosts.includes(host)) {
      return service as StreamingService;
    }
  }
  return null;
}

export interface SupportedLink {
  /** As pasted, trimmed — stored and used as the fallback link. */
  url: string;
  service: StreamingService;
  /** Null when the shape does not tell (a Deezer short link). */
  kind: PostKind | null;
}

const SPOTIFY_PATH = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album)\/[A-Za-z0-9]{22}\/?$/;
const APPLE_PATH = /^\/[a-z]{2}\/(song|album)\/(?:[^/]+\/)?\d+\/?$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_ALBUM_LIST = /^OLAK5uy_[A-Za-z0-9_-]+$/;
const YOUTUBE_ALBUM_BROWSE = /^\/browse\/MPREb[A-Za-z0-9_-]+\/?$/;
const TIDAL_PATH = /^(?:\/browse)?\/(track|album)\/\d+(?:\/u)?\/?$/;
const DEEZER_PATH = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(track|album)\/\d+\/?$/;
const DEEZER_SHORT_PATH = /^\/s\/[A-Za-z0-9]+\/?$/;

function kindOf(segment: string): PostKind {
  return segment === 'album' ? 'ALBUM' : 'TRACK';
}

/** The kind a path shape implies, `null` for "unknown", or `undefined` for "not accepted". */
function shapeKind(service: StreamingService, url: URL): PostKind | null | undefined {
  const path = url.pathname;
  switch (service) {
    case 'SPOTIFY': {
      const match = SPOTIFY_PATH.exec(path);
      return match ? kindOf(match[1]!) : undefined;
    }
    case 'APPLE_MUSIC': {
      const match = APPLE_PATH.exec(path);
      if (!match) {
        return undefined;
      }
      // An album link with ?i=<track id> points at one song on it.
      const trackId = url.searchParams.get('i');
      return match[1] === 'album' && !(trackId && /^\d+$/.test(trackId)) ? 'ALBUM' : 'TRACK';
    }
    case 'YOUTUBE':
      return youtubeKind(url);
    case 'TIDAL': {
      const match = TIDAL_PATH.exec(path);
      return match ? kindOf(match[1]!) : undefined;
    }
    case 'DEEZER': {
      if (url.hostname === 'link.deezer.com') {
        return DEEZER_SHORT_PATH.test(path) ? null : undefined;
      }
      const match = DEEZER_PATH.exec(path);
      return match ? kindOf(match[1]!) : undefined;
    }
  }
}

function youtubeKind(url: URL): PostKind | undefined {
  if (youtubeVideoId(url)) {
    return 'TRACK';
  }
  if (url.hostname !== 'music.youtube.com') {
    return undefined;
  }
  if (url.pathname === '/playlist') {
    return YOUTUBE_ALBUM_LIST.test(url.searchParams.get('list') ?? '') ? 'ALBUM' : undefined;
  }
  return YOUTUBE_ALBUM_BROWSE.test(url.pathname) ? 'ALBUM' : undefined;
}

const YOUTUBE_LIVE_PATH = /^\/live\/([A-Za-z0-9_-]{11})\/?$/;

/**
 * The video id of a YouTube video link (`watch?v=`, `youtu.be/`, `/live/`),
 * or null for anything else, a YouTube Music album included.
 */
function youtubeVideoId(url: URL): string | null {
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1).replace(/\/$/, '');
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (!SERVICE_HOSTS.YOUTUBE.includes(url.hostname)) {
    return null;
  }
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? '';
    return YOUTUBE_ID.test(id) ? id : null;
  }
  // Live streams and their recordings; never on music.youtube.com.
  const live = url.hostname === 'music.youtube.com' ? null : YOUTUBE_LIVE_PATH.exec(url.pathname);
  return live ? live[1]! : null;
}

/** Trimmed, length-checked, https, no userinfo or port — otherwise null. */
function parseHttpsUrl(raw: string): { trimmed: string; url: URL } | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return null;
  }
  return { trimmed, url };
}

/** The pasted link if it can become a converted post, otherwise null. */
export function parseSupportedLink(raw: string): SupportedLink | null {
  const parsed = parseHttpsUrl(raw);
  if (!parsed) {
    return null;
  }
  const { trimmed, url } = parsed;

  const service = serviceForHost(url.hostname);
  if (!service) {
    return null;
  }
  const kind = shapeKind(service, url);
  if (kind === undefined) {
    return null;
  }
  return { url: trimmed, service, kind };
}

// Link-only platforms — docs/features/link-only-posts.md §4.1. Never converted.

export interface PlatformLink {
  /** As pasted, trimmed — or, once a short link is resolved, the resolved link. */
  url: string;
  /** YouTube links are never parsed as link-only; only squigly's answer makes one (§4.2). */
  platform: Exclude<LinkPlatform, 'YOUTUBE'>;
  /** Null only for a SoundCloud short link, until it is resolved. */
  kind: PostKind | null;
  /** An `on.soundcloud.com` short link: resolved before anything else (§4.4). */
  needsResolve: boolean;
}

/** One label under bandcamp.com; the bare, www and editorial hosts are not artists. */
const BANDCAMP_HOST = /^([a-z0-9-]+)\.bandcamp\.com$/;
const BANDCAMP_NOT_ARTISTS = new Set(['www', 'daily']);
const BANDCAMP_PATH = /^\/(track|album)\/[a-z0-9-]+\/?$/i;

const SOUNDCLOUD_HOSTS: readonly string[] = [
  'soundcloud.com',
  'www.soundcloud.com',
  'm.soundcloud.com',
];
const SOUNDCLOUD_SHORT_HOST = 'on.soundcloud.com';
const SOUNDCLOUD_SHORT_PATH = /^\/[A-Za-z0-9]+\/?$/;
const SOUNDCLOUD_SEGMENT = /^[A-Za-z0-9_-]+$/;
const SOUNDCLOUD_SECRET = /^s-[A-Za-z0-9]+$/;
/** First path segments that are SoundCloud's own pages, not users. */
const SOUNDCLOUD_RESERVED_USERS = new Set([
  'discover',
  'search',
  'stream',
  'upload',
  'you',
  'charts',
  'stations',
  'pages',
  'settings',
  'messages',
  'notifications',
  'mobile',
  'terms-of-use',
  'jobs',
  'imprint',
  'pro',
  'popular',
  'tags',
  'people',
  'groups',
  'feed',
  'signin',
  'logout',
]);
/** Second path segments that are a user's tabs, not tracks. */
const SOUNDCLOUD_RESERVED_TRACKS = new Set([
  'tracks',
  'albums',
  'sets',
  'likes',
  'reposts',
  'followers',
  'following',
  'comments',
  'popular-tracks',
  'spotlight',
  'playlists',
  'toptracks',
  'recommended',
]);

/** A SoundCloud track or set path's kind, or null when it is neither. */
function soundcloudKind(path: string): PostKind | null {
  const segments = path.replace(/\/$/, '').split('/').slice(1);
  if (
    segments.length < 2 ||
    segments.length > 4 ||
    !segments.every((segment) => SOUNDCLOUD_SEGMENT.test(segment))
  ) {
    return null;
  }
  const [user, second, third, fourth] = segments;
  if (SOUNDCLOUD_RESERVED_USERS.has(user!.toLowerCase())) {
    return null;
  }
  if (second!.toLowerCase() === 'sets') {
    // /<user>/sets/<set>, optionally /s-<token> for a secret set.
    if (third === undefined || (fourth !== undefined && !SOUNDCLOUD_SECRET.test(fourth))) {
      return null;
    }
    return 'SET';
  }
  if (SOUNDCLOUD_RESERVED_TRACKS.has(second!.toLowerCase()) || fourth !== undefined) {
    return null;
  }
  // /<user>/<track>, optionally /s-<token> for a secret track.
  return third === undefined || SOUNDCLOUD_SECRET.test(third) ? 'TRACK' : null;
}

function platformLink(url: URL, trimmed: string): PlatformLink | null {
  const host = url.hostname;
  const bandcamp = BANDCAMP_HOST.exec(host);
  if (bandcamp) {
    if (BANDCAMP_NOT_ARTISTS.has(bandcamp[1]!)) {
      return null;
    }
    const match = BANDCAMP_PATH.exec(url.pathname);
    return match
      ? {
          url: trimmed,
          platform: 'BANDCAMP',
          kind: kindOf(match[1]!.toLowerCase()),
          needsResolve: false,
        }
      : null;
  }
  if (SOUNDCLOUD_HOSTS.includes(host)) {
    const kind = soundcloudKind(url.pathname);
    return kind ? { url: trimmed, platform: 'SOUNDCLOUD', kind, needsResolve: false } : null;
  }
  if (host === SOUNDCLOUD_SHORT_HOST) {
    return SOUNDCLOUD_SHORT_PATH.test(url.pathname)
      ? { url: trimmed, platform: 'SOUNDCLOUD', kind: null, needsResolve: true }
      : null;
  }
  return null;
}

export type SharedLink =
  ({ type: 'service' } & SupportedLink) | ({ type: 'platform' } & PlatformLink);

/**
 * Every link a post may carry: a streaming-service link (converted) or a
 * link-only platform link (never converted). Null means UC-11's 422.
 */
export function parseSharedLink(raw: string): SharedLink | null {
  const service = parseSupportedLink(raw);
  if (service) {
    return { type: 'service', ...service };
  }
  const parsed = parseHttpsUrl(raw);
  const platform = parsed && platformLink(parsed.url, parsed.trimmed);
  return platform ? { type: 'platform', ...platform } : null;
}
