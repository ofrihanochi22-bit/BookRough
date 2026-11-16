import { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listBookmarks } from './bookmarks';
import { api } from './client';
import { listComments } from './comments';
import { getCommunity, listMyCommunities } from './communities';
import { listFriendRequests, listFriends } from './friends';
import { listMyInvitations } from './invitations';
import { listNotifications } from './notifications';
import { getPost, listPosts } from './posts';
import { getProfile, listProfileRatings } from './profiles';
import { listPostRatings } from './ratings';
import { listReceived, listSent } from './recommendations';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

/**
 * Every loader a screen caches by key (client-cache.md §3.1). A refresh behind
 * cached data may fail offline on every visit; these loaders must skip the
 * global toast, because each screen shows its own error state instead (§5.1).
 */
const CACHED_LOADERS: [string, () => Promise<unknown>][] = [
  ['listMyCommunities', () => listMyCommunities()],
  ['getCommunity', () => getCommunity('c1')],
  ['listPosts', () => listPosts('c1')],
  ['listBookmarks', () => listBookmarks()],
  ['listNotifications', () => listNotifications()],
  ['listReceived', () => listReceived()],
  ['listSent', () => listSent()],
  ['listFriends', () => listFriends()],
  ['listFriendRequests', () => listFriendRequests()],
  ['listMyInvitations', () => listMyInvitations()],
  ['getPost', () => getPost('p1')],
  ['listPostRatings', () => listPostRatings('p1')],
  ['listComments', () => listComments('p1')],
  ['getProfile', () => getProfile('u1')],
  ['listProfileRatings', () => listProfileRatings('u1')],
];

beforeEach(() => {
  vi.clearAllMocks();
  api.defaults.adapter = async (config) => {
    throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
  };
});

afterEach(() => {
  delete api.defaults.adapter;
});

describe('cached loaders stay quiet (client-cache.md §5.1)', () => {
  it.each(CACHED_LOADERS)('%s shows no toast when the network fails', async (_name, load) => {
    // Arrange (beforeEach: no network)

    // Act
    await expect(load()).rejects.toBeInstanceOf(AxiosError);

    // Assert
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });
});
