import type { StreamingService } from '@prisma/client';

/**
 * Another user's Public Profile (docs/features/find-people.md §4). The one
 * place another user's preferred service is shown; still no account key,
 * name key, role or dates.
 */
export interface ProfileUser {
  id: string;
  displayName: string;
  profilePictureUrl: string | null;
  preferredService: StreamingService;
}

/** What Prisma must select for `toProfileUser` — and nothing more. */
export const profileUserSelect = {
  id: true,
  displayName: true,
  profilePictureUrl: true,
  preferredService: true,
} as const;

/** Field by field. Only onboarded users reach here, so name and service are set. */
export function toProfileUser(user: {
  id: string;
  displayName: string;
  profilePictureUrl: string | null;
  preferredService: StreamingService;
}): ProfileUser {
  return {
    id: user.id,
    displayName: user.displayName,
    profilePictureUrl: user.profilePictureUrl,
    preferredService: user.preferredService,
  };
}
