import { describe, expect, it } from 'vitest';

import type { PostEmbed } from '../api/posts';
import { isPlayableEmbed, playerName } from './embeds';

/* docs/features/in-app-player.md §5.3, §7. */

describe('isPlayableEmbed', () => {
  it.each<PostEmbed>([
    {
      platform: 'BANDCAMP',
      url: 'https://bandcamp.com/EmbeddedPlayer/album=1836174753/size=large/',
    },
    {
      platform: 'SOUNDCLOUD',
      url: 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood',
    },
    { platform: 'YOUTUBE', url: 'https://www.youtube-nocookie.com/embed/bVwSZQPjRYE' },
  ])('allows the $platform player on its own host', (embed) => {
    // Act & Assert
    expect(isPlayableEmbed(embed)).toBe(true);
  });

  it.each<[string, PostEmbed | null | undefined]>([
    ['no embed', null],
    ['a missing embed', undefined],
    ['plain http', { platform: 'YOUTUBE', url: 'http://www.youtube-nocookie.com/embed/x' }],
    ['another host', { platform: 'YOUTUBE', url: 'https://evil.test/embed/x' }],
    ['a lookalike suffix', { platform: 'BANDCAMP', url: 'https://bandcamp.com.evil.test/x' }],
    ['a lookalike subdomain', { platform: 'BANDCAMP', url: 'https://evil.bandcamp.com/x' }],
    [
      'credentials in the URL',
      { platform: 'SOUNDCLOUD', url: 'https://w.soundcloud.com@evil.test/' },
    ],
    [
      'a user name on the right host',
      { platform: 'SOUNDCLOUD', url: 'https://a@w.soundcloud.com/' },
    ],
    ['a port', { platform: 'YOUTUBE', url: 'https://www.youtube-nocookie.com:8443/embed/x' }],
    ['a script URL', { platform: 'YOUTUBE', url: 'javascript:alert(1)' }],
    [
      'the right host for another platform',
      { platform: 'BANDCAMP', url: 'https://www.youtube-nocookie.com/embed/x' },
    ],
    [
      'an unknown platform',
      { platform: 'MIXCLOUD', url: 'https://bandcamp.com/x' } as unknown as PostEmbed,
    ],
    [
      'a platform from the prototype',
      { platform: 'toString', url: 'https://bandcamp.com/x' } as unknown as PostEmbed,
    ],
    ['an unparseable URL', { platform: 'YOUTUBE', url: 'not a url' }],
  ])('refuses %s', (_case, embed) => {
    // Act & Assert
    expect(isPlayableEmbed(embed)).toBe(false);
  });
});

describe('playerName', () => {
  it('names each platform', () => {
    // Act & Assert
    expect(playerName('BANDCAMP')).toBe('Bandcamp');
    expect(playerName('SOUNDCLOUD')).toBe('SoundCloud');
    expect(playerName('YOUTUBE')).toBe('YouTube');
  });
});
