import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Link-only posts end to end at the API — docs/features/link-only-posts.md §7.
 * Two boundaries are mocked: the squigly converter (never Chromium here,
 * CLAUDE.md §10) and `fetch`, which stands in for SoundCloud, Bandcamp and
 * YouTube. The metadata service itself runs for real.
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({
  convertLink,
  CONVERSION_CEILING_MS: 12_000,
}));

const app = createApp();
const fetchMock = vi.fn<typeof fetch>();

const INVALID_LINK =
  "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service.";
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

const SPOTIFY = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const BANDCAMP = 'https://khruangbin.bandcamp.com/album/a-la-sala';
const SOUNDCLOUD = 'https://soundcloud.com/forss/flickermood';
const SOUNDCLOUD_SET = 'https://soundcloud.com/forss/sets/soulhack';
const SHORT = 'https://on.soundcloud.com/AbC123';
const LIVE = 'https://www.youtube.com/live/bVwSZQPjRYE';
const VIDEO = 'https://www.youtube.com/watch?v=bVwSZQPjRYE';

const CONVERTED = {
  outcome: 'converted',
  kind: 'TRACK',
  title: 'Never Gonna Give You Up',
  artist: 'Rick Astley',
  coverArtUrl: 'https://is1-ssl.mzstatic.com/cover.jpg',
  links: {
    SPOTIFY,
    YOUTUBE: 'https://music.youtube.com/watch?v=lYBUbBu4W08',
    DEEZER: 'https://www.deezer.com/track/1',
  },
};
const YOUTUBE_ONLY = {
  ...CONVERTED,
  title: 'Chanpan - romantic (Live on KEXP)',
  artist: 'KEXP',
  coverArtUrl: null,
  links: { YOUTUBE: 'https://music.youtube.com/watch?v=bVwSZQPjRYE' },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** What each platform answers, unless a test says otherwise. */
function platforms(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input.toString());
  if (url.hostname === 'soundcloud.com' && url.pathname === '/oembed') {
    const target = url.searchParams.get('url') ?? '';
    return Promise.resolve(
      target.endsWith('/nope')
        ? json({}, 404)
        : json({
            title: target.includes('/sets/') ? 'Soulhack by Forss' : 'Flickermood by Forss',
            author_name: 'Forss',
            thumbnail_url: 'https://i1.sndcdn.com/artworks-1-t500x500.jpg',
          }),
    );
  }
  if (url.hostname.endsWith('.bandcamp.com')) {
    return Promise.resolve(
      url.pathname.endsWith('/nope')
        ? new Response('', { status: 404 })
        : new Response(
            '<meta property="og:title" content="A LA SALA, by Khruangbin">' +
              '<meta property="og:image" content="https://f4.bcbits.com/img/a1_5.jpg">',
            { headers: { 'content-type': 'text/html; charset=UTF-8' } },
          ),
    );
  }
  if (url.hostname === 'on.soundcloud.com') {
    const location =
      url.pathname === '/Evil1'
        ? 'https://evil.example/forss/flickermood'
        : 'https://soundcloud.com/forss/flickermood?si=abc&utm_source=clipboard';
    return Promise.resolve(new Response(null, { status: 302, headers: { location } }));
  }
  if (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') {
    return Promise.resolve(json({ title: 'Live set', author_name: 'KEXP', thumbnail_url: null }));
  }
  return Promise.reject(new Error(`Unexpected request to ${url.hostname}`));
}

interface Person {
  id: string;
  cookie: string;
}

async function person(googleSub: string): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName: googleSub,
      displayNameKey: googleSub,
      preferredService: 'SPOTIFY',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

/** Dana owns "Friday Jazz"; Noam is a member and Dana's friend; Zed knows nobody. */
async function world() {
  const [dana, noam, zed] = await Promise.all([person('dana'), person('noam'), person('zed')]);
  await prisma.friend.create({
    data: { requesterId: dana.id, addresseeId: noam.id, status: 'ACCEPTED' },
  });
  const created = await request(app)
    .post('/api/communities')
    .set('Cookie', dana.cookie)
    .send({ name: 'Friday Jazz' });
  const communityId = created.body.data.community.id as string;
  const invite = await request(app)
    .get(`/api/communities/${communityId}/invite`)
    .set('Cookie', dana.cookie);
  await request(app)
    .post(`/api/invites/${invite.body.data.invite.token as string}/accept`)
    .set('Cookie', noam.cookie);
  return { dana, noam, zed, communityId };
}

type World = Awaited<ReturnType<typeof world>>;
type Target = 'community post' | 'direct recommendation';
const TARGETS: Target[] = ['community post', 'direct recommendation'];

