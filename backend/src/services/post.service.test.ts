import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import type * as LinkMetadataService from './linkMetadata.service.js';
import {
  ALREADY_CONVERTED,
  AUTHOR_ONLY,
  AUTHOR_OR_ADMIN,
  AUTO_RETRY_AUTHOR_ONLY,
  AUTO_RETRY_IN_FLIGHT,
  createPost as createPostAt,
  decodeCursor,
  deletePost,
  EDIT_FRIENDS_ONLY,
  editComment,
  encodeCursor,
  getPost,
  NO_AUTO_RETRIES_LEFT,
  POST_NOT_FOUND,
  prepareSharedLink as prepareSharedLinkAt,
  retryConversion as retryAt,
} from './post.service.js';
import { INVALID_LINK } from './supportedLinks.js';

/**
 * Unit tests for the branches an integration test cannot reach on demand: a
 * membership or post that disappears while the conversion runs. The ordinary
 * paths are proven end to end in routes/posts.integration.test.ts.
 */

const {
  db,
  convertLink,
  fetchLinkMetadata,
  fetchYoutubeMetadata,
  resolveSoundcloudShortLink,
  notifyCommunityPost,
  areFriends,
} = vi.hoisted(() => ({
  db: {
    communityMember: { findUnique: vi.fn() },
    post: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  convertLink: vi.fn(),
  fetchLinkMetadata: vi.fn(),
  fetchYoutubeMetadata: vi.fn(),
  resolveSoundcloudShortLink: vi.fn(),
  notifyCommunityPost: vi.fn(),
  areFriends: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./linkScraper.service.js', () => ({ convertLink }));
vi.mock('./notification.service.js', () => ({ notifyCommunityPost }));
vi.mock('./friendship.js', () => ({ areFriends, friendsOnPosts: vi.fn(async () => new Set()) }));
vi.mock('./ratingSummary.js', () => ({
  ratingSummaries: vi.fn(async () => new Map()),
  summaryFor: () => ({ average: null, count: 0 }),
}));
vi.mock('./linkMetadata.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof LinkMetadataService>()),
  fetchLinkMetadata,
  fetchYoutubeMetadata,
  resolveSoundcloudShortLink,
}));

const USER = { id: '11111111-1111-4111-8111-111111111111' } as User;
const COMMUNITY = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

/** A request deadline 12 s from now, as a controller sets it. */
const DEADLINE = Date.now() + 12_000;
type NewPostInput = Parameters<typeof prepareSharedLinkAt>[0];
const createPost = (user: User, communityId: string, input: NewPostInput) =>
  createPostAt(user, communityId, input, DEADLINE);
const prepareSharedLink = (input: NewPostInput) => prepareSharedLinkAt(input, DEADLINE);
const retryConversion = (user: User, postId: string) => retryAt(user, postId, DEADLINE);

const CONVERTED = {
  outcome: 'converted',
  kind: 'TRACK',
  title: 'Song',
  artist: 'Band',
  coverArtUrl: null,
  links: { SPOTIFY: TRACK },
};

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.communityMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(db));
  convertLink.mockResolvedValue(CONVERTED);
});

describe('createPost', () => {
  it('refuses a wrong-shaped link without converting it', async () => {
    // Act & Assert
    await expectAppError(
      createPost(USER, COMMUNITY, {
        url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      }),
      422,
      INVALID_LINK,
    );
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('refuses a too-long comment without converting', async () => {
    // Act & Assert
    await expectAppError(
      createPost(USER, COMMUNITY, { url: TRACK, comment: 'a'.repeat(281) }),
      422,
    );
    expect(convertLink).not.toHaveBeenCalled();
  });

  it("refuses squigly's not_found and saves nothing", async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'not_found' });

    // Act & Assert
    await expectAppError(createPost(USER, COMMUNITY, { url: TRACK }), 422, INVALID_LINK);
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('is a 404 when the membership is gone by the time the conversion ends', async () => {
    // Arrange: removed while squigly was working.
    db.$queryRaw.mockResolvedValue([]);

    // Act & Assert
    await expectAppError(createPost(USER, COMMUNITY, { url: TRACK }), 404);
    expect(db.post.create).not.toHaveBeenCalled();
    expect(notifyCommunityPost).not.toHaveBeenCalled();
  });

  it('is a 404 when the community was deleted meanwhile (foreign key)', async () => {
    // Arrange
    db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    db.post.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );

    // Act & Assert
    await expectAppError(createPost(USER, COMMUNITY, { url: TRACK }), 404);
  });

  it('passes any other database error on', async () => {
    // Arrange
    db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    db.post.create.mockRejectedValue(new Error('connection lost'));

    // Act & Assert
    await expect(createPost(USER, COMMUNITY, { url: TRACK })).rejects.toThrow('connection lost');
  });
});

