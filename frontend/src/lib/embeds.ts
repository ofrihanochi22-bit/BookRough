/**
 * Whether a post's embed may become an iframe — docs/features/in-app-player.md §5.3.
 * The server builds the address; this checks it again, as defence in depth:
 * https, and exactly the one host its platform's player lives on.
 */

import type { LinkPlatform, PostEmbed } from '../api/posts';

const EMBED_HOSTS: Readonly<Record<LinkPlatform, string>> = {
  BANDCAMP: 'bandcamp.com',
  SOUNDCLOUD: 'w.soundcloud.com',
  YOUTUBE: 'www.youtube-nocookie.com',
};

const PLAYER_NAMES: Readonly<Record<LinkPlatform, string>> = {
  BANDCAMP: 'Bandcamp',
  SOUNDCLOUD: 'SoundCloud',
  YOUTUBE: 'YouTube',
};

export function isPlayableEmbed(embed: PostEmbed | null | undefined): embed is PostEmbed {
  if (!embed || !Object.hasOwn(EMBED_HOSTS, embed.platform)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(embed.url);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.hostname === EMBED_HOSTS[embed.platform]
  );
}

export function playerName(platform: LinkPlatform): string {
  return PLAYER_NAMES[platform];
}
