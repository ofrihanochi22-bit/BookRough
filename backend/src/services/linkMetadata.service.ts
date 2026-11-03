/**
 * Metadata for link-only posts — docs/features/link-only-posts.md §4.3, §4.4.
 *
 * The project's only server-side fetch of a user-influenced URL, so it is
 * deliberately narrow: requests go to fixed hosts only (SoundCloud's and
 * YouTube's oEmbed endpoints, or a Bandcamp page whose host already passed
 * `supportedLinks`), redirects are never followed, each request has a timeout
 * and a byte cap, and every value read is untrusted.
 *
 * It never throws. `gone` means the platform itself said the item does not
 * exist (the caller refuses the link); `missing` is anything short of a
 * readable answer, and the post is saved without metadata.
 */

import type { LinkPlatform, PostKind } from '@prisma/client';

import { createLogger } from '../utils/logger.js';
import { canonicalSoundcloudLink, MAX_URL_LENGTH } from './supportedLinks.js';
import { cleanScrapedText as cleanText } from './textRules.js';

const log = createLogger('linkMetadata');

export type MetadataResult =
  | { outcome: 'found'; title: string; artist: string | null; coverArtUrl: string | null }
  | { outcome: 'missing' }
  | { outcome: 'gone' };

export type ShortLinkResult =
  | { outcome: 'resolved'; url: string; kind: PostKind }
  | { outcome: 'refused' }
  | { outcome: 'unresolved' };

/** Each request's own limit; the caller's deadline may cut it shorter. */
export const REQUEST_TIMEOUT_MS = 4_000;
/** oEmbed answers are under 1 KB; anything near this is not one. */
export const MAX_JSON_BYTES = 16 * 1024;
/** Bandcamp's og: tags sit in the first 10 KB of a ~400 KB page. */
export const MAX_PAGE_BYTES = 64 * 1024;
export const USER_AGENT = 'BookRough/1.0 (+https://bookrough.vercel.app)';

/** Where each platform's cover art may come from (§4.3). */
const COVER_HOSTS: Readonly<Record<LinkPlatform, (host: string) => boolean>> = {
  BANDCAMP: (host) => host === 'bcbits.com' || host.endsWith('.bcbits.com'),
  SOUNDCLOUD: (host) => host === 'sndcdn.com' || host.endsWith('.sndcdn.com'),
  YOUTUBE: (host) => host === 'i.ytimg.com',
};

interface FetchedBody {
  status: number;
  location: string | null;
  contentType: string;
  /** Up to the byte cap, decoded as UTF-8. */
  text: string;
  truncated: boolean;
}

const missing: MetadataResult = { outcome: 'missing' };

/** Time left before the caller's deadline, capped at one request's limit. */
function budget(deadline: number): number {
  return Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now());
}

/**
 * One GET with every safeguard: no redirects, a timeout, a byte cap, no
 * cookies. Null on a network error or timeout.
 */
async function boundedGet(
  url: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<FetchedBody | null> {
  if (timeoutMs <= 0) {
    return null;
  }
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/html' },
    });
    const head = {
      status: response.status,
      location: response.headers.get('location'),
      contentType: response.headers.get('content-type') ?? '',
    };
    // Only a 200 has a body worth reading; a redirect is answered by its header.
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      return { ...head, text: '', truncated: false };
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    if (response.body) {
      const reader = response.body.getReader();
      while (size < maxBytes) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
        size += value.byteLength;
      }
      if (size >= maxBytes) {
        truncated = true;
      }
      await reader.cancel().catch(() => undefined);
    }
    const bytes = Buffer.concat(chunks).subarray(0, maxBytes);
    return {
      ...head,
      text: new TextDecoder('utf-8').decode(bytes),
      truncated,
    };
  } catch {
    return null;
  }
}