describe('retryConversion', () => {
  const pending = {
    id: POST_ID,
    authorId: USER.id,
    communityId: COMMUNITY,
    originalUrl: TRACK,
    sourceService: 'SPOTIFY',
    conversionPending: true,
  };

  it('is a 404 when the post disappears while converting', async () => {
    // Arrange: found, then deleted (or its author removed) before the re-read.
    db.post.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);
  });

  it.each([
    ['another member of the community', { authorId: 'someone-else' }],
    [
      'the recipient of a direct recommendation',
      { authorId: 'someone-else', communityId: null, recipientId: USER.id },
    ],
  ])('lets %s retry: the converter runs and the post is written', async (_who, owner) => {
    // Arrange: the re-read finds nothing, so the call ends before serialising
    // (the response shape is the integration tests' job).
    db.post.findUnique.mockResolvedValueOnce({ ...pending, ...owner }).mockResolvedValueOnce(null);

    // Act
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);

    // Assert: no 403 on the way.
    expect(convertLink).toHaveBeenCalledTimes(1);
    expect(db.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: POST_ID, conversionPending: true } }),
    );
  });

  it('checks membership before state', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({ ...pending, conversionPending: false });

    // Act & Assert
    await expectAppError(retryConversion(USER, POST_ID), 409, ALREADY_CONVERTED);

    db.communityMember.findUnique.mockResolvedValue(null);
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);
  });
});

describe('cursors', () => {
  it('round-trips a post position', () => {
    // Arrange
    const position = { createdAt: new Date('2026-10-04T10:00:00.123Z'), id: POST_ID };

    // Act & Assert
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it.each([
    ['garbage', 'not base64 JSON'],
    [Buffer.from('{"a":1}').toString('base64url'), 'an object'],
    [Buffer.from('["nope","x"]').toString('base64url'), 'bad date and id'],
    [Buffer.from(`["2026-10-04T10:00:00.000Z","not-a-uuid"]`).toString('base64url'), 'bad id'],
  ])('rejects %s (%s) with 422', (raw) => {
    // Act & Assert
    expect(() => decodeCursor(raw)).toThrow(AppError);
  });
});

describe('deletePost', () => {
  const someoneElses = { authorId: 'someone-else', communityId: COMMUNITY };

  it.each([
    ['the author, as a plain member', { authorId: USER.id, communityId: COMMUNITY }, 'MEMBER'],
    ["an admin, on someone else's post", someoneElses, 'ADMIN'],
    ["the owner, on someone else's post", someoneElses, 'OWNER'],
  ])('lets %s delete', async (_who, post, role) => {
    // Arrange
    db.post.findUnique.mockResolvedValue(post);
    db.communityMember.findUnique.mockResolvedValue({ role });
    db.post.deleteMany.mockResolvedValue({ count: 1 });

    // Act
    await deletePost(USER, POST_ID);

    // Assert
    expect(db.post.deleteMany).toHaveBeenCalledWith({ where: { id: POST_ID } });
  });

  it("refuses a plain member on someone else's post, without deleting", async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue(someoneElses);

    // Act & Assert
    await expectAppError(deletePost(USER, POST_ID), 403, AUTHOR_OR_ADMIN);
    expect(db.post.deleteMany).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown post and for a caller outside its community', async () => {
    // Arrange, Act & Assert — unknown
    db.post.findUnique.mockResolvedValue(null);
    await expectAppError(deletePost(USER, POST_ID), 404, POST_NOT_FOUND);

    // Arrange, Act & Assert — not a member
    db.post.findUnique.mockResolvedValue(someoneElses);
    db.communityMember.findUnique.mockResolvedValue(null);
    await expectAppError(deletePost(USER, POST_ID), 404, POST_NOT_FOUND);
    expect(db.post.deleteMany).not.toHaveBeenCalled();
  });

  it('is a 404 when someone else deleted it between the check and the delete', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({ authorId: USER.id, communityId: COMMUNITY });
    db.post.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(deletePost(USER, POST_ID), 404, POST_NOT_FOUND);
  });
});

describe('getPost', () => {
  it('is a 404 when the post is deleted between the access check and the read', async () => {
    // Arrange: it exists for the check, then is gone.
    db.post.findUnique
      .mockResolvedValueOnce({ authorId: USER.id, communityId: COMMUNITY })
      .mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(getPost(USER, POST_ID), 404, POST_NOT_FOUND);
  });
});

/*
 * Link-only posts and the YouTube rule — docs/features/link-only-posts.md §4.
 * prepareSharedLink touches no database, so every branch is reachable here.
 */

