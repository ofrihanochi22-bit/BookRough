import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheSequence, getCached, setCached } from '../lib/requestCache';
import { deleteAdminCommunity, deleteAdminUser, removeUserPhoto } from './admin';
import { logout, signInWithGoogle } from './auth';
import { removeBookmark, saveBookmark } from './bookmarks';
import { api } from './client';
import { addComment, deleteComment, editComment } from './comments';
import { createCommunity } from './communities';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  ignoreFriendRequest,
  removeFriend,
  sendFriendRequest,
} from './friends';
import {
  acceptInvitation,
  cancelInvitation,
  declineInvitation,
  inviteFriends,
} from './invitations';
import { acceptInvite, resetInvite } from './invites';
import {
  changeRole,
  deleteCommunity,
  leaveCommunity,
  removeMember,
  transferOwnership,
  unblockUser,
  updateCommunity,
} from './membership';
import { markAllNotificationsRead, markNotificationRead } from './notifications';
import { createPost, deletePost, editPostComment, retryConversion } from './posts';
import { editRating, ratePost } from './ratings';
import {
  archiveRecommendation,
  unarchiveRecommendation,
  markChecked,
  markRecommendationsSeen,
  sendRecommendation,
  unmarkChecked,
} from './recommendations';
import { updateAdminSettings } from './settings';
import { chooseGooglePhoto, markTutorialSeen, updateProfile, uploadAvatar } from './users';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

/** Every source file in this folder, as text, for the completeness check. */
const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** One cached entry of every kind, for one community, post and user. */
const UNIVERSE = [
  'communities',
  'community:c1',
  'feed:c1',
  'myList',
  'notifications',
  'recs:received',
  'recs:sent',
  'recs:community',
  'recs:communityCount',
  'friends',
  'friendList',
  'post:p1',
  'postRatings:p1',
  'comments:p1',
  'profile:u1',
  'profileRatings:u1',
] as const;

const AVATARS = [
  'feed:c1',
  'recs:received',
  'recs:sent',
  'recs:community',
  'recs:communityCount',
  'friends',
  'friendList',
  'post:p1',
  'postRatings:p1',
  'comments:p1',
  'profile:u1',
  'profileRatings:u1',
];
const COMMUNITY = ['communities', 'community:c1', 'feed:c1'];
const FRIENDS = ['friends', 'friendList', 'notifications', 'profile:u1'];
const POST_CHANGE = [
  'post:p1',
  'feed:c1',
  'profile:u1',
  'profileRatings:u1',
  'myList',
  'recs:received',
  'recs:sent',
  'recs:community',
  'recs:communityCount',
];
const RATING = [
  'feed:c1',
  'post:p1',
  'postRatings:p1',
  'recs:received',
  'recs:sent',
  'recs:community',
  'recs:communityCount',
  'profile:u1',
  'profileRatings:u1',
  'myList',
];
const BOOKMARK = [
  'myList',
  'feed:c1',
  'post:p1',
  'recs:received',
  'recs:sent',
  'recs:community',
  'recs:communityCount',
];

