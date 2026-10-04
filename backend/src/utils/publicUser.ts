import type { StreamingService, User } from '@prisma/client';

/** The only user shape that ever leaves the server (CLAUDE.md §5). */
export interface PublicUser {
  id: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  preferredService: StreamingService | null;
  createdAt: string;
}

/**
 * Field by field, never a spread: a column added to `users` later must not
 * reach a client until someone adds it here on purpose. `googleSub`,
 * `displayNameKey`, `role` and `updatedAt` are deliberately absent.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    profilePictureUrl: user.profilePictureUrl,
    preferredService: user.preferredService,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Onboarding state is derived from the profile columns, not stored. */
export function needsOnboarding(user: User): boolean {
  return user.displayName === null || user.preferredService === null;
}

/** Whether this user may use the administrative area (docs/features/admin-panel.md §4). */
export function isAppAdmin(user: User): boolean {
  return user.role === 'ADMIN' && !needsOnboarding(user);
}

/**
 * The body every session-returning endpoint sends. `isAdmin` is the caller's
 * own flag only — no other user's role leaves the server outside the admin area.
 */
export function sessionPayload(user: User) {
  return {
    user: toPublicUser(user),
    needsOnboarding: needsOnboarding(user),
    isAdmin: isAppAdmin(user),
  };
}