const VIDEO = 'https://www.youtube.com/watch?v=bVwSZQPjRYE';
const SONG_VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SOUNDCLOUD = 'https://soundcloud.com/forss/flickermood';
const BANDCAMP = 'https://khruangbin.bandcamp.com/album/a-la-sala';
const FOUND = { outcome: 'found', title: 'Flickermood', artist: 'Forss', coverArtUrl: null };

const LINK_ONLY_NULLS = { sourceService: null, conversionPending: false, bandcampItemId: null };

describe('prepareSharedLink — Bandcamp and SoundCloud', () => {
  it.each([
    [BANDCAMP, 'BANDCAMP', 'ALBUM'],
    [SOUNDCLOUD, 'SOUNDCLOUD', 'TRACK'],
    ['https://soundcloud.com/forss/sets/soulhack', 'SOUNDCLOUD', 'SET'],
  ])('saves %s as a link-only %s %s, never calling squigly', async (url, platform, kind) => {
    // Arrange
    fetchLinkMetadata.mockResolvedValue(FOUND);

    // Act
    const data = await prepareSharedLink({ url, comment: 'Listen' });

    // Assert
    expect(data).toEqual({
      textComment: 'Listen',
      originalUrl: url,
      linkPlatform: platform,
      kind,
      songTitle: 'Flickermood',
      songArtist: 'Forss',
      songCoverArtUrl: null,
      ...LINK_ONLY_NULLS,
    });
    expect(convertLink).not.toHaveBeenCalled();
    expect(fetchLinkMetadata).toHaveBeenCalledWith(platform, url, expect.any(Number));
  });

  it('stores the Bandcamp item id the page gave (in-app-player.md §3)', async () => {
    // Arrange
    fetchLinkMetadata.mockResolvedValue({ ...FOUND, itemId: '1836174753' });

    // Act
    const data = await prepareSharedLink({ url: BANDCAMP });

    // Assert
    expect(data).toMatchObject({ linkPlatform: 'BANDCAMP', bandcampItemId: '1836174753' });
  });

  it('never stores an item id on a SoundCloud post, whatever the metadata says', async () => {
    // Arrange
    fetchLinkMetadata.mockResolvedValue({ ...FOUND, itemId: '42' });

    // Act
    const data = await prepareSharedLink({ url: SOUNDCLOUD });

    // Assert
    expect(data).toMatchObject({ linkPlatform: 'SOUNDCLOUD', bandcampItemId: null });
  });

  it('saves without metadata when the platform cannot be read', async () => {
    // Arrange
    fetchLinkMetadata.mockResolvedValue({ outcome: 'missing' });

    // Act
    const data = await prepareSharedLink({ url: SOUNDCLOUD });

    // Assert
    expect(data).toMatchObject({ songTitle: null, songArtist: null, songCoverArtUrl: null });
    expect(data).toMatchObject({ linkPlatform: 'SOUNDCLOUD', ...LINK_ONLY_NULLS });
  });

  it('refuses a link the platform says does not exist', async () => {
    // Arrange
    fetchLinkMetadata.mockResolvedValue({ outcome: 'gone' });

    // Act & Assert
    await expectAppError(prepareSharedLink({ url: BANDCAMP }), 422, INVALID_LINK);
  });

  it.each([
    ['https://khruangbin.bandcamp.com/', 'a Bandcamp home page'],
    ['https://soundcloud.com/forss', 'a SoundCloud profile'],
    ['https://soundcloud.com.evil.example/forss/flickermood', 'a lookalike host'],
    ['https://www.mixcloud.com/someone/mix/', 'a host not on the allowlist'],
  ])('refuses %s (%s) before asking anyone', async (url) => {
    // Act & Assert
    await expectAppError(prepareSharedLink({ url }), 422, INVALID_LINK);
    expect(fetchLinkMetadata).not.toHaveBeenCalled();
    expect(resolveSoundcloudShortLink).not.toHaveBeenCalled();
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('refuses a too-long comment before asking the platform', async () => {
    // Act & Assert
    await expectAppError(prepareSharedLink({ url: SOUNDCLOUD, comment: 'a'.repeat(281) }), 422);
    expect(fetchLinkMetadata).not.toHaveBeenCalled();
  });
});

describe('prepareSharedLink — SoundCloud short links', () => {
  const SHORT = 'https://on.soundcloud.com/AbC123';

  it('resolves the short link, then stores and describes the resolved one', async () => {
    // Arrange
    resolveSoundcloudShortLink.mockResolvedValue({
      outcome: 'resolved',
      url: 'https://soundcloud.com/forss/sets/soulhack',
      kind: 'SET',
    });
    fetchLinkMetadata.mockResolvedValue(FOUND);

    // Act
    const data = await prepareSharedLink({ url: SHORT });

    // Assert
    expect(data).toMatchObject({
      originalUrl: 'https://soundcloud.com/forss/sets/soulhack',
      kind: 'SET',
      linkPlatform: 'SOUNDCLOUD',
    });
    expect(fetchLinkMetadata).toHaveBeenCalledWith(
      'SOUNDCLOUD',
      'https://soundcloud.com/forss/sets/soulhack',
      expect.any(Number),
    );
  });

  it('refuses a short link that leads off the allowlist or nowhere', async () => {
    // Arrange
    resolveSoundcloudShortLink.mockResolvedValue({ outcome: 'refused' });

    // Act & Assert
    await expectAppError(prepareSharedLink({ url: SHORT }), 422, INVALID_LINK);
    expect(fetchLinkMetadata).not.toHaveBeenCalled();
  });

  it('keeps an unresolvable short link as it is, with no kind and no metadata', async () => {
    // Arrange
    resolveSoundcloudShortLink.mockResolvedValue({ outcome: 'unresolved' });

    // Act
    const data = await prepareSharedLink({ url: SHORT });

    // Assert
    expect(data).toMatchObject({
      originalUrl: SHORT,
      kind: null,
      songTitle: null,
      linkPlatform: 'SOUNDCLOUD',
      ...LINK_ONLY_NULLS,
    });
    expect(fetchLinkMetadata).not.toHaveBeenCalled();
  });
});

describe('prepareSharedLink — the YouTube rule (E + C)', () => {
  it('keeps a song converted when squigly found it elsewhere', async () => {
    // Arrange
    convertLink.mockResolvedValue({
      ...CONVERTED,
      links: { YOUTUBE: 'https://music.youtube.com/watch?v=lYBUbBu4W08', SPOTIFY: TRACK },
    });

    // Act
    const data = await prepareSharedLink({ url: SONG_VIDEO });

    // Assert
    expect(data).toMatchObject({
      sourceService: 'YOUTUBE',
      kind: 'TRACK',
      universalLinkSpotify: TRACK,
      conversionPending: false,
    });
    expect(data).not.toHaveProperty('linkPlatform');
  });

  it('keeps a video squigly found nowhere else as a video, with a built thumbnail (E)', async () => {
    // Arrange
    convertLink.mockResolvedValue({
      ...CONVERTED,
      title: 'Chanpan - romantic (Live on KEXP)',
      artist: 'KEXP',
      links: { YOUTUBE: 'https://music.youtube.com/watch?v=bVwSZQPjRYE' },
    });

    // Act
    const data = await prepareSharedLink({ url: VIDEO });

    // Assert
    expect(data).toEqual({
      textComment: null,
      originalUrl: VIDEO,
      linkPlatform: 'YOUTUBE',
      kind: 'VIDEO',
      songTitle: 'Chanpan - romantic (Live on KEXP)',
      songArtist: 'KEXP',
      songCoverArtUrl: 'https://i.ytimg.com/vi/bVwSZQPjRYE/hqdefault.jpg',
      ...LINK_ONLY_NULLS,
    });
  });

  it.each([['https://youtu.be/bVwSZQPjRYE'], ['https://music.youtube.com/watch?v=bVwSZQPjRYE']])(
    'applies rule E on %s too',
    async (url) => {
      // Arrange
      convertLink.mockResolvedValue({ ...CONVERTED, links: {} });

      // Act & Assert
      await expect(prepareSharedLink({ url })).resolves.toMatchObject({
        linkPlatform: 'YOUTUBE',
        kind: 'VIDEO',
      });
    },
  );

  it('hands squigly a live link as the watch link of the same video', async () => {
    // Arrange
    convertLink.mockResolvedValue({ ...CONVERTED, links: {} });

    // Act
    const data = await prepareSharedLink({ url: 'https://www.youtube.com/live/QrR_gm6RqCo' });

    // Assert
    expect(convertLink).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=QrR_gm6RqCo',
      'YOUTUBE',
      DEADLINE,
    );
    expect(data).toMatchObject({ originalUrl: 'https://www.youtube.com/live/QrR_gm6RqCo' });
  });

  it('never turns a YouTube Music album into a video', async () => {
    // Arrange
    const album = 'https://music.youtube.com/playlist?list=OLAK5uy_abcDEF123';
    convertLink.mockResolvedValue({ ...CONVERTED, kind: 'ALBUM', links: { YOUTUBE: album } });

    // Act & Assert
    await expect(prepareSharedLink({ url: album })).resolves.toMatchObject({
      sourceService: 'YOUTUBE',
      kind: 'ALBUM',
    });
  });

  it('saves a video squigly cannot find, described by YouTube oEmbed (C)', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'not_found' });
    fetchYoutubeMetadata.mockResolvedValue({
      outcome: 'found',
      title: 'Live set',
      artist: 'KEXP',
      coverArtUrl: null,
    });

    // Act
    const data = await prepareSharedLink({ url: VIDEO });

    // Assert
    expect(data).toMatchObject({
      linkPlatform: 'YOUTUBE',
      kind: 'VIDEO',
      songTitle: 'Live set',
      songCoverArtUrl: 'https://i.ytimg.com/vi/bVwSZQPjRYE/hqdefault.jpg',
    });
    expect(fetchYoutubeMetadata).toHaveBeenCalledWith('bVwSZQPjRYE', expect.any(Number));
  });

  it('saves it without metadata when oEmbed cannot answer (C)', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'not_found' });
    fetchYoutubeMetadata.mockResolvedValue({ outcome: 'missing' });

    // Act & Assert
    await expect(prepareSharedLink({ url: VIDEO })).resolves.toMatchObject({
      linkPlatform: 'YOUTUBE',
      kind: 'VIDEO',
      songTitle: null,
      songCoverArtUrl: null,
    });
  });

  it('refuses it when YouTube confirms the video does not exist (C)', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'not_found' });
    fetchYoutubeMetadata.mockResolvedValue({ outcome: 'gone' });

    // Act & Assert
    await expectAppError(prepareSharedLink({ url: VIDEO }), 422, INVALID_LINK);
  });

  it('keeps a YouTube link pending, as before, when squigly is down', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'unavailable', reason: 'timeout' });

    // Act & Assert
    await expect(prepareSharedLink({ url: VIDEO })).resolves.toEqual({
      textComment: null,
      originalUrl: VIDEO,
      sourceService: 'YOUTUBE',
      conversionPending: true,
    });
    expect(fetchYoutubeMetadata).not.toHaveBeenCalled();
  });
});

