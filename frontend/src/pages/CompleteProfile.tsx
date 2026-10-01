import { useState, type FormEvent, type ReactNode } from 'react';
import { isAxiosError } from 'axios';

import { updateProfile } from '../api/users';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { useDisplayNameStatus, type DisplayNameStatus } from '../hooks/useDisplayNameStatus';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSignOut } from '../hooks/useSignOut';
import {
  cleanDisplayName,
  DISPLAY_NAME_MESSAGES,
  graphemeCount,
  MAX_GRAPHEMES,
  MIN_GRAPHEMES,
} from '../lib/displayName';
import { useAuthStore, type StreamingService } from '../stores/auth';

const SERVICES: ReadonlyArray<{ value: StreamingService; label: string }> = [
  { value: 'SPOTIFY', label: 'Spotify' },
  { value: 'APPLE_MUSIC', label: 'Apple Music' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'TIDAL', label: 'Tidal' },
  { value: 'DEEZER', label: 'Deezer' },
];

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
              <Avatar id={user.id} name={cleaned.length > 0 ? cleaned : null} size={56} />
            </AvatarTile>
            {googlePhoto && (
              <AvatarTile
                label="Google photo"
                selected={avatar === 'google'}
                onSelect={() => setAvatar('google')}
              >
                <Avatar id={user.id} name={null} pictureUrl={googlePhoto} size={56} />
              </AvatarTile>
            )}
          </div>
          {googlePhoto && (
            <p className="text-xs text-muted">Your Google photo is only kept if you choose it.</p>
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="display-name" className="text-sm font-medium">
              Display name
            </label>
            <span className="text-xs text-muted" aria-hidden="true">
              {graphemeCount(cleaned)}/{MAX_GRAPHEMES}
            </span>
          </div>
          <input
            id="display-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            maxLength={200}
            autoComplete="nickname"
            aria-describedby="display-name-status"
            aria-invalid={
              status.kind === 'invalid' || status.kind === 'taken' || status.kind === 'reserved'
            }
            className="min-h-11 rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none focus:border-accent"
          />
          <NameStatusLine status={status} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-3 text-sm font-medium">Where do you listen?</legend>
          {SERVICES.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                service === option.value
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line bg-surface text-ink'
              }`}
            >
              <input
                type="radio"
                name="service"
                value={option.value}
                checked={service === option.value}
                onChange={() => setService(option.value)}
                className="accent-accent"
              />
              {option.label}
            </label>
          ))}
        </fieldset>

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

const STATUS_TEXT: Partial<Record<DisplayNameStatus['kind'], string>> = {
  checking: 'Checking…',
  available: '✓ Available',
  taken: DISPLAY_NAME_MESSAGES.taken,
  reserved: DISPLAY_NAME_MESSAGES.reserved,
  unknown: "Couldn't check right now — we'll check when you continue.",
};

const HINT = `Any language. ${MIN_GRAPHEMES}–${MAX_GRAPHEMES} characters.`;

function NameStatusLine({ status }: { status: DisplayNameStatus }) {
  const text = status.kind === 'invalid' ? status.message : (STATUS_TEXT[status.kind] ?? HINT);
  const bad = status.kind === 'invalid' || status.kind === 'taken' || status.kind === 'reserved';
  const tone = bad ? 'text-danger' : status.kind === 'available' ? 'text-accent' : 'text-muted';

  return (
    <p id="display-name-status" aria-live="polite" className={`min-h-5 text-xs ${tone}`}>
      {text}
    </p>
  );
}
