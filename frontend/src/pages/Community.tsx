import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { getCommunity } from '../api/communities';
import { LoadError } from '../components/ui/LoadError';
import { CommunityCover } from '../components/ui/CommunityCover';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { useRequest } from '../hooks/useRequest';
import { membershipLine } from '../lib/communityCopy';
import { NotFound } from './NotFound';

/**
 * A community's page — docs/features/communities-create.md §6.6. A shell until
 * posts arrive in Phase 3. A community the user cannot see renders the
 * standard not-found page, never "you're not a member".
 */
export function Community() {
  const { id = '' } = useParams();
  const load = useCallback(() => getCommunity(id), [id]);
  const community = useRequest(load);

  if (
    community.status === 'error' &&
    isAxiosError(community.error) &&
    community.error.response?.status === 404
  ) {
    return <NotFound />;
  }

  return (
    <ScreenLayout>
      <Link
        to="/home"
        className="-ml-2 mb-4 flex min-h-11 w-fit items-center px-2 text-sm text-muted"
      >
        ← Communities
      </Link>

      {community.status === 'loading' && (
        <div role="status" aria-label="Loading the community" className="flex flex-col gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      )}

      {community.status === 'error' && (
        <LoadError message="Couldn't load this community." onRetry={community.reload} />
      )}

      {community.status === 'ready' && (
        <article className="flex flex-col gap-4">
          <CommunityCover id={community.data.id} name={community.data.name} variant="banner" />
          <div className="flex flex-col gap-2">
            <h1 className="break-words font-display text-2xl font-medium">{community.data.name}</h1>
            {community.data.description && (
              <p className="whitespace-pre-line break-words text-sm">
                {community.data.description}
              </p>
            )}
            <p className="text-xs text-muted">{membershipLine(community.data)}</p>
          </div>
          <section className="mt-4 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">Posts are coming soon</p>
            <p className="mt-1 text-sm text-muted">
              This is where your community will share music.
            </p>
          </section>
        </article>
      )}
    </ScreenLayout>
  );
}
