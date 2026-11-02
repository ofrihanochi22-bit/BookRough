import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import type { PublicPost } from '../api/posts';
import { hideRecommendation } from '../api/recommendations';
import { HIDDEN, HIDE_FAILED, hideBody } from '../lib/recommendationCopy';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

interface HideRecommendationSheetProps {
  post: PublicPost;
  onClose: () => void;
  /** Hidden here, or found already deleted: it leaves Received either way. */
  onHidden: (postId: string) => void;
}

/**
 * The recipient removes an item from Received, for themselves only: the bookmark
 * and rating stay, and the sender is not told (direct-recommendations.md §3.5).
 */
export function HideRecommendationSheet({ post, onClose, onHidden }: HideRecommendationSheetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await hideRecommendation(post.id);
      toast.success(HIDDEN);
      onHidden(post.id);
    } catch (caught) {
      if (isAxiosError(caught) && caught.response?.status === 404) {
        onHidden(post.id);
        return;
      }
      setBusy(false);
      setError(HIDE_FAILED);
    }
  }

  return (
    <Sheet title="Hide" onClose={onClose} dismissible={!busy}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">{hideBody(post.author.displayName)}</p>
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button onClick={confirm} busy={busy} className="flex-1">
            {busy ? 'Hiding…' : 'Hide'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
