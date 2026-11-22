import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import {
  removeCommunityPhoto,
  uploadCommunityPhoto,
  type PublicCommunity,
} from '../api/communities';
import { AVATAR_COPY, AvatarImageError, prepareAvatar } from '../lib/avatarImage';
import { PhotoPickerButton } from './PhotoPickerButton';
import { Button } from './ui/Button';
import { CommunityCover } from './ui/CommunityCover';
import { Sheet } from './ui/Sheet';

export const COMMUNITY_PHOTO_COPY = {
  removeTitle: 'Remove photo',
  removeBody: "Remove the community's photo? Everyone will see the generated cover again.",
  removed: 'Photo removed',
} as const;

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof AvatarImageError) {
    return error.message;
  }
  if (isAxiosError<{ message?: string }>(error)) {
    if (!error.response) {
      return "Can't reach the server. Check your connection and try again.";
    }
    return error.response.data?.message ?? fallback;
  }
  return fallback;
}

interface CommunityPhotoSectionProps {
  community: PublicCommunity;
  /** Offline: every control waits (community-photo.md §5.2). */
  disabled: boolean;
  /** After an upload or a removal; the screen reloads what it shows. */
  onChanged: () => Promise<void>;
}

/**
 * Community Settings' Photo section, admins only — community-photo.md §5.2.
 * The browser crops and shrinks the photo (`prepareAvatar`, as on My Profile);
 * the server re-encodes it.
 */
export function CommunityPhotoSection({
  community,
  disabled,
  onChanged,
}: CommunityPhotoSectionProps) {
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const hasPhoto = community.photoUrl !== null;
  const locked = disabled || busy !== null;

  async function upload(file: File) {
    setBusy('upload');
    setError(null);
    try {
      const image = await prepareAvatar(file);
      await uploadCommunityPhoto(community.id, image);
      toast.success(AVATAR_COPY.uploaded);
      await onChanged();
    } catch (caught) {
      setError(messageOf(caught, 'Uploading failed. Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('remove');
    setSheetError(null);
    try {
      await removeCommunityPhoto(community.id);
      setConfirming(false);
      toast.success(COMMUNITY_PHOTO_COPY.removed);
      await onChanged();
    } catch (caught) {
      setSheetError(messageOf(caught, 'Removing failed. Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <CommunityCover
        id={community.id}
        name={community.name}
        variant="card"
        photoUrl={community.photoUrl}
      />
      <div className="flex flex-wrap items-center gap-3">
        <PhotoPickerButton
          label={busy === 'upload' ? 'Uploading…' : hasPhoto ? 'Replace photo' : 'Upload a photo'}
          disabled={locked}
          onPick={(file) => void upload(file)}
        />
        {hasPhoto && (
          <Button
            variant="secondary"
            offline={disabled}
            disabled={locked}
            onClick={() => {
              setSheetError(null);
              setConfirming(true);
            }}
          >
            Remove photo
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {confirming && (
        <Sheet
          title={COMMUNITY_PHOTO_COPY.removeTitle}
          onClose={() => setConfirming(false)}
          dismissible={busy === null}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm">{COMMUNITY_PHOTO_COPY.removeBody}</p>
            {sheetError && (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                {sheetError}
              </p>
            )}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={busy !== null}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void remove()}
                busy={busy === 'remove'}
                offline={disabled}
                disabled={disabled}
                className="flex-1"
              >
                {busy === 'remove' ? 'Removing…' : 'Remove photo'}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