describe('prepareSharedLink — regression for every streaming service', () => {
  it.each([
    [TRACK, 'SPOTIFY'],
    ['https://music.apple.com/us/song/bohemian-rhapsody/1440650711', 'APPLE_MUSIC'],
    ['https://tidal.com/browse/track/534050211', 'TIDAL'],
    ['https://www.deezer.com/track/4091937401', 'DEEZER'],
    [SONG_VIDEO, 'YOUTUBE'],
    ['https://youtu.be/dQw4w9WgXcQ', 'YOUTUBE'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'YOUTUBE'],
  ])('converts %s exactly as before', async (url, service) => {
    // Arrange
    convertLink.mockResolvedValue({
      ...CONVERTED,
      links: { SPOTIFY: TRACK, APPLE_MUSIC: 'https://music.apple.com/us/song/x/1' },
    });

    // Act
    const data = await prepareSharedLink({ url });

    // Assert
    expect(convertLink).toHaveBeenCalledWith(url, service, DEADLINE);
    expect(data).toEqual({
      textComment: null,
      originalUrl: url,
      sourceService: service,
      kind: 'TRACK',
      songTitle: 'Song',
      songArtist: 'Band',
      songCoverArtUrl: null,
      universalLinkSpotify: TRACK,
      universalLinkApple: 'https://music.apple.com/us/song/x/1',
      universalLinkYoutube: null,
      universalLinkTidal: null,
      universalLinkDeezer: null,
      conversionPending: false,
    });
    expect(fetchLinkMetadata).not.toHaveBeenCalled();
  });

  it("still refuses squigly's not_found for a non-YouTube link, without oEmbed", async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'not_found' });

    // Act & Assert
    await expectAppError(prepareSharedLink({ url: TRACK }), 422, INVALID_LINK);
    expect(fetchYoutubeMetadata).not.toHaveBeenCalled();
  });
});

