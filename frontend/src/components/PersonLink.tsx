import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { MemberUser } from '../api/membership';
import { profilePath } from '../lib/profileLinks';
import { useAuthStore } from '../stores/auth';
import { Avatar } from './ui/Avatar';

interface PersonIdentityProps {
  user: MemberUser;
  /** What the name reads as, e.g. "You". Defaults to the display name. */
  label?: ReactNode;
  avatarSize?: number;
}

/** A person's avatar and truncating name, the inside of every person row. */
function PersonIdentity({ user, label, avatarSize = 32 }: PersonIdentityProps) {
  return (
    <>
      <Avatar
        id={user.id}
        name={user.displayName}
        pictureUrl={user.profilePictureUrl}
        size={avatarSize}
        decorative
      />
      <span className="min-w-0 truncate">{label ?? <bdi>{user.displayName}</bdi>}</span>
    </>
  );
}

const ROW = 'flex min-h-11 min-w-0 flex-1 items-center gap-3';

interface PersonLinkProps extends PersonIdentityProps {
  className?: string;
}

/**
 * A person's avatar and name as one link to their profile, at least 44 px tall
 * (docs/features/find-people.md §5.3). Takes the free width of its row.
 */
export function PersonLink({ className = '', ...identity }: PersonLinkProps) {
  const viewerId = useAuthStore((state) => state.user?.id);
  return (
    <Link to={profilePath(identity.user.id, viewerId)} className={`${ROW} ${className}`}>
      <PersonIdentity {...identity} />
    </Link>
  );
}

/**
 * The same avatar and name as plain text, for rows inside a form or picker,
 * where a profile link would leave the screen (invite-friends.md §5.1).
 */
export function PersonName({ className = '', ...identity }: PersonLinkProps) {
  return (
    <span className={`${ROW} ${className}`}>
      <PersonIdentity {...identity} />
    </span>
  );
}
