import { Link } from 'react-router-dom';

import { CREATE_COMMUNITY_PATH } from '../lib/communityCopy';

/**
 * The "Create community" pill of an empty community list — Home's empty state
 * and the Share sheet's (ui-redesign.md §5.0b, §5.1). One accent pill, so the
 * two never drift apart.
 */
export function CreateCommunityLink({
  onClick,
  className = '',
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      to={CREATE_COMMUNITY_PATH}
      onClick={onClick}
      className={`flex min-h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-on-accent ${className}`}
    >
      Create community
    </Link>
  );
}
