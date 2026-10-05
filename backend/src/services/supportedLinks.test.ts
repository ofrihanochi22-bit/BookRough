import { describe, expect, it } from 'vitest';

import { parseSupportedLink, serviceForHost } from './supportedLinks.js';

/*
 * The same example table lives in frontend/src/lib/supportedLinks.test.ts:
 * the two implementations must agree link for link.
 */

const SPOTIFY_ID = '4u7EnebtmKWzUH433cf5Qv';

const ACCEPTED: Array<[url: string, service: string, kind: string | null]> = [
  [`https://open.spotify.com/track/${SPOTIFY_ID}`, 'SPOTIFY', 'TRACK'],
  [`https://open.spotify.com/track/${SPOTIFY_ID}?si=abc123`, 'SPOTIFY', 'TRACK'],
  [`https://open.spotify.com/intl-de/track/${SPOTIFY_ID}`, 'SPOTIFY', 'TRACK'],
  [`https://open.spotify.com/album/${SPOTIFY_ID}`, 'SPOTIFY', 'ALBUM'],
  ['https://music.apple.com/us/song/bohemian-rhapsody/1440650711', 'APPLE_MUSIC', 'TRACK'],
  ['https://music.apple.com/us/album/a-night-at-the-opera/1440650428', 'APPLE_MUSIC', 'ALBUM'],
  [
    'https://music.apple.com/us/album/bohemian-rhapsody/1440650428?i=1440650711',
    'APPLE_MUSIC',
    'TRACK',
  ],
  ['https://music.apple.com/gb/album/1440650428', 'APPLE_MUSIC', 'ALBUM'],
  ['https://music.youtube.com/watch?v=BSTsnWoslP4', 'YOUTUBE', 'TRACK'],
  ['https://www.youtube.com/watch?v=BSTsnWoslP4&t=10', 'YOUTUBE', 'TRACK'],
  ['https://youtube.com/watch?v=BSTsnWoslP4', 'YOUTUBE', 'TRACK'],
  ['https://youtu.be/BSTsnWoslP4', 'YOUTUBE', 'TRACK'],
  ['https://music.youtube.com/playlist?list=OLAK5uy_abcDEF123', 'YOUTUBE', 'ALBUM'],
  ['https://music.youtube.com/browse/MPREb_eEpQf8QskKl', 'YOUTUBE', 'ALBUM'],
  ['https://tidal.com/browse/track/534050211', 'TIDAL', 'TRACK'],
  ['https://listen.tidal.com/album/534050196', 'TIDAL', 'ALBUM'],
  ['https://tidal.com/track/534050211/u', 'TIDAL', 'TRACK'],
  ['https://www.deezer.com/track/4091937401', 'DEEZER', 'TRACK'],
  ['https://www.deezer.com/en/album/1007321681', 'DEEZER', 'ALBUM'],
  ['https://deezer.com/track/4091937401', 'DEEZER', 'TRACK'],
  ['https://link.deezer.com/s/30abcXYZ', 'DEEZER', null],
];

const REJECTED: Array<[url: string, why: string]> = [
  ['', 'empty'],
  ['not a url', 'not a URL'],
  [`http://open.spotify.com/track/${SPOTIFY_ID}`, 'http'],
  [`https://open.spotify.com.evil.io/track/${SPOTIFY_ID}`, 'look-alike host'],
  [`https://evil.io/open.spotify.com/track/${SPOTIFY_ID}`, 'unknown host'],
  [`https://user:pass@open.spotify.com/track/${SPOTIFY_ID}`, 'credentials'],
  [`https://open.spotify.com:8443/track/${SPOTIFY_ID}`, 'port'],
  ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'playlist'],
  ['https://open.spotify.com/artist/1dfeR4HaWDbWqFHLkxsg1d', 'artist'],
  ['https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ', 'podcast'],
  ['https://open.spotify.com/track/abc', 'id too short'],
  ['https://open.spotify.com/', 'home page'],
  ['https://music.apple.com/us/artist/queen/3296287', 'Apple artist'],
  ['https://music.apple.com/us/playlist/x/pl.123', 'Apple playlist'],
  ['https://music.youtube.com/watch?v=short', 'YouTube id too short'],
  ['https://music.youtube.com/playlist?list=PL123', 'YouTube user playlist'],
  ['https://www.youtube.com/playlist?list=OLAK5uy_abc', 'album list off music.youtube.com'],
  ['https://music.youtube.com/channel/UC123', 'YouTube channel'],
  ['https://youtu.be/', 'youtu.be without id'],
  ['https://tidal.com/browse/artist/123', 'Tidal artist'],
  ['https://www.deezer.com/en/playlist/123', 'Deezer playlist'],
  ['https://link.deezer.com/x/abc', 'Deezer short link wrong path'],
  [`https://open.spotify.com/track/${SPOTIFY_ID}?x=${'a'.repeat(2048)}`, 'over 2048'],
];

describe('parseSupportedLink', () => {
  it.each(ACCEPTED)('accepts %s as %s %s', (url, service, kind) => {
    // Act
    const link = parseSupportedLink(url);

    // Assert
    expect(link).toEqual({ url, service, kind });
  });

  it.each(REJECTED)('rejects %s (%s)', (url) => {
    // Act & Assert
    expect(parseSupportedLink(url)).toBeNull();
  });

  it('trims surrounding whitespace and keeps the trimmed link', () => {
    // Act
    const link = parseSupportedLink(`  https://open.spotify.com/track/${SPOTIFY_ID} \n`);

    // Assert
    expect(link?.url).toBe(`https://open.spotify.com/track/${SPOTIFY_ID}`);
  });
});

describe('serviceForHost', () => {
  it('maps every listed host and nothing else', () => {
    // Act & Assert
    expect(serviceForHost('listen.tidal.com')).toBe('TIDAL');
    expect(serviceForHost('youtu.be')).toBe('YOUTUBE');
    expect(serviceForHost('music.amazon.com')).toBeNull();
    expect(serviceForHost('soundcloud.com')).toBeNull();
  });
});
