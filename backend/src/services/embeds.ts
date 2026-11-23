/**
 * The embedded player address of a link-only post — docs/features/in-app-player.md §4.
 *
 * Built only from stored, already-validated columns and fixed prefixes: the
 * variable parts are an 11-character video id, digits, or a canonical
 * SoundCloud link encoded with `encodeURIComponent`. The frontend checks the
 * host again before it renders an iframe.
 */

import type { LinkPlatform, Post } from '@prisma/client';

import { canonicalSoundcloudLink, youtubeVideoId } from './supportedLinks.js';

export interface PostEmbed {
  platform: LinkPlatform;
  url: string;
}

const BANDCAMP_ITEM_ID = /^[1-9][0-9]{0,19}$/;

type EmbedSource = Pick<Post, 'linkPlatform' | 'originalUrl' | 'kind' | 'bandcampItemId'>;

function youtubeEmbed(originalUrl: string): string | null {
  let id: string | null;
  try {
    id = youtubeVideoId(new URL(originalUrl));
  } catch {
    return null;
  }
  return id ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&autoplay=1` : null;
}

function soundcloudEmbed(originalUrl: string): string | null {
  // An unresolved on.soundcloud.com short link fails here: no embed (§2).
  const link = canonicalSoundcloudLink(originalUrl);
  return link
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(link.url)}` +
        '&auto_play=true&visual=false&show_comments=false'
    : null;
}

function bandcampEmbed(post: EmbedSource): string | null {
  if (!post.bandcampItemId || !BANDCAMP_ITEM_ID.test(post.bandcampItemId)) {
    return null;
  }
  const type = post.kind === 'ALBUM' ? 'album' : 'track';
  return (
    `https://bandcamp.com/EmbeddedPlayer/${type}=${post.bandcampItemId}` +
    '/size=large/tracklist=false/artwork=small/transparent=true/'
  );
}

/** The post's player, or null: every converted post, and any link it can't be built for. */
export function embedFor(post: EmbedSource): PostEmbed | null {
  const platform = post.linkPlatform;
  if (!platform) {
    return null;
  }
  const builders: Record<LinkPlatform, () => string | null> = {
    YOUTUBE: () => youtubeEmbed(post.originalUrl),
    SOUNDCLOUD: () => soundcloudEmbed(post.originalUrl),
    BANDCAMP: () => bandcampEmbed(post),
  };
  const url = builders[platform]();
  return url ? { platform, url } : null;
}