const SESSION = {
  user: {
    id: 'u1',
    displayName: 'Ofri',
    profilePictureUrl: null,
    preferredService: 'SPOTIFY',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  needsOnboarding: false,
  isAdmin: false,
};

/** Every write, the call that makes it, and exactly the keys it removes (spec §3.4). */
const WRITES: [string, () => Promise<unknown>, readonly string[]][] = [
  ['removeUserPhoto', () => removeUserPhoto('u1'), AVATARS],
  // An admin's delete may touch any list (admin-delete.md): every key goes.
  ['deleteAdminUser', () => deleteAdminUser('u2'), UNIVERSE],
  ['deleteAdminCommunity', () => deleteAdminCommunity('c2'), UNIVERSE],
  ['saveBookmark', () => saveBookmark('p1'), BOOKMARK],
  ['removeBookmark', () => removeBookmark('p1'), BOOKMARK],
  [
    'addComment',
    () => addComment('p1', { body: 'hi' } as never),
    ['comments:p1', 'post:p1', 'feed:c1'],
  ],
  ['editComment', () => editComment('m1', 'hi'), ['comments:p1', 'post:p1', 'feed:c1']],
  ['deleteComment', () => deleteComment('m1'), ['comments:p1', 'post:p1', 'feed:c1']],
  ['createCommunity', () => createCommunity({ name: 'n', description: null }), ['communities']],
  ['sendFriendRequest', () => sendFriendRequest('u2'), FRIENDS],
  ['cancelFriendRequest', () => cancelFriendRequest('u2'), FRIENDS],
  ['acceptFriendRequest', () => acceptFriendRequest('u2'), FRIENDS],
  ['ignoreFriendRequest', () => ignoreFriendRequest('u2'), FRIENDS],
  ['removeFriend', () => removeFriend('u2'), FRIENDS],
  ['inviteFriends', () => inviteFriends('c1', ['u2']), []],
  ['cancelInvitation', () => cancelInvitation('c1', 'u2'), []],
  ['acceptInvitation', () => acceptInvitation('c1'), ['communities', 'notifications', 'friends']],
  ['declineInvitation', () => declineInvitation('c1'), ['notifications', 'friends']],
  ['resetInvite', () => resetInvite('c1'), []],
  ['acceptInvite', () => acceptInvite('token'), ['communities', 'notifications', 'friends']],
  ['leaveCommunity', () => leaveCommunity('c1'), COMMUNITY],
  ['removeMember', () => removeMember('c1', 'u2'), COMMUNITY],
  ['changeRole', () => changeRole('c1', 'u2', 'ADMIN'), COMMUNITY],
  ['transferOwnership', () => transferOwnership('c1', 'u2'), COMMUNITY],
  ['unblockUser', () => unblockUser('c1', 'u2'), COMMUNITY],
  ['updateCommunity', () => updateCommunity('c1', { name: 'n' } as never), COMMUNITY],
  [
    'deleteCommunity',
    () => deleteCommunity('c1'),
    [
      ...COMMUNITY,
      'notifications',
      'myList',
      'recs:received',
      'recs:sent',
      'recs:community',
      'recs:communityCount',
    ],
  ],
  ['markNotificationRead', () => markNotificationRead('n1'), ['notifications']],
  ['markAllNotificationsRead', () => markAllNotificationsRead(), ['notifications']],
  [
    'createPost',
    () => createPost('c1', { url: 'x' } as never),
    ['feed:c1', 'profile:u1', 'profileRatings:u1'],
  ],
  ['editPostComment', () => editPostComment('p1', null), POST_CHANGE],
  ['retryConversion', () => retryConversion('p1'), POST_CHANGE],
  ['deletePost', () => deletePost('p1'), POST_CHANGE],
  ['ratePost', () => ratePost('p1', { score: 8 } as never), RATING],
  ['editRating', () => editRating('p1', { score: 8 } as never), RATING],
  [
    'sendRecommendation',
    () => sendRecommendation('u2', { url: 'x' } as never),
    [
      'recs:received',
      'recs:sent',
      'recs:community',
      'recs:communityCount',
      'recs:archived',
      'recs:archivedCount',
    ],
  ],
  ['markRecommendationsSeen', () => markRecommendationsSeen(), []],
  ['markChecked', () => markChecked('p1'), ['recs:community', 'recs:communityCount']],
  ['unmarkChecked', () => unmarkChecked('p1'), ['recs:community', 'recs:communityCount']],
  [
    'archiveRecommendation',
    () => archiveRecommendation('p1'),
    [
      'recs:received',
      'recs:sent',
      'recs:community',
      'recs:communityCount',
      'recs:archived',
      'recs:archivedCount',
    ],
  ],
  [
    'unarchiveRecommendation',
    () => unarchiveRecommendation('p1'),
    [
      'recs:received',
      'recs:sent',
      'recs:community',
      'recs:communityCount',
      'recs:archived',
      'recs:archivedCount',
    ],
  ],
  ['updateAdminSettings', () => updateAdminSettings({} as never), []],
  ['updateProfile', () => updateProfile({} as never), AVATARS],
  ['uploadAvatar', () => uploadAvatar(new Blob()), AVATARS],
  ['chooseGooglePhoto', () => chooseGooglePhoto('credential'), AVATARS],
  ['markTutorialSeen', () => markTutorialSeen('walkthrough'), []],
  ['signInWithGoogle', () => signInWithGoogle('credential', 'signin'), UNIVERSE],
  ['logout', () => logout(), UNIVERSE],
];

/** Answers every request with a body generous enough for any module's unwrapping. */
function succeed(): void {
  const adapter: AxiosAdapter = async (config) => ({
    data: {
      status: 'success',
      data: {
        ...SESSION,
        community: {},
        member: {},
        post: {},
        rating: {},
        comment: {},
        friendship: {},
        friend: {},
        candidates: [],
        invite: {},
        user: SESSION.user,
        tutorial: {},
        deleted: 'removed',
      },
    },
    status: 200,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
  });
  api.defaults.adapter = adapter;
}

function fail(): void {
  api.defaults.adapter = async (config) => {
    throw new AxiosError('down', AxiosError.ERR_BAD_RESPONSE, config, null, {
      data: { status: 'error', code: 500, message: 'down' },
      status: 500,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
    });
  };
}

function remaining(): string[] {
  return UNIVERSE.filter((key) => getCached(key) !== undefined);
}

beforeEach(() => {
  for (const key of UNIVERSE) {
    setCached(key, key, false, cacheSequence());
  }
});

afterEach(() => {
  delete api.defaults.adapter;
});

describe('invalidation map (client-cache.md §3.4)', () => {
  it('every write in api/ declares what it invalidates', () => {
    // Arrange
    const writes = /api\.(post|put|patch|delete)\b/;
    const missing: string[] = [];

    // Act
    for (const [file, source] of Object.entries(sources)) {
      const functions = source.split(/\n(?=export (?:async )?function )/);
      for (const fn of functions) {
        if (writes.test(fn) && !/invalidate\(|wipeCache\(/.test(fn)) {
          missing.push(`${file}: ${fn.slice(0, fn.indexOf('(')).replace('export ', '')}`);
        }
      }
    }

    // Assert
    expect(missing).toEqual([]);
  });

  it('the table below covers every write in api/', () => {
    // Arrange
    const names = new Set<string>();
    for (const source of Object.values(sources)) {
      for (const fn of source.split(/\n(?=export (?:async )?function )/)) {
        const name = /^export (?:async )?function (\w+)/.exec(fn.trimStart())?.[1];
        if (name && /api\.(post|put|patch|delete)\b/.test(fn)) {
          names.add(name);
        }
      }
    }

    // Act
    const covered = new Set(WRITES.map(([name]) => name));

    // Assert
    expect([...names].filter((name) => !covered.has(name))).toEqual([]);
  });

  it.each(WRITES)('%s invalidates exactly its keys', async (_name, call, removed) => {
    // Arrange
    succeed();

    // Act
    await call();

    // Assert
    expect(remaining()).toEqual(UNIVERSE.filter((key) => !removed.includes(key)));
  });

  it('a failed write invalidates nothing', async () => {
    // Arrange
    fail();

    // Act
    await expect(saveBookmark('p1')).rejects.toBeInstanceOf(AxiosError);

    // Assert
    expect(remaining()).toEqual([...UNIVERSE]);
  });
});
