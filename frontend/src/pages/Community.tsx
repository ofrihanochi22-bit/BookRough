import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { getCommunity } from '../api/communities';
import { CommunityFeed } from '../components/CommunityFeed';
import { InvitePanel } from '../components/InvitePanel';
import { LoadError } from '../components/ui/LoadError';
import { CommunityCover } from '../components/ui/CommunityCover';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { CHIP } from '../components/ui/chip';
import { LineIcon } from '../components/ui/LineIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useRequest } from '../hooks/useRequest';
import { membershipLine, sharedAt } from '../lib/communityCopy';
import { isAdmin } from '../lib/communityRoles';
import { NotFound } from './NotFound';

/**
 * A community's page — docs/features/communities-create.md §6.6, with its feed
 * (docs/features/posts-feed.md §5.1). A community the user cannot see renders
 * the standard not-found page, never "you're not a member".
 */
export function Community() {
  const { id = '' } = useParams();
  const load = useCallback(() => getCommunity(id), [id]);
  const community = useRequest(load);
  const location = useLocation();
  const navigate = useNavigate();
  // Access lost while on the page (removed, or the community deleted). Kept
  // per id: the same instance renders the next community after Back/Forward.
  const [goneId, setGoneId] = useState<string | null>(null);
  const markGone = useCallback(() => setGoneId(id), [id]);
  // Right after creating, the invite panel opens once by itself (communities-invites.md §5.5).
  const [inviting, setInviting] = useState(
    () => (location.state as { justCreated?: boolean } | null)?.justCreated === true,
  );

  function closeInvite() {
    setInviting(false);
    // Drop the router state, so a reload or Back does not open the panel again.
    if (location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }

  if (
    goneId === id ||
    (community.status === 'error' &&
      isAxiosError(community.error) &&
      community.error.response?.status === 404)
  ) {
    return <NotFound />;
  }

  const ready = community.status === 'ready' ? community.data : null;

  return (
    <ScreenLayout>
      <TopBar back={{ to: '/home', label: 'Communities' }} />

      {community.status === 'loading' && (
        <div role="status" aria-label="Loading the community" className="flex flex-col gap-4">
          {/* A banner-shaped block and two posts (ui-redesign.md §5.2). */}
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      )}

      {community.status === 'error' && (
        <LoadError message="Couldn't load this community." onRetry={community.reload} />
      )}

      {ready && (
        <article className="flex flex-col gap-4">
          {/* The name on the label is the page's h1 (ui-redesign.md §5.2). */}
          <CommunityCover id={ready.id} name={ready.name} variant="banner" label="h1" />
          <div className="flex flex-col gap-2">
            {ready.description && (
              <p className="whitespace-pre-line break-words text-sm">{ready.description}</p>
            )}
            <p className="text-xs text-muted">{membershipLine(ready)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin(ready.myRole) && (
              <button type="button" className={CHIP} onClick={() => setInviting(true)}>
                <LineIcon>
                  <circle cx="9" cy="8" r="3.5" />
                  <path d="M2.5 20c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8M19 8v6M16 11h6" />
                </LineIcon>
                Invite friends
              </button>
            )}
            <Link to={`/communities/${ready.id}/settings`} className={CHIP}>
              <LineIcon>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
              </LineIcon>
              Settings
            </Link>
          </div>
          {/* Keyed by community: the same page instance can show another community
              (Back/Forward, or a post from the Share sheet), and a draft typed for
              one must never be posted to the next. */}
          <CommunityFeed
            key={ready.id}
            communityId={ready.id}
            onGone={markGone}
            refreshKey={sharedAt(location.state)}
          />
        </article>
      )}

      {inviting && ready && isAdmin(ready.myRole) && (
        <InvitePanel communityId={ready.id} communityName={ready.name} onClose={closeInvite} />
      )}
    </ScreenLayout>
  );
}
