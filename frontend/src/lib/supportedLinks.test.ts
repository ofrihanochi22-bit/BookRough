import { describe, expect, it } from 'vitest';

import { parseSharedLink, parseSupportedLink, serviceForHost } from './supportedLinks';

/*
 * The same example table lives in backend/src/services/supportedLinks.test.ts:
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

/*
 * Link-only platforms — docs/features/link-only-posts.md §4.1. The same table
 * is in both packages' tests, like the one above.
 */

const PLATFORM_ACCEPTED: Array<[url: string, platform: string, kind: string | null]> = [
  ['https://khruangbin.bandcamp.com/album/a-la-sala', 'BANDCAMP', 'ALBUM'],
  ['https://khruangbin.bandcamp.com/track/fifteen-fifty-three/', 'BANDCAMP', 'TRACK'],
  ['https://khruangbin.bandcamp.com/album/A-LA-SALA', 'BANDCAMP', 'ALBUM'],
  ['https://KHRUANGBIN.Bandcamp.com/album/a-la-sala', 'BANDCAMP', 'ALBUM'],
  ['https://soundcloud.com/forss/flickermood', 'SOUNDCLOUD', 'TRACK'],
  ['https://soundcloud.com/forss/flickermood?si=abc&utm_source=x', 'SOUNDCLOUD', 'TRACK'],
  ['https://soundcloud.com/forss/flickermood/s-AbC123', 'SOUNDCLOUD', 'TRACK'],
  ['https://soundcloud.com/forss/sets/soulhack', 'SOUNDCLOUD', 'SET'],
  ['https://soundcloud.com/forss/sets/soulhack/s-AbC123', 'SOUNDCLOUD', 'SET'],
  ['https://www.soundcloud.com/forss/flickermood', 'SOUNDCLOUD', 'TRACK'],
  ['https://m.soundcloud.com/forss/flickermood', 'SOUNDCLOUD', 'TRACK'],
  ['https://SoundCloud.com/Forss/Flickermood', 'SOUNDCLOUD', 'TRACK'],
  ['https://on.soundcloud.com/AbC123xyz', 'SOUNDCLOUD', null],
];

const PLATFORM_REJECTED: Array<[url: string, why: string]> = [
  ['https://khruangbin.bandcamp.com/', 'artist home page'],
  ['https://khruangbin.bandcamp.com/music', 'discography page'],
  ['https://khruangbin.bandcamp.com/merch', 'merch page'],
  ['https://khruangbin.bandcamp.com/track', 'no slug'],
  ['https://khruangbin.bandcamp.com/album/a_la_sala', 'slug character'],
  ['https://bandcamp.com/album/x', 'bare host'],
  ['https://www.bandcamp.com/album/x', 'www is not an artist'],
  ['https://daily.bandcamp.com/album/x', 'editorial site'],
  ['https://a.b.bandcamp.com/track/x', 'two labels'],
  ['https://khruangbin.bandcamp.com.evil.example/album/x', 'lookalike suffix'],
  ['https://xbandcamp.com/album/x', 'lookalike host'],
  ['http://khruangbin.bandcamp.com/album/x', 'http'],
  ['https://khruangbin.bandcamp.com:8443/album/x', 'port'],
  ['https://user:pw@khruangbin.bandcamp.com/album/x', 'userinfo'],
  ['https://music.khruangbin.com/album/x', 'custom domain'],
  ['https://soundcloud.com/forss', 'profile'],
  ['https://soundcloud.com/forss/tracks', 'profile tab'],
  ['https://soundcloud.com/forss/likes', 'likes'],
  ['https://soundcloud.com/forss/reposts', 'reposts'],
  ['https://soundcloud.com/forss/albums', 'albums tab'],
  ['https://soundcloud.com/forss/sets', 'sets tab'],
  ['https://soundcloud.com/forss/followers', 'followers'],
  ['https://soundcloud.com/forss/flickermood/comments', 'comments page'],
  ['https://soundcloud.com/forss/flickermood/extra/more', 'too deep'],
  ['https://soundcloud.com/discover/sets/new', 'discover'],
  ['https://soundcloud.com/search?q=forss', 'search'],
  ['https://soundcloud.com/stations/track/forss/flickermood', 'station'],
  ['https://soundcloud.com/you/likes', 'own library'],
  ['https://soundcloud.com/', 'home page'],
  ['https://soundcloud.com.evil.example/forss/flickermood', 'lookalike suffix'],
  ['https://evilsoundcloud.com/forss/flickermood', 'lookalike host'],
  ['https://soundcloud.com@evil.example/forss/flickermood', 'userinfo trick'],
  ['https://api.soundcloud.com/tracks/293', 'api host'],
  ['https://on.soundcloud.com/AbC/extra', 'short link with a path'],
  ['https://on.soundcloud.com/', 'short link without a code'],
  ['https://www.mixcloud.com/someone/some-mix/', 'host not on the allowlist'],
  ['https://vimeo.com/123456', 'host not on the allowlist'],
  ['javascript:alert(1)//soundcloud.com/a/b', 'not https'],
  ['data:text/html,soundcloud.com', 'not https'],
  ['soundcloud.com/forss/flickermood', 'not absolute'],
];

describe('parseSharedLink', () => {
  it.each(PLATFORM_ACCEPTED)('accepts %s as %s %s', (url, platform, kind) => {
    // Act
    const link = parseSharedLink(url);

    // Assert
    expect(link).toEqual({
      type: 'platform',
      url,
      platform,
      kind,
      needsResolve: url.startsWith('https://on.soundcloud.com/'),
    });
  });

  it.each(PLATFORM_REJECTED)('rejects %s (%s)', (url) => {
    // Act & Assert
    expect(parseSharedLink(url)).toBeNull();
  });

  it.each(ACCEPTED)('still classifies %s as service %s %s', (url, service, kind) => {
    // Act & Assert: a streaming link never becomes link-only.
    expect(parseSharedLink(url)).toEqual({ type: 'service', url, service, kind });
  });

  it.each([
    ['https://www.youtube.com/live/QrR_gm6RqCo'],
    ['https://youtube.com/live/QrR_gm6RqCo/'],
  ])('accepts the live link %s as a YouTube video', (url) => {
    // Act & Assert
    expect(parseSharedLink(url)).toEqual({
      type: 'service',
      url,
      service: 'YOUTUBE',
      kind: 'TRACK',
    });
  });

  it.each([
    ['https://music.youtube.com/live/QrR_gm6RqCo', 'not on YouTube Music'],
    ['https://www.youtube.com/live/short', 'bad id'],
    ['https://www.youtube.com/shorts/QrR_gm6RqCo', 'Shorts'],
    ['https://www.youtube.com/@KEXP', 'channel'],
    ['https://www.youtube.com/playlist?list=PLxyz', 'non-album playlist'],
  ])('rejects %s (%s)', (url) => {
    // Act & Assert
    expect(parseSharedLink(url)).toBeNull();
  });
});
