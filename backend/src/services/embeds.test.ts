import { describe, expect, it } from 'vitest';

import { embedFor } from './embeds.js';

/* docs/features/in-app-player.md §4, §7. */

type Source = Parameters<typeof embedFor>[0];

function source(overrides: Partial<Source>): Source {
  return {
    linkPlatform: null,
    originalUrl: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    kind: 'TRACK',
    bandcampItemId: null,
    ...overrides,
  };
}

const YOUTUBE_EMBED = 'https://www.youtube-nocookie.com/embed/bVwSZQPjRYE?playsinline=1&autoplay=1';

describe('embedFor', () => {
  it.each([
    'https://www.youtube.com/watch?v=bVwSZQPjRYE',
    'https://youtu.be/bVwSZQPjRYE',
    'https://www.youtube.com/live/bVwSZQPjRYE',
    'https://music.youtube.com/watch?v=bVwSZQPjRYE&si=abc',
  ])('builds the privacy-enhanced YouTube player for %s', (originalUrl) => {
    // Act
    const embed = embedFor(source({ linkPlatform: 'YOUTUBE', kind: 'VIDEO', originalUrl }));

    // Assert
    expect(embed).toEqual({ platform: 'YOUTUBE', url: YOUTUBE_EMBED });
  });

  it.each([
    [
      'https://soundcloud.com/forss/flickermood',
      'https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood',
    ],
    [
      'https://m.soundcloud.com/forss/sets/soulhack?si=abc&utm_source=clipboard',
      'https%3A%2F%2Fsoundcloud.com%2Fforss%2Fsets%2Fsoulhack',
    ],
  ])('builds the SoundCloud widget for %s from its canonical link', (originalUrl, encoded) => {
    // Act
    const embed = embedFor(source({ linkPlatform: 'SOUNDCLOUD', originalUrl }));

    // Assert
    expect(embed).toEqual({
      platform: 'SOUNDCLOUD',
      url: `https://w.soundcloud.com/player/?url=${encoded}&auto_play=true&visual=false&show_comments=false`,
    });
  });

  it.each([
    ['ALBUM', 'album'],
    ['TRACK', 'track'],
  ] as const)('builds the Bandcamp %s player from its id', (kind, type) => {
    // Act
    const embed = embedFor(
      source({
        linkPlatform: 'BANDCAMP',
        kind,
        originalUrl: `https://khruangbin.bandcamp.com/${type}/x`,
        bandcampItemId: '1836174753',
      }),
    );

    // Assert
    expect(embed).toEqual({
      platform: 'BANDCAMP',
      url: `https://bandcamp.com/EmbeddedPlayer/${type}=1836174753/size=large/tracklist=false/artwork=small/transparent=true/`,
    });
  });

  it.each<[string, Partial<Source>]>([
    ['a converted post', {}],
    [
      'a Bandcamp post without an id',
      { linkPlatform: 'BANDCAMP', kind: 'ALBUM', originalUrl: 'https://a.bandcamp.com/album/x' },
    ],
    [
      'a Bandcamp id that is not digits',
      {
        linkPlatform: 'BANDCAMP',
        kind: 'ALBUM',
        originalUrl: 'https://a.bandcamp.com/album/x',
        bandcampItemId: '12/../x',
      },
    ],
    [
      'an unresolved SoundCloud short link',
      { linkPlatform: 'SOUNDCLOUD', originalUrl: 'https://on.soundcloud.com/AbC123' },
    ],
    [
      'a YouTube link with no video id',
      {
        linkPlatform: 'YOUTUBE',
        kind: 'VIDEO',
        originalUrl: 'https://music.youtube.com/playlist?list=OLAK5uy_x',
      },
    ],
    [
      'a YouTube link that does not parse',
      { linkPlatform: 'YOUTUBE', kind: 'VIDEO', originalUrl: 'not a url' },
    ],
  ])('is null for %s', (_case, overrides) => {
    // Act
    const embed = embedFor(source(overrides));

    // Assert
    expect(embed).toBeNull();
  });
});
