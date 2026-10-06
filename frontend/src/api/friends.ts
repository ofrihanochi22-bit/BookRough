import { api, type SuccessBody } from './client';
import type { MemberUser } from './membership';

/** The viewer's relation to another user (docs/features/friend-requests.md §4). */
export type Friendship = 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIENDS';

/** Mirrors the backend's FriendView: a friend, or a request to you. */
export interface FriendView {
  user: MemberUser;
  /** For a friend, when it was accepted; for a request, when it was sent. */
  since: string;
}

/** Every caller shows its own outcome, so no global error toast. */
const quiet = { skipErrorToast: true } as const;
const path = (userId: string) => encodeURIComponent(userId);

export async function sendFriendRequest(userId: string): Promise<Friendship> {
  const response = await api.post<SuccessBody<{ friendship: Friendship }>>(
    '/friends/requests',
    { userId },
    quiet,
  );
  return response.data.data.friendship;
}

export async function cancelFriendRequest(userId: string): Promise<Friendship> {
  const response = await api.delete<SuccessBody<{ friendship: Friendship }>>(
    `/friends/requests/sent/${path(userId)}`,
    quiet,
  );
  return response.data.data.friendship;
}

export async function acceptFriendRequest(userId: string): Promise<FriendView> {
  const response = await api.post<SuccessBody<{ friend: FriendView }>>(
    `/friends/requests/${path(userId)}/accept`,
    undefined,
    quiet,
  );
  return response.data.data.friend;
}

export async function ignoreFriendRequest(userId: string): Promise<void> {
  await api.post(`/friends/requests/${path(userId)}/ignore`, undefined, quiet);
}

export async function listFriends(): Promise<FriendView[]> {
  const response = await api.get<SuccessBody<{ friends: FriendView[] }>>('/friends', quiet);
  return response.data.data.friends;
}

export async function listFriendRequests(): Promise<FriendView[]> {
  const response = await api.get<SuccessBody<{ requests: FriendView[] }>>(
    '/friends/requests',
    quiet,
  );
  return response.data.data.requests;
}

export async function countFriendRequests(): Promise<number> {
  const response = await api.get<SuccessBody<{ count: number }>>('/friends/requests/count', quiet);
  return response.data.data.count;
}
