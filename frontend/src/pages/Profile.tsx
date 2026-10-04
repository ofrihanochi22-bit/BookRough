import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import { chooseGooglePhoto, updateProfile, type ProfileUpdate } from '../api/users';
import { DisplayNameField } from '../components/DisplayNameField';
import { GoogleCredentialButton } from '../components/GoogleCredentialButton';
import { StreamingServicePicker } from '../components/StreamingServicePicker';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { useDisplayNameStatus, type DisplayNameStatus } from '../hooks/useDisplayNameStatus';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSignOut } from '../hooks/useSignOut';
import { cleanDisplayName, DISPLAY_NAME_MESSAGES } from '../lib/displayName';
import { useAuthStore, type PublicUser, type StreamingService } from '../stores/auth';

const NAME_MESSAGES: ReadonlySet<string> = new Set(Object.values(DISPLAY_NAME_MESSAGES));

function messageOf(error: unknown, fallback: string): string {
  if (isAxiosError<{ message?: string }>(error)) {
    if (!error.response) {
      return "Can't reach the server. Check your connection and try again.";
    }
    return error.response.data?.message ?? fallback;
  }
  return fallback;
}

/**
 * My Profile / Settings — docs/features/profile-settings.md §5.1 (UC-4, UC-3).
 * Renders straight from the session in the store; every save returns the
 * refreshed session, which goes back into the store.
 */
export function Profile() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const { signingOut, signOut } = useSignOut();

  if (!user) {
    return null;
  }

  return (
    <ScreenLayout>
      <h1 className="mb-6 font-display text-2xl font-medium">Your profile</h1>
      {/* Remounted after each save, so the form restarts from the saved values. */}
      <ProfileForm key={`${user.displayName}|${user.preferredService}`} user={user} />
      {isAdmin && (
        <Link
          to="/admin"
          className="mt-8 flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-4 text-sm font-medium"
        >
          Admin area
          <span aria-hidden="true" className="text-muted">
            ›
          </span>
        </Link>
      )}
      <div className="mt-8 flex justify-center pb-4">
        <Button variant="secondary" busy={signingOut} onClick={signOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </ScreenLayout>
  );
}

function ProfileForm({ user }: { user: PublicUser }) {
  const online = useOnlineStatus();
  const [name, setName] = useState(user.displayName ?? '');
  const [service, setService] = useState<StreamingService | null>(user.preferredService);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A name the server rejected on save (taken in a race, reserved, …). */
  const [rejected, setRejected] = useState<{ name: string; message: string } | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const cleaned = cleanDisplayName(name);
  const nameChanged = cleaned !== user.displayName;
  const checked = useDisplayNameStatus(name);
  // The saved name needs no "✓ Available": it is simply theirs.
  const status: DisplayNameStatus =
    rejected?.name === cleaned
      ? { kind: 'invalid', message: rejected.message }
      : nameChanged
        ? checked
        : { kind: 'empty' };

  const nameUsable = !nameChanged || checked.kind === 'available' || checked.kind === 'unknown';
  const serviceChanged = service !== null && service !== user.preferredService;
  const canSave = (nameChanged || serviceChanged) && nameUsable && online && !saving && !avatarBusy;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    const changes: ProfileUpdate = {};
    if (nameChanged) {
      changes.displayName = cleaned;
    }
    if (serviceChanged && service) {
      changes.preferredService = service;
    }

    setSaving(true);
    setError(null);
    try {
      const session = await updateProfile(changes);
      toast.success('Profile updated');
      useAuthStore.getState().setSession(session);
    } catch (caught) {
      setSaving(false);
      const message = messageOf(caught, 'Saving failed. Please try again.');
      // Name problems belong on the name's status line; anything else above Save.
      if (isAxiosError(caught) && caught.response && NAME_MESSAGES.has(message)) {
        setRejected({ name: cleaned, message });
      } else {
        setError(message);
      }
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-8">
      {!online && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          You&apos;re offline. Connect to change your profile.
        </p>
      )}

      <AvatarSection
        user={user}
        offline={!online}
        saving={saving}
        busy={avatarBusy}
        onBusyChange={setAvatarBusy}
      />

      <DisplayNameField
        value={name}
        onChange={(value) => {
          setName(value);
          setError(null);
        }}
        status={status}
        submitVerb="save"
      />

      <StreamingServicePicker value={service} onChange={setService} />

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" busy={saving} disabled={!canSave} className="w-full">
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

interface AvatarSectionProps {
  user: PublicUser;
  offline: boolean;
  /** The form is saving: the avatar controls wait, but stay on screen. */
  saving: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}

/**
 * Switch between the Google photo and the generated avatar. After onboarding,
 * a stored photo URL means the user chose their Google photo (a declined one is
 * deleted — docs/features/onboarding.md §3), so the URL alone tells which is in use.
 */
function AvatarSection({ user, offline, saving, busy, onBusyChange }: AvatarSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const usingGooglePhoto = user.profilePictureUrl !== null;

  async function switchToGenerated() {
    onBusyChange(true);
    setError(null);
    try {
      useAuthStore.getState().setSession(await updateProfile({ useGooglePicture: false }));
    } catch (caught) {
      setError(messageOf(caught, 'Switching failed. Please try again.'));
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <section className="flex flex-col items-center gap-3 text-center">
      <Avatar id={user.id} name={user.displayName} pictureUrl={user.profilePictureUrl} size={80} />

      {usingGooglePhoto ? (
        <>
          <Button
            variant="secondary"
            busy={busy}
            disabled={offline || saving}
            onClick={() => void switchToGenerated()}
          >
            {busy ? 'Switching…' : 'Use generated avatar'}
          </Button>
          <p className="text-xs text-muted">Your Google photo will be deleted from BookRough.</p>
        </>
      ) : (
        <>
          <p className="text-sm">Use my Google photo</p>
          {offline ? (
            <p className="text-xs text-muted">Connect to change your avatar.</p>
          ) : (
            <div inert={saving} className={saving ? 'opacity-50' : undefined}>
              <GoogleCredentialButton
                busyLabel="Fetching your photo…"
                onCredential={async (credential) => {
                  onBusyChange(true);
                  try {
                    useAuthStore.getState().setSession(await chooseGooglePhoto(credential));
                  } finally {
                    onBusyChange(false);
                  }
                }}
              />
            </div>
          )}
          <p className="text-xs text-muted">
            We&apos;ll fetch your current photo from Google. Nothing else is kept.
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="w-full rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
