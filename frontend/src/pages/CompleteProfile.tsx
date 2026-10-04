import { useState, type FormEvent, type ReactNode } from 'react';
import { isAxiosError } from 'axios';

import { updateProfile } from '../api/users';
import { DisplayNameField } from '../components/DisplayNameField';
import { StreamingServicePicker } from '../components/StreamingServicePicker';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { useDisplayNameStatus, type DisplayNameStatus } from '../hooks/useDisplayNameStatus';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSignOut } from '../hooks/useSignOut';
import { cleanDisplayName, DISPLAY_NAME_MESSAGES } from '../lib/displayName';
import { useAuthStore, type StreamingService } from '../stores/auth';

type AvatarChoice = 'generated' | 'google';

const NAME_MESSAGES: ReadonlySet<string> = new Set(Object.values(DISPLAY_NAME_MESSAGES));

/**
 * Complete Your Profile — docs/features/onboarding.md §6. Collects what
 * Google does not supply: a display name, a streaming service, and whether the
 * avatar is the user's Google photo (kept only if chosen) or a generated one.
 */
export function CompleteProfile() {
  const user = useAuthStore((state) => state.user);
  const online = useOnlineStatus();
  const { signingOut, signOut } = useSignOut();

  const [name, setName] = useState('');
  const [service, setService] = useState<StreamingService | null>(null);
  const [avatar, setAvatar] = useState<AvatarChoice>('generated');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A name the server rejected on save (taken in a race, reserved, …). */
  const [rejected, setRejected] = useState<{ name: string; message: string } | null>(null);

  const cleaned = cleanDisplayName(name);
  const checked = useDisplayNameStatus(name);
  const status: DisplayNameStatus =
    rejected?.name === cleaned ? { kind: 'invalid', message: rejected.message } : checked;

  if (!user) {
    return null;
  }

  const googlePhoto = user.profilePictureUrl;
  const nameUsable = status.kind === 'available' || status.kind === 'unknown';
  const canSubmit = nameUsable && service !== null && online && !saving;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || service === null) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const session = await updateProfile({
        displayName: cleaned,
        preferredService: service,
        useGooglePicture: avatar === 'google',
      });
      // RequireSession moves an onboarded user on to /home.
      useAuthStore.getState().setSession(session);
    } catch (caught) {
      setSaving(false);
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      const message = response?.data?.message;
      // Only name problems belong on the name's status line; anything else
      // (e.g. a photo that is no longer available) is a form-level error.
      if (message && NAME_MESSAGES.has(message)) {
        setRejected({ name: cleaned, message });
      } else if (response) {
        setError(message ?? 'Saving failed. Please try again.');
      } else {
        setError("Can't reach the server. Check your connection and try again.");
      }
    }
  }

  return (
    <ScreenLayout>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
        <h1 className="font-display text-2xl font-medium">Complete your profile</h1>

        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            You&apos;re offline. Connect to finish your profile.
          </p>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">Your avatar</legend>
          <div className="flex gap-3">
            <AvatarTile
              label="Generated"
              selected={avatar === 'generated'}
              onSelect={() => setAvatar('generated')}
            >
              <Avatar
                id={user.id}
                name={cleaned.length > 0 ? cleaned : null}
                size={56}
                decorative
              />
            </AvatarTile>
            {googlePhoto && (
              <AvatarTile
                label="Google photo"
                selected={avatar === 'google'}
                onSelect={() => setAvatar('google')}
              >
                <Avatar id={user.id} name={null} pictureUrl={googlePhoto} size={56} decorative />
              </AvatarTile>
            )}
          </div>
          {googlePhoto && (
            <p className="text-xs text-muted">Your Google photo is only kept if you choose it.</p>
          )}
        </fieldset>

        <DisplayNameField
          value={name}
          onChange={(value) => {
            setName(value);
            setError(null);
          }}
          status={status}
          submitVerb="continue"
        />

        <StreamingServicePicker value={service} onChange={setService} />

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col items-center gap-3 pb-4">
          <Button type="submit" busy={saving} disabled={!canSubmit} className="w-full">
            {saving ? 'Saving…' : 'Continue'}
          </Button>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="min-h-11 px-4 text-sm text-muted underline-offset-4 hover:underline"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </form>
    </ScreenLayout>
  );
}

interface AvatarTileProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}

function AvatarTile({ label, selected, onSelect, children }: AvatarTileProps) {
  return (
    <label
      className={`flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-xl border p-4 text-sm ${
        selected
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-line bg-surface text-ink'
      }`}
    >
      <input
        type="radio"
        name="avatar"
        aria-label={label}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      {children}
      <span aria-hidden="true">{label}</span>
    </label>
  );
}
