import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { MemberUser } from '../api/membership';
import { profilePath } from '../lib/profileLinks';
import { useAuthStore } from '../stores/auth';
import { Avatar } from './ui/Avatar';

interface PersonLinkProps {
  user: MemberUser;
  /** What the name reads as, e.g. "You". Defaults to the display name. */
  label?: ReactNode;
  avatarSize?: number;
  className?: string;
}

/**
 * A person's avatar and name as one link to their profile, at least 44 px tall
 * (docs/features/find-people.md §5.3). Takes the free width of its row.
 */
export function PersonLink({ user, label, avatarSize = 32, className = '' }: PersonLinkProps) {
  const viewerId = useAuthStore((state) => state.user?.id);
  return (
    <Link
      to={profilePath(user.id, viewerId)}
      className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 ${className}`}
    >
      <Avatar
        id={user.id}
        name={user.displayName}
        pictureUrl={user.profilePictureUrl}
        size={avatarSize}
        decorative
      />
      <span className="min-w-0 truncate">{label ?? user.displayName}</span>
    </Link>
  );
}