describe('retryConversion — link-only posts and the YouTube rule', () => {
  const pendingVideo = {
    id: POST_ID,
    authorId: USER.id,
    communityId: COMMUNITY,
    originalUrl: 'https://www.youtube.com/live/bVwSZQPjRYE',
    sourceService: 'YOUTUBE',
    linkPlatform: null,
    conversionPending: true,
  };

  it('refuses a link-only post with 409, without converting', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({
      ...pendingVideo,
      sourceService: null,
      linkPlatform: 'SOUNDCLOUD',
      conversionPending: false,
    });

    // Act & Assert
    await expectAppError(retryConversion(USER, POST_ID), 409, ALREADY_CONVERTED);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('turns a pending YouTube post into a video when squigly finds it nowhere else', async () => {
    // Arrange: the re-read finds it gone, which ends the call after the write.
    db.post.findUnique.mockResolvedValueOnce(pendingVideo).mockResolvedValueOnce(null);
    convertLink.mockResolvedValue({ ...CONVERTED, title: 'Live', artist: 'KEXP', links: {} });

    // Act
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);

    // Assert
    expect(convertLink).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=bVwSZQPjRYE',
      'YOUTUBE',
      DEADLINE,
    );
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, conversionPending: true },
      data: {
        originalUrl: pendingVideo.originalUrl,
        linkPlatform: 'YOUTUBE',
        kind: 'VIDEO',
        songTitle: 'Live',
        songArtist: 'KEXP',
        songCoverArtUrl: 'https://i.ytimg.com/vi/bVwSZQPjRYE/hqdefault.jpg',
        ...LINK_ONLY_NULLS,
      },
    });
  });

  it('converts a pending YouTube song as before', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValueOnce(pendingVideo).mockResolvedValueOnce(null);

    // Act
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);

    // Assert
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, conversionPending: true },
      data: expect.objectContaining({ universalLinkSpotify: TRACK, conversionPending: false }),
    });
  });

  it('leaves the post untouched when YouTube says the video is gone', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValueOnce(pendingVideo).mockResolvedValueOnce(null);
    convertLink.mockResolvedValue({ outcome: 'not_found' });
    fetchYoutubeMetadata.mockResolvedValue({ outcome: 'gone' });

    // Act
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);

    // Assert
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });
});

