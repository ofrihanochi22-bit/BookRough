import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import {
  acceptInvitation,
  cancelInvitation,
  countMyInvitations,
  declineInvitation,
  inviteFriends,
  listCandidates,
  listMyInvitations,
} from './invitations';

function respondWith(data: unknown): InternalAxiosRequestConfig[] {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data, status: 200, statusText: '', headers: new AxiosHeaders(), config };
  };
  api.defaults.adapter = adapter;
  return seen;
}

const ok = (data: unknown) => ({ status: 'success', data });
const C = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';
const U = 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

afterEach(() => {
  delete api.defaults.adapter;
});

describe('invitations API module', () => {
  it('the admin calls hit the community, quietly, and return the candidates', async () => {
    // Arrange
    const candidates = [
      { user: { id: U, displayName: 'Dana', profilePictureUrl: null }, status: 'INVITED' },
    ];
    const seen = respondWith(ok({ candidates }));

    // Act
    const listed = await listCandidates(C);
    const invited = await inviteFriends(C, [U]);
    const cancelled = await cancelInvitation(C, U);

    // Assert
    expect([listed, invited, cancelled]).toEqual([candidates, candidates, candidates]);
    expect(seen.map((config) => [config.method, config.url])).toEqual([
      ['get', `/communities/${C}/invitations/candidates`],
      ['post', `/communities/${C}/invitations`],
      ['delete', `/communities/${C}/invitations/${U}`],
    ]);
    expect(JSON.parse(seen[1]!.data as string)).toEqual({ userIds: [U] });
    expect(seen.every((config) => config.skipErrorToast)).toBe(true);
  });

  it('the invitee calls hit /invitations and unwrap their payloads', async () => {
    // Arrange
    const seen = respondWith(ok({ invitations: [], count: 2 }));

    // Act
    const mine = await listMyInvitations();
    const count = await countMyInvitations();
    await acceptInvitation(C);
    await declineInvitation(C);

    // Assert
    expect(mine).toEqual([]);
    expect(count).toBe(2);
    expect(seen.map((config) => config.url)).toEqual([
      '/invitations',
      '/invitations/count',
      `/invitations/${C}/accept`,
      `/invitations/${C}/decline`,
    ]);
  });
});
