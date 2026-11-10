import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listMyCommunities, type PublicCommunity } from '../api/communities';
import { useRequest } from '../hooks/useRequest';
import {
  COMMUNITIES_LOAD_FAILED,
  NO_COMMUNITIES_BODY,
  NO_COMMUNITIES_TITLE,
  type SharedPostState,
} from '../lib/communityCopy';
import { CreateCommunityLink } from './CreateCommunityLink';
import { PostComposer } from './PostComposer';
import { SendRecommendationSheet } from './SendRecommendationSheet';
import { CommunityCover } from './ui/CommunityCover';
import { EmptyState } from './ui/EmptyState';
import { LoadError } from './ui/LoadError';
import { Sheet } from './ui/Sheet';
import { Skeleton } from './ui/Skeleton';
import { TAPE_PAPER } from './ui/tape';

interface ShareSheetProps {
  online: boolean;
  onClose: () => void;
}

type Step =
  | { name: 'choose' }
  | { name: 'friend' }
  | { name: 'communities' }
  | { name: 'compose'; community: PublicCommunity };

const tile =
  'flex min-h-11 w-full flex-col items-start gap-1 rounded-[22px] px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Step 3: your communities, each with a mini cassette in its own hue. */
function ChooseCommunity({
  onPick,
  onCreate,
}: {
  onPick: (community: PublicCommunity) => void;
  onCreate: () => void;
}) {
  const communities = useRequest(listMyCommunities);

  if (communities.status === 'loading') {
    return (
      <div role="status" aria-label="Loading your communities" className="flex flex-col gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }
  if (communities.status === 'error') {
    return <LoadError message={COMMUNITIES_LOAD_FAILED} onRetry={communities.reload} />;
  }
  if (communities.data.length === 0) {
    return (
      <EmptyState
        title={NO_COMMUNITIES_TITLE}
        action={<CreateCommunityLink onClick={onCreate} className="mt-1" />}
      >
        {NO_COMMUNITIES_BODY}
      </EmptyState>
    );
  }
  return (
    <ul aria-label="Your communities" className="flex flex-col gap-1">
      {communities.data.map((community) => (
        <li key={community.id}>
          <button
            type="button"
            onClick={() => onPick(community)}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left font-medium"
          >
            <div className="w-14 shrink-0">
              <CommunityCover id={community.id} name={community.name} variant="thumb" />
            </div>
            <span className="min-w-0 truncate">{community.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Share sheet behind the tab bar's central button —
 * docs/features/ui-redesign.md §5.0b. A new way into two existing flows: the
 * community composer (`PostComposer`) and the send sheet
 * (`SendRecommendationSheet`). Nothing new is sent to the server. The back
 * arrow returns one step.
 */
export function ShareSheet({ online, onClose }: ShareSheetProps) {
  const [step, setStep] = useState<Step>({ name: 'choose' });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (step.name === 'friend') {
    // The existing sheet, unchanged: its own picker, empty and error states.
    return <SendRecommendationSheet online={online} onClose={onClose} onSent={onClose} />;
  }

  if (step.name === 'communities') {
    return (
      <Sheet
        title="Choose a community"
        onClose={onClose}
        onBack={() => setStep({ name: 'choose' })}
      >
        <ChooseCommunity
          onPick={(community) => setStep({ name: 'compose', community })}
          onCreate={onClose}
        />
      </Sheet>
    );
  }

  if (step.name === 'compose') {
    const { community } = step;
    return (
      <Sheet
        title={community.name}
        onClose={onClose}
        onBack={() => setStep({ name: 'communities' })}
        dismissible={!busy}
      >
        <PostComposer
          communityId={community.id}
          online={online}
          onBusyChange={setBusy}
          bare
          onPosted={() => {
            onClose();
            const state: SharedPostState = { sharedAt: Date.now() };
            navigate(`/communities/${community.id}`, { state });
          }}
          // The community is gone for you: back to a freshly loaded list.
          onGone={() => setStep({ name: 'communities' })}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title="Share a song" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setStep({ name: 'communities' })}
          className={`${tile} ${TAPE_PAPER}`}
        >
          <span className="font-display text-lg font-bold">To a community</span>
          <span className="text-sm">Post it to a group&apos;s feed</span>
        </button>
        <button
          type="button"
          onClick={() => setStep({ name: 'friend' })}
          className={`${tile} border-[1.5px] border-line`}
        >
          <span className="font-display text-lg font-bold">To a friend</span>
          <span className="text-sm text-muted">Send it to one person</span>
        </button>
      </div>
    </Sheet>
  );
}