/*
 * Editing a comment — docs/features/edit-post-comment.md §7. Only the comment
 * ever changes, and only by its author.
 */
describe('editComment', () => {
  const RECIPIENT = '55555555-5555-4555-8555-555555555555';
  const AUTHOR = { ...USER, displayName: 'Ofri', preferredService: 'SPOTIFY' } as User;
  const MID_ONBOARDING = { id: USER.id, displayName: null, preferredService: null } as User;

  /** The access read, then getPost's two reads (its access check and the full row). */
  function stored(fields: Record<string, unknown>) {
    const target = { authorId: USER.id, communityId: COMMUNITY, recipientId: null, ...fields };
    db.post.findUnique
      .mockResolvedValueOnce({ textComment: 'Old', ...target })
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({
        id: POST_ID,
        ...target,
        originalUrl: TRACK,
        sourceService: 'SPOTIFY',
        linkPlatform: null,
        kind: 'TRACK',
        songTitle: 'Song',
        songArtist: 'Band',
        songCoverArtUrl: null,
        universalLinkSpotify: TRACK,
        universalLinkApple: null,
        universalLinkYoutube: null,
        universalLinkTidal: null,
        universalLinkDeezer: null,
        textComment: 'New',
        commentEditedAt: new Date('2026-11-08T10:00:00.000Z'),
        conversionPending: false,
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        updatedAt: new Date('2026-11-08T10:00:00.000Z'),
        recipientArchivedAt: null,
        author: { id: USER.id, displayName: 'Ofri', profilePictureUrl: null },
        recipient: fields.recipientId
          ? { id: RECIPIENT, displayName: 'Noam', profilePictureUrl: null }
          : null,
        bookmarks: [],
        ratings: [],
        community: fields.recipientId ? null : { id: COMMUNITY, name: 'Jazz' },
      });
  }

  beforeEach(() => {
    db.post.updateMany.mockResolvedValue({ count: 1 });
  });

  it('saves a changed comment, stamps it edited, and returns the post', async () => {
    // Arrange
    stored({});

    // Act
    const post = await editComment(AUTHOR, POST_ID, '  New  ');

    // Assert
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, authorId: USER.id },
      data: { textComment: 'New', commentEditedAt: expect.any(Date) },
    });
    expect(post).toMatchObject({
      id: POST_ID,
      comment: 'New',
      commentEditedAt: '2026-11-08T10:00:00.000Z',
    });
  });

  it('clears a blank comment to null, which still counts as an edit', async () => {
    // Arrange
    stored({});

    // Act
    await editComment(AUTHOR, POST_ID, '   ');

    // Assert
    expect(db.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { textComment: null, commentEditedAt: expect.any(Date) } }),
    );
  });

  it('writes nothing when the cleaned comment is unchanged', async () => {
    // Arrange
    stored({});

    // Act
    await editComment(AUTHOR, POST_ID, ' Old ');

    // Assert
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });

  it('lets the sender edit a direct item while they are friends', async () => {
    // Arrange
    stored({ communityId: null, recipientId: RECIPIENT });
    areFriends.mockResolvedValue(true);

    // Act
    await editComment(AUTHOR, POST_ID, 'New');

    // Assert
    expect(areFriends).toHaveBeenCalledWith(USER.id, RECIPIENT);
    expect(db.post.updateMany).toHaveBeenCalled();
  });

  it('refuses a direct item after unfriending', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({
      authorId: USER.id,
      communityId: null,
      recipientId: RECIPIENT,
      textComment: 'Old',
    });
    areFriends.mockResolvedValue(false);

    // Act & Assert
    await expectAppError(editComment(AUTHOR, POST_ID, 'New'), 403, EDIT_FRIENDS_ONLY);
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });

  it('refuses anyone but the author, an admin of the community included', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({
      authorId: 'someone-else',
      communityId: COMMUNITY,
      recipientId: null,
      textComment: 'Old',
    });
    db.communityMember.findUnique.mockResolvedValue({ role: 'ADMIN' });

    // Act & Assert
    await expectAppError(editComment(AUTHOR, POST_ID, 'New'), 403, AUTHOR_ONLY);
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown post and for a caller outside its community', async () => {
    // Arrange, Act & Assert — unknown
    db.post.findUnique.mockResolvedValue(null);
    await expectAppError(editComment(AUTHOR, POST_ID, 'New'), 404, POST_NOT_FOUND);

    // Arrange, Act & Assert — not a member
    db.post.findUnique.mockResolvedValue({
      authorId: USER.id,
      communityId: COMMUNITY,
      recipientId: null,
      textComment: 'Old',
    });
    db.communityMember.findUnique.mockResolvedValue(null);
    await expectAppError(editComment(AUTHOR, POST_ID, 'New'), 404, POST_NOT_FOUND);
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a too-long comment before reading anything, and a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(editComment(AUTHOR, POST_ID, 'x'.repeat(281)), 422);
    await expectAppError(editComment(MID_ONBOARDING, POST_ID, 'New'), 403);
    expect(db.post.findUnique).not.toHaveBeenCalled();
  });
});