/** Dana shares to the community, or sends to Noam. */
function share(w: World, target: Target, body: object, who: Person = w.dana) {
  return target === 'community post'
    ? request(app)
        .post(`/api/communities/${w.communityId}/posts`)
        .set('Cookie', who.cookie)
        .send(body)
    : request(app)
        .post('/api/recommendations')
        .set('Cookie', who.cookie)
        .send({ recipientId: w.noam.id, ...body });
}

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
  convertLink.mockResolvedValue(CONVERTED);
  fetchMock.mockReset();
  fetchMock.mockImplementation(platforms);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe.each(TARGETS)('sharing as a %s', (target) => {
  it.each([
    [
      BANDCAMP,
      'BANDCAMP',
      'ALBUM',
      'A LA SALA',
      'Khruangbin',
      'https://f4.bcbits.com/img/a1_5.jpg',
    ],
    [
      SOUNDCLOUD,
      'SOUNDCLOUD',
      'TRACK',
      'Flickermood',
      'Forss',
      'https://i1.sndcdn.com/artworks-1-t500x500.jpg',
    ],
    [
      SOUNDCLOUD_SET,
      'SOUNDCLOUD',
      'SET',
      'Soulhack',
      'Forss',
      'https://i1.sndcdn.com/artworks-1-t500x500.jpg',
    ],
  ])(
    '201: %s is saved link-only, without squigly',
    async (url, platform, kind, title, artist, coverArtUrl) => {
      // Arrange
      const w = await world();

      // Act
      const response = await share(w, target, { url, comment: 'Free to stream' });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.data.post).toMatchObject({
        originalUrl: url,
        sourceService: null,
        platform,
        kind,
        title,
        artist,
        coverArtUrl,
        links: {},
        conversionPending: false,
        comment: 'Free to stream',
      });
      expect(convertLink).not.toHaveBeenCalled();
      const row = await prisma.post.findFirstOrThrow();
      expect(row).toMatchObject({
        linkPlatform: platform,
        sourceService: null,
        universalLinkSpotify: null,
        universalLinkYoutube: null,
      });
    },
  );

  it('201: a SoundCloud short link is stored resolved, without its tracking query', async () => {
    // Arrange
    const w = await world();

    // Act
    const response = await share(w, target, { url: SHORT });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.post).toMatchObject({
      originalUrl: SOUNDCLOUD,
      platform: 'SOUNDCLOUD',
      kind: 'TRACK',
      title: 'Flickermood',
    });
  });

  it('201: a live video squigly finds nowhere else becomes a video post (rule E)', async () => {
    // Arrange
    const w = await world();
    convertLink.mockResolvedValue(YOUTUBE_ONLY);

    // Act
    const response = await share(w, target, { url: LIVE });

    // Assert
    expect(response.status).toBe(201);
    expect(convertLink).toHaveBeenCalledWith(VIDEO, 'YOUTUBE');
    expect(response.body.data.post).toMatchObject({
      originalUrl: LIVE,
      sourceService: null,
      platform: 'YOUTUBE',
      kind: 'VIDEO',
      title: 'Chanpan - romantic (Live on KEXP)',
      artist: 'KEXP',
      coverArtUrl: 'https://i.ytimg.com/vi/bVwSZQPjRYE/hqdefault.jpg',
      links: {},
    });
  });

  it("201: a video squigly can't find is saved as a video (rule C)", async () => {
    // Arrange
    const w = await world();
    convertLink.mockResolvedValue({ outcome: 'not_found' });

    // Act
    const response = await share(w, target, { url: VIDEO });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.post).toMatchObject({
      platform: 'YOUTUBE',
      kind: 'VIDEO',
      title: 'Live set',
      artist: 'KEXP',
    });
  });

  it.each([
    [SPOTIFY, 'SPOTIFY'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YOUTUBE'],
    ['https://youtu.be/dQw4w9WgXcQ', 'YOUTUBE'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'YOUTUBE'],
  ])('201 regression: %s still converts with every link', async (url, service) => {
    // Arrange
    const w = await world();

    // Act
    const response = await share(w, target, { url });

    // Assert
    expect(response.status).toBe(201);
    expect(convertLink).toHaveBeenCalledWith(url, service);
    expect(response.body.data.post).toMatchObject({
      sourceService: service,
      platform: null,
      kind: 'TRACK',
      links: CONVERTED.links,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['https://www.mixcloud.com/someone/mix/', 'a host not on the allowlist'],
    ['https://soundcloud.com.evil.example/forss/flickermood', 'a lookalike host'],
    ['https://soundcloud.com@evil.example/forss/flickermood', 'a userinfo trick'],
    ['https://khruangbin.bandcamp.com/', 'a Bandcamp home page'],
    ['https://soundcloud.com/forss', 'a SoundCloud profile'],
    ['soundcloud.com/forss/flickermood', 'a malformed URL'],
  ])('422: refuses %s (%s) before any request', async (url) => {
    // Arrange
    const w = await world();

    // Act
    const response = await share(w, target, { url });

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe(INVALID_LINK);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.post.count()).toBe(0);
  });

  it.each([
    ['https://khruangbin.bandcamp.com/album/nope', 'Bandcamp answers 404'],
    ['https://soundcloud.com/forss/nope', 'SoundCloud answers 404'],
    ['https://on.soundcloud.com/Evil1', 'the short link leads off the allowlist'],
  ])('422: refuses %s (%s), saving nothing', async (url) => {
    // Arrange
    const w = await world();

    // Act
    const response = await share(w, target, { url });

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe(INVALID_LINK);
    expect(await prisma.post.count()).toBe(0);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url as string).hostname)).not.toContain(
      'evil.example',
    );
  });

  it('201: a platform that times out still saves the post, without metadata', async () => {
    // Arrange
    const w = await world();
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

    // Act
    const response = await share(w, target, { url: BANDCAMP });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.post).toMatchObject({
      platform: 'BANDCAMP',
      title: null,
      artist: null,
      coverArtUrl: null,
    });
  });

  it('400: unparseable JSON', async () => {
    // Arrange
    const w = await world();
    const path =
      target === 'community post'
        ? `/api/communities/${w.communityId}/posts`
        : '/api/recommendations';

    // Act
    const response = await request(app)
      .post(path)
      .set('Cookie', w.dana.cookie)
      .set('Content-Type', 'application/json')
      .send('{"url":');

    // Assert
    expect(response.status).toBe(400);
  });

  it('401: signed out', async () => {
    // Arrange
    const w = await world();

    // Act
    const response = await share(w, target, { url: SOUNDCLOUD }, { id: w.dana.id, cookie: '' });

    // Assert
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('who may share a link-only post', () => {
  it('403: a direct recommendation to someone who is not a friend', async () => {
    // Arrange
    const w = await world();

    // Act
    const response = await request(app)
      .post('/api/recommendations')
      .set('Cookie', w.dana.cookie)
      .send({ recipientId: w.zed.id, url: SOUNDCLOUD });

    // Assert
    expect(response.status).toBe(403);
    expect(await prisma.post.count()).toBe(0);
  });

  it('404: a community the caller is not in, or that does not exist', async () => {
    // Arrange
    const w = await world();

    // Act
    const stranger = await request(app)
      .post(`/api/communities/${w.communityId}/posts`)
      .set('Cookie', w.zed.cookie)
      .send({ url: SOUNDCLOUD });
    const unknown = await request(app)
      .post(`/api/communities/${UNKNOWN_UUID}/posts`)
      .set('Cookie', w.dana.cookie)
      .send({ url: SOUNDCLOUD });

    // Assert
    expect(stranger.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404: an unknown recipient', async () => {
    // Arrange
    const w = await world();

    // Act
    const response = await request(app)
      .post('/api/recommendations')
      .set('Cookie', w.dana.cookie)
      .send({ recipientId: UNKNOWN_UUID, url: SOUNDCLOUD });

    // Assert
    expect(response.status).toBe(404);
    expect(await prisma.post.count()).toBe(0);
  });
});

describe('POST /api/posts/:postId/conversion on link-only and YouTube posts', () => {
  const retry = (who: Person, postId: string) =>
    request(app).post(`/api/posts/${postId}/conversion`).set('Cookie', who.cookie);

  it('409: a link-only post has nothing to retry', async () => {
    // Arrange
    const w = await world();
    const shared = await share(w, 'community post', { url: SOUNDCLOUD });

    // Act
    const response = await retry(w.dana, shared.body.data.post.id as string);

    // Assert
    expect(response.status).toBe(409);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('200: a pending YouTube post becomes a video when squigly finds it nowhere else', async () => {
    // Arrange: squigly was down when it was shared.
    const w = await world();
    convertLink.mockResolvedValueOnce({ outcome: 'unavailable', reason: 'timeout' });
    const shared = await share(w, 'direct recommendation', { url: VIDEO });
    expect(shared.body.data.post.conversionPending).toBe(true);
    convertLink.mockResolvedValue(YOUTUBE_ONLY);

    // Act
    const response = await retry(w.dana, shared.body.data.post.id as string);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.post).toMatchObject({
      platform: 'YOUTUBE',
      sourceService: null,
      kind: 'VIDEO',
      conversionPending: false,
    });
  });

  it('401, 403, 404: signed out, not the author, unknown post', async () => {
    // Arrange
    const w = await world();
    convertLink.mockResolvedValueOnce({ outcome: 'unavailable', reason: 'timeout' });
    const shared = await share(w, 'community post', { url: VIDEO });
    const id = shared.body.data.post.id as string;

    // Act
    const signedOut = await request(app).post(`/api/posts/${id}/conversion`);
    const notAuthor = await retry(w.noam, id);
    const unknown = await retry(w.dana, UNKNOWN_UUID);

    // Assert
    expect(signedOut.status).toBe(401);
    expect(notAuthor.status).toBe(403);
    expect(unknown.status).toBe(404);
  });
});

describe('a link-only post everywhere posts are read', () => {
  it('shows platform in the feed, Received, Sent, Post Detail, My List and a profile', async () => {
    // Arrange
    const w = await world();
    // Rating a post takes it off My List (UC-13), so one post is saved, another rated.
    const toSave = await share(w, 'community post', { url: SOUNDCLOUD });
    const toRate = await share(w, 'community post', { url: SOUNDCLOUD_SET });
    const direct = await share(w, 'direct recommendation', { url: BANDCAMP });
    const savedId = toSave.body.data.post.id as string;
    const ratedId = toRate.body.data.post.id as string;
    const directId = direct.body.data.post.id as string;
    const as = (who: Person, path: string) => request(app).get(path).set('Cookie', who.cookie);

    // Act
    const saved = await request(app)
      .put(`/api/posts/${savedId}/bookmark`)
      .set('Cookie', w.noam.cookie);
    const rated = await request(app)
      .post(`/api/posts/${directId}/ratings`)
      .set('Cookie', w.noam.cookie)
      .send({ score: 9 });
    await request(app)
      .post(`/api/posts/${ratedId}/ratings`)
      .set('Cookie', w.noam.cookie)
      .send({ score: 7 });
    const feed = await as(w.noam, `/api/communities/${w.communityId}/posts`);
    const received = await as(w.noam, '/api/recommendations/received');
    const sent = await as(w.dana, '/api/recommendations/sent');
    const detail = await as(w.noam, `/api/posts/${directId}`);
    const myList = await as(w.noam, '/api/users/me/bookmarks');
    const profile = await as(w.dana, `/api/users/${w.noam.id}/ratings`);

    // Assert
    expect(saved.status).toBe(200);
    expect(rated.status).toBe(201);
    expect(feed.body.data.posts).toEqual([
      expect.objectContaining({ id: ratedId, platform: 'SOUNDCLOUD', kind: 'SET', myScore: 7 }),
      expect.objectContaining({ id: savedId, platform: 'SOUNDCLOUD', isBookmarked: true }),
    ]);
    expect(received.body.data.posts[0]).toMatchObject({ platform: 'BANDCAMP', myScore: 9 });
    expect(sent.body.data.posts[0]).toMatchObject({
      platform: 'BANDCAMP',
      ratingSummary: { count: 1 },
    });
    expect(detail.body.data.post).toMatchObject({ platform: 'BANDCAMP', kind: 'ALBUM' });
    expect(JSON.stringify(myList.body.data)).toContain('"platform":"SOUNDCLOUD"');
    expect(profile.body.data.items[0].post).toMatchObject({ platform: 'SOUNDCLOUD', kind: 'SET' });
  });

  it('hides and deletes like any post', async () => {
    // Arrange
    const w = await world();
    const direct = await share(w, 'direct recommendation', { url: BANDCAMP });
    const id = direct.body.data.post.id as string;

    // Act
    const hidden = await request(app)
      .put(`/api/recommendations/${id}/hidden`)
      .set('Cookie', w.noam.cookie);
    const deleted = await request(app).delete(`/api/posts/${id}`).set('Cookie', w.dana.cookie);

    // Assert
    expect(hidden.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(await prisma.post.count()).toBe(0);
  });
});

describe('the hand-written CHECKs', () => {
  async function insert(data: object) {
    const w = await world();
    return prisma.post.create({
      data: {
        authorId: w.dana.id,
        communityId: w.communityId,
        originalUrl: SOUNDCLOUD,
        ...data,
      },
    });
  }

  it('posts_one_source: never both a service and a platform, nor neither', async () => {
    // Act & Assert
    await expect(insert({ sourceService: 'SPOTIFY', linkPlatform: 'SOUNDCLOUD' })).rejects.toThrow(
      /posts_one_source/,
    );
    await resetDatabase();
    await expect(insert({})).rejects.toThrow(/posts_one_source/);
  });

  it('posts_link_only_unconverted: a link-only post is never pending and has no links', async () => {
    // Act & Assert
    await expect(insert({ linkPlatform: 'SOUNDCLOUD', conversionPending: true })).rejects.toThrow(
      /posts_link_only_unconverted/,
    );
    await resetDatabase();
    await expect(
      insert({ linkPlatform: 'SOUNDCLOUD', universalLinkSpotify: SPOTIFY }),
    ).rejects.toThrow(/posts_link_only_unconverted/);
  });
});
