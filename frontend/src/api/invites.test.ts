import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makeCommunity } from '../test/fixtures';
import { api } from './client';
import { acceptInvite, getInvite, inviteUrl, previewInvite, resetInvite } from './invites';

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

afterEach(() => {
  delete api.defaults.adapter;
});

describe('invites API module', () => {
  it('getInvite and resetInvite address the community and unwrap the token', async () => {
    // Arrange
    const seen = respondWith(ok({ invite: { token: 'tok' } }));

    // Act
    const loaded = await getInvite('c-1');
    const reset = await resetInvite('c-1');

    // Assert
    expect(loaded).toEqual({ token: 'tok' });
    expect(reset).toEqual({ token: 'tok' });
    expect(seen.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'get /communities/c-1/invite',
      'post /communities/c-1/invite/reset',
    ]);
    expect(seen.every((config) => config.skipErrorToast)).toBe(true);
  });

  it('previewInvite and acceptInvite address the token', async () => {
    // Arrange
    const preview = { communityId: 'c-1', name: 'Jazz', memberCount: 1, alreadyMember: false };
    const seen = respondWith(ok({ invite: preview }));

    // Act
    const result = await previewInvite('tok');
    respondWith(ok({ community: makeCommunity(), joined: true }));
    const accepted = await acceptInvite('tok');

    // Assert
    expect(result).toEqual(preview);
    expect(accepted.joined).toBe(true);
    expect(seen[0]).toMatchObject({ method: 'get', url: '/invites/tok', skipErrorToast: true });
  });

  it('inviteUrl builds the link from the current origin', () => {
    // Act & Assert
    expect(inviteUrl('tok')).toBe(`${window.location.origin}/invite/tok`);
  });
});