/*
 * The request deadline and automatic retries — conversion-auto-retry.md §4.
 */

describe('the request deadline (§4.2)', () => {
  it('prepareSharedLink hands the caller’s deadline to the converter unchanged', async () => {
    // Arrange: a deadline already shortened by slow work before it.
    const deadline = Date.now() + 4_000;

    // Act
    await prepareSharedLinkAt({ url: TRACK }, deadline);

    // Assert
    expect(convertLink).toHaveBeenCalledWith(expect.any(String), 'SPOTIFY', deadline);
  });

  it('keeps the write reserve back from a link-only post’s metadata fetch', async () => {
    // Arrange
    fetchLinkMetadata.mockResolvedValue(FOUND);
    const deadline = Date.now() + 4_000;

    // Act
    await prepareSharedLinkAt({ url: SOUNDCLOUD }, deadline);

    // Assert
    expect(fetchLinkMetadata).toHaveBeenCalledWith('SOUNDCLOUD', SOUNDCLOUD, deadline - 1_500);
  });

  it('createPost passes it through to the conversion', async () => {
    // Arrange
    db.$queryRaw.mockResolvedValue([]);
    const deadline = Date.now() + 6_000;

    // Act
    await createPostAt(USER, COMMUNITY, { url: TRACK }, deadline).catch(() => undefined);

    // Assert
    expect(convertLink).toHaveBeenCalledWith(expect.any(String), 'SPOTIFY', deadline);
  });
});

