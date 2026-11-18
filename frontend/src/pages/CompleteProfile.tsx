import { useState, type FormEvent, type ReactNode } from 'react';
import { isAxiosError } from 'axios';

import { updateProfile } from '../api/users';
import { DisplayNameField } from '../components/DisplayNameField';
import { StreamingServicePicker } from '../components/StreamingServicePicker';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { CommunityCover } from '../components/ui/CommunityCover';
import { MIXTAPE_H1 } from '../components/ui/heading';
import { LineIcon } from '../components/ui/LineIcon';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { TopBar } from '../components/ui/TopBar';
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
      <TopBar />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
        <h1 className={MIXTAPE_H1}>Complete your profile</h1>

        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            You&apos;re offline. Connect to finish your profile.
          </p>
        )}

        {/* "Your cassette" (ui-redesign.md §5.13): the name as it is typed, on a
            label striped in the user's own hue. Presentation only — the field
            holds the value — so the cover stays decorative; ♪ while it is empty. */}
        <CommunityCover id={user.id} name={cleaned} variant="card" />

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
            disabled={signingOut || !online}
            className="min-h-11 px-4 text-sm text-muted underline-offset-4 hover:underline disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          {!online && (
            <p role="note" className="text-xs text-muted">
              You&apos;re offline. Connect to sign out.
            </p>
          )}
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

/**
 * The selected tile outlined in `ink` with a check badge, the other in `line`
 * (ui-redesign.md §5.13, improvement round 2026-11-15). Never a light fill:
 * the pale generated avatar all but vanishes on `tape`. The selection shows
 * by border weight, the check and the bold label — not colour alone.
 */
const TILE = {
  // The padding absorbs the thicker border, so choosing a tile never shifts the row.
  selected: 'border-2 border-ink p-[15.5px] font-semibold',
  other: 'border-[1.5px] border-line p-4',
  focus:
    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
};

function AvatarTile({ label, selected, onSelect, children }: AvatarTileProps) {
  return (
    <label
      className={`relative flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-[22px] text-sm text-ink ${
        selected ? TILE.selected : TILE.other
      } ${TILE.focus}`}
    >
      {selected && (
        <span
          data-testid="avatar-tile-check"
          className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-ink text-canvas"
        >
          <LineIcon className="size-4">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.5" />
          </LineIcon>
        </span>
      )}
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
