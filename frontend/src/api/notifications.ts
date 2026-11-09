import { api, type SuccessBody } from './client';

/** Every caller shows its own outcome, so no global error toast. */
const quiet = { skipErrorToast: true } as const;

export type NotificationType =
  | 'COMMUNITY_POSTS'
  | 'RECOMMENDATION'
  | 'RATING'
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'COMMUNITY_INVITATION'
  | 'COMMUNITY_ADMIN'
  | 'COMMUNITY_OWNER'
  | 'COMMENT_REPLY';

/** docs/features/notifications.md §4 (UC-21). */
export interface PublicNotification {
  id: string;
  type: NotificationType;
  at: string;
  read: boolean;
  actor: { id: string; displayName: string; profilePictureUrl: string | null };
  community: { id: string; name: string } | null;
  post: { id: string; title: string | null } | null;
  count: number;
  score: number | null;
}

export interface NotificationsPage {
  items: PublicNotification[];
  nextCursor: string | null;
}

export async function listNotifications(before?: string): Promise<NotificationsPage> {
  const response = await api.get<SuccessBody<NotificationsPage>>('/notifications', {
    ...quiet,
    params: before ? { before } : undefined,
  });
  return response.data.data;
}

export async function countUnreadNotifications(): Promise<number> {
  const response = await api.get<SuccessBody<{ count: number }>>(
    '/notifications/unread-count',
    quiet,
  );
  return response.data.data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${encodeURIComponent(id)}/read`, undefined, quiet);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all', undefined, quiet);
}