/** Kept only when https, short enough, and on the platform's image host. */
function coverUrl(platform: LinkPlatform, value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && COVER_HOSTS[platform](url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function logOutcome(platform: LinkPlatform, outcome: string, started: number, reason?: string) {
  const durationMs = Date.now() - started;
  if (reason) {
    log.warn({ platform, outcome, reason, durationMs }, 'Link metadata unavailable');
  } else {
    log.info({ platform, outcome, durationMs }, 'Link metadata fetched');
  }
}

/** The `missing` reason for an answer that is not a usable 200, or null when it is. */
function unusable(body: FetchedBody | null, contentType: string): string | null {
  if (!body) {
    return 'timeout or network';
  }
  if (body.status !== 200) {
    return `status ${body.status}`;
  }
  return body.contentType.toLowerCase().startsWith(contentType) ? null : 'content type';
}

/** An oEmbed answer: SoundCloud's and YouTube's share the fields read here. */
async function oembed(
  platform: 'SOUNDCLOUD' | 'YOUTUBE',
  endpoint: string,
  target: string,
  goneStatuses: readonly number[],
  deadline: number,
): Promise<MetadataResult> {
  const started = Date.now();
  const query = new URLSearchParams({ format: 'json', url: target });
  const body = await boundedGet(
    `${endpoint}?${query.toString()}`,
    budget(deadline),
    MAX_JSON_BYTES,
  );
  if (body && goneStatuses.includes(body.status)) {
    logOutcome(platform, 'gone', started);
    return { outcome: 'gone' };
  }
  const reason = unusable(body, 'application/json') ?? (body!.truncated ? 'too large' : null);
  if (reason) {
    logOutcome(platform, 'missing', started, reason);
    return missing;
  }

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body!.text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    data = parsed as Record<string, unknown>;
  } catch {
    logOutcome(platform, 'missing', started, 'malformed');
    return missing;
  }

  const artist = cleanText(data.author_name);
  let title = cleanText(data.title);
  // SoundCloud titles read "Flickermood by Forss"; the artist is shown apart.
  if (title && artist && platform === 'SOUNDCLOUD' && title.endsWith(` by ${artist}`)) {
    title = cleanText(title.slice(0, -` by ${artist}`.length));
  }
  if (!title) {
    logOutcome(platform, 'missing', started, 'no title');
    return missing;
  }
  logOutcome(platform, 'found', started);
  return {
    outcome: 'found',
    title,
    artist,
    coverArtUrl: coverUrl(platform, data.thumbnail_url),
  };
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** The `og:` meta tags of a page, read as text — never parsed as a document. */
export function ogTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\s[^>]{0,2000}>/gi)) {
    const property = /\bproperty\s*=\s*"(og:[a-z_:]+)"/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
    if (property && content !== undefined && !tags.has(property)) {
      tags.set(property, decodeEntities(content));
    }
  }
  return tags;
}

async function bandcamp(url: string, deadline: number): Promise<MetadataResult> {
  const started = Date.now();
  const body = await boundedGet(url, budget(deadline), MAX_PAGE_BYTES);
  if (body?.status === 404) {
    logOutcome('BANDCAMP', 'gone', started);
    return { outcome: 'gone' };
  }
  // Over the cap is fine here: only the head is needed.
  const reason = unusable(body, 'text/html');
  if (reason) {
    logOutcome('BANDCAMP', 'missing', started, reason);
    return missing;
  }

  const tags = ogTags(body!.text);
  const ogTitle = tags.get('og:title') ?? '';
  // "A LA SALA, by Khruangbin": the artist follows the last ", by ".
  const split = ogTitle.lastIndexOf(', by ');
  const title = cleanText(split > 0 ? ogTitle.slice(0, split) : ogTitle);
  const artist = split > 0 ? cleanText(ogTitle.slice(split + ', by '.length)) : null;
  if (!title) {
    logOutcome('BANDCAMP', 'missing', started, 'no title');
    return missing;
  }
  logOutcome('BANDCAMP', 'found', started);
  return {
    outcome: 'found',
    title,
    artist,
    coverArtUrl: coverUrl('BANDCAMP', tags.get('og:image')),
  };
}

/**
 * Title, artist and cover for a Bandcamp or SoundCloud link that already
 * passed `supportedLinks` (§4.3). `deadline` is an epoch time in ms.
 */
export function fetchLinkMetadata(
  platform: 'BANDCAMP' | 'SOUNDCLOUD',
  url: string,
  deadline: number,
): Promise<MetadataResult> {
  return platform === 'BANDCAMP'
    ? bandcamp(url, deadline)
    : oembed('SOUNDCLOUD', 'https://soundcloud.com/oembed', url, [404], deadline);
}

/** YouTube oEmbed for one video id — rule C only (§4.2). */
export function fetchYoutubeMetadata(videoId: string, deadline: number): Promise<MetadataResult> {
  return oembed(
    'YOUTUBE',
    'https://www.youtube.com/oembed',
    `https://www.youtube.com/watch?v=${videoId}`,
    [400, 404],
    deadline,
  );
}

/** A thumbnail for a video, built from its id — no request (§4.2). */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Resolves an `on.soundcloud.com` short link through exactly one redirect,
 * which is read and checked but never requested (§4.4).
 */
export async function resolveSoundcloudShortLink(
  url: string,
  deadline: number,
): Promise<ShortLinkResult> {
  const started = Date.now();
  const body = await boundedGet(url, budget(deadline), MAX_JSON_BYTES);
  if (body?.status === 404) {
    logOutcome('SOUNDCLOUD', 'short link gone', started);
    return { outcome: 'refused' };
  }
  if (!body || ![301, 302, 303, 307, 308].includes(body.status)) {
    logOutcome(
      'SOUNDCLOUD',
      'short link unresolved',
      started,
      body ? `status ${body.status}` : 'timeout or network',
    );
    return { outcome: 'unresolved' };
  }
  const target = body.location ? canonicalSoundcloudLink(body.location) : null;
  if (!target) {
    // Off the allowlist, or not a track or set: never followed.
    logOutcome('SOUNDCLOUD', 'short link refused', started, 'redirect target');
    return { outcome: 'refused' };
  }
  logOutcome('SOUNDCLOUD', 'short link resolved', started);
  return { outcome: 'resolved', url: target.url, kind: target.kind };
}
