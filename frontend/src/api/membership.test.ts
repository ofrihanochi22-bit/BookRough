import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makeCommunity } from '../test/fixtures';
import { api } from './client';
import {
  changeRole,
  deleteCommunity,
  leaveCommunity,
  listBlocked,
  listMembers,
  removeMember,
  transferOwnership,
  unblockUser,
  updateCommunity,
} from './membership';

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
const call = (config: InternalAxiosRequestConfig) => `${config.method} ${config.url}`;

afterEach(() => {
  delete api.defaults.adapter;
});

describe('membership API module', () => {
  it('reads members and the blocked list, unwrapping each', async () => {
    // Arrange
    const seen = respondWith(ok({ members: ['m'], blocked: ['b'] }));

    // Act
    const members = await listMembers('c-1');
    const blocked = await listBlocked('c-1');

    // Assert
    expect(members).toEqual(['m']);
    expect(blocked).toEqual(['b']);
    expect(seen.map(call)).toEqual(['get /communities/c-1/members', 'get /communities/c-1/bans']);
  });

  it('addresses every write to the right endpoint, all without the global toast', async () => {
    // Arrange
    const seen = respondWith(ok({ member: {}, community: makeCommunity() }));

    // Act
    await leaveCommunity('c-1');
    await removeMember('c-1', 'u/2');
    await changeRole('c-1', 'u-2', 'ADMIN');
    await transferOwnership('c-1', 'u-2');
    await unblockUser('c-1', 'u-2');
    await updateCommunity('c-1', { name: 'New' });
    await deleteCommunity('c-1');

    // Assert
    expect(seen.map(call)).toEqual([
      'delete /communities/c-1/members/me',
      'delete /communities/c-1/members/u%2F2',
      'patch /communities/c-1/members/u-2',
      'post /communities/c-1/ownership',
      'delete /communities/c-1/bans/u-2',
      'patch /communities/c-1',
      'delete /communities/c-1',
    ]);
    expect(JSON.parse(seen[2]!.data as string)).toEqual({ role: 'ADMIN' });
    expect(JSON.parse(seen[3]!.data as string)).toEqual({ userId: 'u-2' });
    expect(seen.every((config) => config.skipErrorToast)).toBe(true);
  });
});
