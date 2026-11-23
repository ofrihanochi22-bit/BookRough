import { prisma } from '../db/prisma.js';
import {
  adminCommunitySelect,
  toAdminCommunity,
  adminUserSelect,
  toAdminUser,
  type AdminCommunity,
  type AdminUser,
} from '../utils/adminViews.js';

/**
 * The admin area's read-only lists (docs/features/admin-panel.md §4.2–4.3).
 * Callers are already gated by requireAppAdmin. The selects list exactly the
 * columns the views need, so nothing else is even read.
 */

export async function listUsers(): Promise<AdminUser[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: adminUserSelect,
  });
  return users.map(toAdminUser);
}

export async function listCommunities(): Promise<AdminCommunity[]> {
  const communities = await prisma.community.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: adminCommunitySelect,
  });
  return communities.map(toAdminCommunity);
}
