import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import { chooseGooglePhoto, updateProfile, uploadAvatar, type ProfileUpdate } from '../api/users';
import { DisplayNameField } from '../components/DisplayNameField';
import { GoogleCredentialButton } from '../components/GoogleCredentialButton';
import { SignOutButton } from '../components/SignOutSheet';
import { StreamingServicePicker } from '../components/StreamingServicePicker';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { MIXTAPE_H1 } from '../components/ui/heading';
import { LineIcon } from '../components/ui/LineIcon';
import { ProfileTape, TAPE_AVATAR_RING } from '../components/ui/ProfileTape';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { TopBar } from '../components/ui/TopBar';
import { useDisplayNameStatus, type DisplayNameStatus } from '../hooks/useDisplayNameStatus';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { AVATAR_COPY, AvatarImageError, isUploadedAvatar, prepareAvatar } from '../lib/avatarImage';
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

  if (!user) {
    return null;
  }

  return (
    <ScreenLayout>
      <TopBar />
      <h1 className={`mb-6 ${MIXTAPE_H1}`}>Your profile</h1>
      <ProfileForm key={`${user.displayName}|${user.preferredService}`} user={user} />
      {isAdmin && (
        <Link
          to="/admin"
          className="mt-8 flex min-h-14 items-center gap-3 rounded-[22px] bg-surface px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <LineIcon>
            <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
          </LineIcon>
          <span className="flex-1">Admin area</span>
          <LineIcon className="size-4 text-muted">
            <path d="M9 5l7 7-7 7" />
          </LineIcon>
        </Link>
      )}
      <div className="mt-8 flex justify-center pb-4">
        <SignOutButton className="px-5" />
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

      <Button type="submit" busy={saving} offline={!online} disabled={!canSave} className="w-full">
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
 * Switch between a photo — the Google one or an upload (avatar-upload.md §5.1) —
 * and the generated avatar. After onboarding, a stored photo URL means the user
 * chose a photo (a declined Google one is deleted — docs/features/onboarding.md
 * §3), and its shape tells an upload from a Google photo.
 */
function AvatarSection({ user, offline, saving, busy, onBusyChange }: AvatarSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const usingPhoto = user.profilePictureUrl !== null;
  const uploaded = isUploadedAvatar(user.profilePictureUrl);
  const locked = offline || saving || busy;

  async function upload(file: File) {
    onBusyChange(true);
    setUploading(true);
    setError(null);
    try {
      const image = await prepareAvatar(file);
      useAuthStore.getState().setSession(await uploadAvatar(image));
      toast.success(AVATAR_COPY.uploaded);
    } catch (caught) {
      setError(
        caught instanceof AvatarImageError
          ? caught.message
          : messageOf(caught, 'Uploading failed. Please try again.'),
      );
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  }

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

  const content = (
    <>
      <span className={TAPE_AVATAR_RING}>
        <Avatar
          id={user.id}
          name={user.displayName}
          pictureUrl={user.profilePictureUrl}
          size={76}
        />
      </span>

      <label
        className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-line px-6 text-sm font-semibold text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
          locked ? 'pointer-events-none border-dashed opacity-60' : ''
        }`}
      >
        {uploading ? 'Uploading…' : 'Upload a photo'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          disabled={offline || saving || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared, so choosing the same file again still uploads.
            event.target.value = '';
            if (file) {
              void upload(file);
            }
          }}
        />
      </label>

      {usingPhoto ? (
        <>
          <Button
            variant="secondary"
            busy={busy && !uploading}
            offline={offline}
            disabled={locked}
            onClick={() => void switchToGenerated()}
          >
            {busy && !uploading ? 'Switching…' : 'Use generated avatar'}
          </Button>
          <p className="text-xs text-muted">
            {uploaded
              ? 'Your photo will be deleted from BookRough.'
              : 'Your Google photo will be deleted from BookRough.'}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold">Use my Google photo</p>
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
    </>
  );

  return (
    <section>
      <ProfileTape userId={user.id}>
        <div className="flex flex-col items-center gap-3 text-center">{content}</div>
      </ProfileTape>
    </section>
  );
}