describe('retryConversion — automatic (conversion-auto-retry.md §4.4)', () => {
  /** A full row, as Prisma returns it with postInclude, for the answer's serialisation. */
  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: POST_ID,
      authorId: USER.id,
      communityId: COMMUNITY,
      recipientId: null,
      recipientArchivedAt: null,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      linkPlatform: null,
      bandcampItemId: null,
      kind: null,
      songTitle: null,
      songArtist: null,
      songCoverArtUrl: null,
      universalLinkSpotify: null,
      universalLinkApple: null,
      universalLinkYoutube: null,
      universalLinkTidal: null,
      universalLinkDeezer: null,
      textComment: null,
      commentEditedAt: null,
      conversionPending: true,
      autoRetryCount: 0,
      createdAt: new Date('2026-11-24T10:00:00.000Z'),
      updatedAt: new Date('2026-11-24T10:00:00.000Z'),
      author: { id: USER.id, displayName: 'Dana', profilePictureUrl: null },
      recipient: null,
      bookmarks: [],
      ratings: [],
      ...overrides,
    };
  }

  const CLAIM = {
    where: { id: POST_ID, conversionPending: true, autoRetryCount: { lt: 4 } },
    data: { autoRetryCount: { increment: 1 } },
  };

  it('the author claims an attempt, it converts, and no automatic attempts are left to show', async () => {
    // Arrange
    db.post.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(
        row({ conversionPending: false, autoRetryCount: 1, songTitle: 'Song', kind: 'TRACK' }),
      );
    db.post.updateMany.mockResolvedValue({ count: 1 });

    // Act
    const post = await retryAt(USER, POST_ID, DEADLINE, true);

    // Assert
    expect(db.post.updateMany).toHaveBeenNthCalledWith(1, CLAIM);
    expect(convertLink).toHaveBeenCalledWith(expect.any(String), 'SPOTIFY', DEADLINE);
    expect(post).toMatchObject({ conversionPending: false, autoRetriesLeft: 0 });
  });

  it('still pending after the attempt: the count went up, so one fewer is left', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'unavailable', reason: 'timeout' });
    db.post.findUnique
      .mockResolvedValueOnce(row({ autoRetryCount: 1 }))
      .mockResolvedValueOnce(row({ autoRetryCount: 2 }));
    db.post.updateMany.mockResolvedValue({ count: 1 });

    // Act
    const post = await retryAt(USER, POST_ID, DEADLINE, true);

    // Assert
    expect(db.post.updateMany).toHaveBeenCalledTimes(1);
    expect(post).toMatchObject({ conversionPending: true, autoRetriesLeft: 2 });
  });

  it('a busy answer still spends the slot', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'unavailable', reason: 'busy' });
    db.post.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ autoRetryCount: 1 }));
    db.post.updateMany.mockResolvedValue({ count: 1 });

    // Act
    const post = await retryAt(USER, POST_ID, DEADLINE, true);

    // Assert
    expect(db.post.updateMany).toHaveBeenCalledWith(CLAIM);
    expect(post.autoRetriesLeft).toBe(3);
  });

  it.each([
    ['another member of the community', { authorId: 'someone-else' }],
    [
      'the recipient of a direct recommendation',
      { authorId: 'someone-else', communityId: null, recipientId: USER.id },
    ],
  ])('refuses %s with a 403, claiming and converting nothing', async (_who, owner) => {
    // Arrange
    db.post.findUnique.mockResolvedValue(row(owner));

    // Act & Assert
    await expectAppError(retryAt(USER, POST_ID, DEADLINE, true), 403, AUTO_RETRY_AUTHOR_ONLY);
    expect(db.post.updateMany).not.toHaveBeenCalled();
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('is a 429 with no attempts left, and converts nothing', async () => {
    // Arrange: the claim matches nothing, and the post is still pending.
    db.post.findUnique
      .mockResolvedValueOnce(row({ autoRetryCount: 4 }))
      .mockResolvedValueOnce({ conversionPending: true });
    db.post.updateMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(retryAt(USER, POST_ID, DEADLINE, true), 429, NO_AUTO_RETRIES_LEFT);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it.each([
    ['converted meanwhile', { conversionPending: false }, 409],
    ['deleted meanwhile', null, 404],
  ])('a claim that misses because the post was %s says so', async (_what, now, status) => {
    // Arrange
    db.post.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(now);
    db.post.updateMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(retryAt(USER, POST_ID, DEADLINE, true), status);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('is a 409 while an attempt for the same post is in flight, claiming no slot', async () => {
    // Arrange: the first attempt's conversion is held open.
    let finish: (value: unknown) => void = () => undefined;
    convertLink.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    db.post.findUnique.mockResolvedValue(row());
    db.post.updateMany.mockResolvedValue({ count: 1 });
    const first = retryAt(USER, POST_ID, DEADLINE, true);
    await vi.waitFor(() => expect(convertLink).toHaveBeenCalledTimes(1));

    // Act & Assert
    await expectAppError(retryAt(USER, POST_ID, DEADLINE, true), 409, AUTO_RETRY_IN_FLIGHT);
    expect(db.post.updateMany).toHaveBeenCalledTimes(1);

    // The first ends, and the post is free again.
    finish({ outcome: 'unavailable', reason: 'timeout' });
    await first;
    await expect(retryAt(USER, POST_ID, DEADLINE, true)).resolves.toBeDefined();
  });

  it('frees the post even when the claim fails', async () => {
    // Arrange
    db.post.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ conversionPending: true });
    db.post.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectAppError(retryAt(USER, POST_ID, DEADLINE, true), 429);

    // Act: the next attempt is not refused as in flight.
    db.post.findUnique.mockResolvedValue(row());
    db.post.updateMany.mockResolvedValue({ count: 1 });

    // Assert
    await expect(retryAt(USER, POST_ID, DEADLINE, true)).resolves.toBeDefined();
  });

  it.each([
    ['already converted', { conversionPending: false }],
    ['link-only', { sourceService: null, linkPlatform: 'SOUNDCLOUD', conversionPending: false }],
  ])('is a 409 on a post %s', async (_what, state) => {
    // Arrange
    db.post.findUnique.mockResolvedValue(row(state));

    // Act & Assert
    await expectAppError(retryAt(USER, POST_ID, DEADLINE, true), 409, ALREADY_CONVERTED);
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });

  it('a manual retry leaves the automatic count alone', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'unavailable', reason: 'timeout' });
    db.post.findUnique
      .mockResolvedValueOnce(row({ autoRetryCount: 1 }))
      .mockResolvedValueOnce(row({ autoRetryCount: 1 }));

    // Act
    const post = await retryAt(USER, POST_ID, DEADLINE);

    // Assert
    expect(db.post.updateMany).not.toHaveBeenCalled();
    expect(post.autoRetriesLeft).toBe(3);
  });
});
