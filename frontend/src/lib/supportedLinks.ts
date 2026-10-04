/**
 * Which pasted links can become a post — docs/features/posts-feed.md §4.1.
 *
 * A deliberate mirror of backend/src/services/supportedLinks.ts, for an instant
 * inline error; the server stays authoritative. Change both together.
 */

import type { PostKind } from '../api/posts';
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
  if (url.hostname === 'youtu.be') {
    return YOUTUBE_ID.test(url.pathname.slice(1).replace(/\/$/, '')) ? 'TRACK' : undefined;
  }
  if (url.pathname === '/watch') {
    return YOUTUBE_ID.test(url.searchParams.get('v') ?? '') ? 'TRACK' : undefined;
  }
  if (url.hostname !== 'music.youtube.com') {
    return undefined;
  }
  if (url.pathname === '/playlist') {
    return YOUTUBE_ALBUM_LIST.test(url.searchParams.get('list') ?? '') ? 'ALBUM' : undefined;
  }
  return YOUTUBE_ALBUM_BROWSE.test(url.pathname) ? 'ALBUM' : undefined;
}

/** The pasted link if it can become a post, otherwise null. */
export function parseSupportedLink(raw: string): SupportedLink | null {
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
