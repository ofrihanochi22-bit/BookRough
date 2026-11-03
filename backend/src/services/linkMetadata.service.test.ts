import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchLinkMetadata,
  fetchYoutubeMetadata,
  MAX_JSON_BYTES,
  ogTags,
  REQUEST_TIMEOUT_MS,
  resolveSoundcloudShortLink,
  USER_AGENT,
  youtubeThumbnail,
} from './linkMetadata.service.js';

/*
 * docs/features/link-only-posts.md §4.3, §4.4. `fetch` is the only boundary:
 * every answer a platform can give is built here as a real Response.
 */

const fetchMock = vi.fn<typeof fetch>();
const LATER = () => Date.now() + 12_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=UTF-8' } });
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

const SOUNDCLOUD_OEMBED = {
  title: 'Flickermood by Forss',
  author_name: 'Forss',
  thumbnail_url: 'https://i1.sndcdn.com/artworks-000067273316-smsiqx-t500x500.jpg',
  html: '<iframe src="https://w.soundcloud.com/player/"></iframe>',
};

const BANDCAMP_HEAD = `<!DOCTYPE html><html><head>
<meta property="og:title" content="A LA SALA, by Khruangbin">
<meta property="og:type" content="album">
<meta property="og:image" content="https://f4.bcbits.com/img/a4088322578_5.jpg">
</head><body>`;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('fetchLinkMetadata — SoundCloud', () => {
  it('reads title, artist and cover from oEmbed, with " by {artist}" removed', async () => {
    // Arrange
    fetchMock.mockResolvedValue(json(SOUNDCLOUD_OEMBED));

    // Act
    const result = await fetchLinkMetadata(
      'SOUNDCLOUD',
      'https://soundcloud.com/forss/flickermood',
      LATER(),
    );

    // Assert
    expect(result).toEqual({
      outcome: 'found',
      title: 'Flickermood',
      artist: 'Forss',
      coverArtUrl: SOUNDCLOUD_OEMBED.thumbnail_url,
    });
  });

  it('asks only the fixed oEmbed endpoint, with every safeguard', async () => {
    // Arrange
    fetchMock.mockResolvedValue(json(SOUNDCLOUD_OEMBED));

    // Act
    await fetchLinkMetadata('SOUNDCLOUD', 'https://soundcloud.com/forss/flickermood', LATER());

    // Assert
    const [url, init] = fetchMock.mock.calls[0]!;
    const requested = new URL(url as string);
    expect(requested.origin + requested.pathname).toBe('https://soundcloud.com/oembed');
    expect(requested.searchParams.get('url')).toBe('https://soundcloud.com/forss/flickermood');
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({ 'User-Agent': USER_AGENT });
    expect(init).not.toHaveProperty('credentials', 'include');
  });

  it('is gone when SoundCloud answers 404', async () => {
    // Arrange
    fetchMock.mockResolvedValue(json({ error: 'not found' }, 404));

    // Act & Assert
    await expect(
      fetchLinkMetadata('SOUNDCLOUD', 'https://soundcloud.com/forss/nope', LATER()),
    ).resolves.toEqual({ outcome: 'gone' });
  });

  it.each([
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a 500', () => Promise.resolve(json({}, 500))],
    ['a redirect', () => Promise.resolve(redirect('https://evil.example/'))],
    ['HTML instead of JSON', () => Promise.resolve(html('<html></html>'))],
    [
      'malformed JSON',
      () =>
        Promise.resolve(new Response('{oops', { headers: { 'content-type': 'application/json' } })),
    ],
    ['a JSON array', () => Promise.resolve(json([1, 2]))],
    ['no title', () => Promise.resolve(json({ author_name: 'Forss' }))],
    [
      'an oversized answer',
      () => Promise.resolve(json({ title: 'x'.repeat(MAX_JSON_BYTES), author_name: 'Forss' })),
    ],
  ])('is missing on %s', async (_why, answer) => {
    // Arrange
    fetchMock.mockImplementation(answer);

    // Act & Assert
    await expect(
      fetchLinkMetadata('SOUNDCLOUD', 'https://soundcloud.com/forss/flickermood', LATER()),
    ).resolves.toEqual({ outcome: 'missing' });
  });

  it('never follows a redirect: only one request is made', async () => {
    // Arrange
    fetchMock.mockResolvedValue(redirect('https://169.254.169.254/latest/meta-data'));

    // Act
    await fetchLinkMetadata('SOUNDCLOUD', 'https://soundcloud.com/forss/flickermood', LATER());

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['https://evil.example/cover.jpg', 'a foreign host'],
    ['http://i1.sndcdn.com/cover.jpg', 'http'],
    [`https://i1.sndcdn.com/${'a'.repeat(2100)}.jpg`, 'too long'],
    [42, 'not a string'],
  ])('drops a cover on %s (%s)', async (thumbnail: string | number, _why: string) => {
    // Arrange
    fetchMock.mockResolvedValue(json({ ...SOUNDCLOUD_OEMBED, thumbnail_url: thumbnail }));

    // Act
    const result = await fetchLinkMetadata(
      'SOUNDCLOUD',
      'https://soundcloud.com/forss/flickermood',
      LATER(),
    );

    // Assert
    expect(result).toMatchObject({ outcome: 'found', coverArtUrl: null });
  });

  it('cleans and caps hostile text', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      json({ title: `\u0007<b>${'é'.repeat(1000)}`, author_name: '  Forss\u0000 ' }),
    );

    // Act
    const result = await fetchLinkMetadata(
      'SOUNDCLOUD',
      'https://soundcloud.com/forss/flickermood',
      LATER(),
    );

    // Assert
    expect(result).toMatchObject({ outcome: 'found', artist: 'Forss' });
    const title = (result as { title: string }).title;
    expect(Array.from(title)).toHaveLength(300);
    expect(title).not.toContain('\u0007');
  });

  it('makes no request once the deadline has passed', async () => {
    // Act
    const result = await fetchLinkMetadata(
      'SOUNDCLOUD',
      'https://soundcloud.com/forss/flickermood',
      Date.now() - 1,
    );

    // Assert
    expect(result).toEqual({ outcome: 'missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives each request at most its own timeout', async () => {
    // Arrange
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(json(SOUNDCLOUD_OEMBED));

    // Act
    await fetchLinkMetadata('SOUNDCLOUD', 'https://soundcloud.com/forss/flickermood', LATER());

    // Assert
    expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    timeout.mockRestore();
  });
});

describe('fetchLinkMetadata — Bandcamp', () => {
  it("reads og: tags, splitting the artist off at the last ', by '", async () => {
    // Arrange
    fetchMock.mockResolvedValue(html(BANDCAMP_HEAD));

    // Act
    const result = await fetchLinkMetadata(
      'BANDCAMP',
      'https://khruangbin.bandcamp.com/album/a-la-sala',
      LATER(),
    );

    // Assert
    expect(result).toEqual({
      outcome: 'found',
      title: 'A LA SALA',
      artist: 'Khruangbin',
      coverArtUrl: 'https://f4.bcbits.com/img/a4088322578_5.jpg',
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://khruangbin.bandcamp.com/album/a-la-sala');
  });

  it('reads the head of a page far larger than the byte cap', async () => {
    // Arrange: a real album page is ~400 KB; only its head is read.
    fetchMock.mockResolvedValue(html(BANDCAMP_HEAD + 'x'.repeat(500_000)));

    // Act
    const result = await fetchLinkMetadata(
      'BANDCAMP',
      'https://khruangbin.bandcamp.com/album/a-la-sala',
      LATER(),
    );

    // Assert
    expect(result).toMatchObject({ outcome: 'found', title: 'A LA SALA' });
  });

  it('decodes entities and keeps a title with no artist', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      html('<meta content="Rock &amp; Roll &#x2014; Live &#39;99&quot;" property="og:title">'),
    );

    // Act
    const result = await fetchLinkMetadata('BANDCAMP', 'https://a.bandcamp.com/track/x', LATER());

    // Assert
    expect(result).toEqual({
      outcome: 'found',
      title: 'Rock & Roll — Live \'99"',
      artist: null,
      coverArtUrl: null,
    });
  });

  it('is gone on 404, missing on a redirect or a page without og:title', async () => {
    // Arrange
    fetchMock
      .mockResolvedValueOnce(html('', 404))
      .mockResolvedValueOnce(redirect('https://bandcamp.com/signup?new_domain=nobody'))
      .mockResolvedValueOnce(html('<html><head><title>x</title></head></html>'))
      .mockResolvedValueOnce(json({ title: 'x' }));
    const url = 'https://nobody.bandcamp.com/album/x';

    // Act & Assert
    await expect(fetchLinkMetadata('BANDCAMP', url, LATER())).resolves.toEqual({ outcome: 'gone' });
    await expect(fetchLinkMetadata('BANDCAMP', url, LATER())).resolves.toEqual({
      outcome: 'missing',
    });
    await expect(fetchLinkMetadata('BANDCAMP', url, LATER())).resolves.toEqual({
      outcome: 'missing',
    });
    await expect(fetchLinkMetadata('BANDCAMP', url, LATER())).resolves.toEqual({
      outcome: 'missing',
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('ogTags', () => {
  it('reads either attribute order, keeps the first of each, ignores other meta', () => {
    // Act
    const tags = ogTags(
      '<meta name="description" content="nope"><meta content="Second" property="og:title">' +
        '<meta property="og:title" content="Third"><meta property="og:image" content="">',
    );

    // Assert
    expect(Object.fromEntries(tags)).toEqual({ 'og:title': 'Second', 'og:image': '' });
  });
});

describe('fetchYoutubeMetadata', () => {
  it('reads the title, channel and thumbnail for one video id', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      json({
        title: 'Chanpan - romantic (Live on KEXP)',
        author_name: 'KEXP',
        thumbnail_url: 'https://i.ytimg.com/vi/bVwSZQPjRYE/hqdefault.jpg',
      }),
    );

    // Act
    const result = await fetchYoutubeMetadata('bVwSZQPjRYE', LATER());

    // Assert
    expect(result).toEqual({
      outcome: 'found',
      title: 'Chanpan - romantic (Live on KEXP)',
      artist: 'KEXP',
      coverArtUrl: 'https://i.ytimg.com/vi/bVwSZQPjRYE/hqdefault.jpg',
    });
    const requested = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(requested.origin + requested.pathname).toBe('https://www.youtube.com/oembed');
    expect(requested.searchParams.get('url')).toBe('https://www.youtube.com/watch?v=bVwSZQPjRYE');
  });

  it.each([[400], [404]])('is gone on %s', async (status) => {
    // Arrange
    fetchMock.mockResolvedValue(new Response('Bad Request', { status }));

    // Act & Assert
    await expect(fetchYoutubeMetadata('aaaaaaaaaaa', LATER())).resolves.toEqual({
      outcome: 'gone',
    });
  });

  it('builds a thumbnail from the id without a request', () => {
    // Act & Assert
    expect(youtubeThumbnail('bVwSZQPjRYE')).toBe(
      'https://i.ytimg.com/vi/bVwSZQPjRYE/hqdefault.jpg',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('resolveSoundcloudShortLink', () => {
  const SHORT = 'https://on.soundcloud.com/AbC123';

  it.each([[301], [302], [303], [307], [308]])(
    'follows a %s to SoundCloud, dropping tracking parameters',
    async (status) => {
      // Arrange
      fetchMock.mockResolvedValue(
        redirect('https://m.soundcloud.com/forss/flickermood?si=x&utm_medium=text', status),
      );

      // Act
      const result = await resolveSoundcloudShortLink(SHORT, LATER());

      // Assert
      expect(result).toEqual({
        outcome: 'resolved',
        url: 'https://soundcloud.com/forss/flickermood',
        kind: 'TRACK',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]![0]).toBe(SHORT);
    },
  );

  it.each([
    ['https://evil.example/forss/flickermood', 'off the allowlist'],
    ['http://soundcloud.com/forss/flickermood', 'http'],
    ['https://soundcloud.com/forss', 'a profile'],
  ])('refuses a redirect to %s (%s), never requesting it', async (location) => {
    // Arrange
    fetchMock.mockResolvedValue(redirect(location));

    // Act & Assert
    await expect(resolveSoundcloudShortLink(SHORT, LATER())).resolves.toEqual({
      outcome: 'refused',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect without a Location, and a 404', async () => {
    // Arrange
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302 }))
      .mockResolvedValueOnce(html('', 404));

    // Act & Assert
    await expect(resolveSoundcloudShortLink(SHORT, LATER())).resolves.toEqual({
      outcome: 'refused',
    });
    await expect(resolveSoundcloudShortLink(SHORT, LATER())).resolves.toEqual({
      outcome: 'refused',
    });
  });

  it.each([
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ['a 503', () => Promise.resolve(html('', 503))],
    ['a 200 with no redirect', () => Promise.resolve(html('<html></html>'))],
  ])('leaves the link unresolved on %s', async (_why, answer) => {
    // Arrange
    fetchMock.mockImplementation(answer);

    // Act & Assert
    await expect(resolveSoundcloudShortLink(SHORT, LATER())).resolves.toEqual({
      outcome: 'unresolved',
    });
  });
});
