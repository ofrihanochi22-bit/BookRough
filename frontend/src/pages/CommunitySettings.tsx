import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { getCommunity, type PublicCommunity } from '../api/communities';
import {
  changeRole,
  deleteCommunity,
  leaveCommunity,
  listBlocked,
  listMembers,
  removeMember,
  transferOwnership,
  unblockUser,
  updateCommunity,
  type BlockedUser,
  type CommunityMember,
} from '../api/membership';
import { CommunityDetailsFields } from '../components/CommunityDetailsFields';
import { useCommunityDetailsForm } from '../hooks/useCommunityDetailsForm';
import { InvitePanel } from '../components/InvitePanel';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Sheet } from '../components/ui/Sheet';
import { Skeleton } from '../components/ui/Skeleton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { memberCountLabel } from '../lib/communityCopy';
import { isAdmin, memberActions, roleLabel, type MemberAction } from '../lib/communityRoles';
import { useAuthStore } from '../stores/auth';
import { NotFound } from './NotFound';

interface SettingsData {
  community: PublicCommunity;
  members: CommunityMember[];
  blocked: BlockedUser[];
}

const OWNER_CANNOT_LEAVE =
  "You're the owner. Transfer ownership to another member or delete the community before leaving.";

function isNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

function messageOf(error: unknown): string {
  if (isAxiosError<{ message?: string }>(error)) {
    if (!error.response) {
      return "Can't reach the server. Check your connection and try again.";
    }
    return error.response.data?.message ?? 'Something went wrong.';
  }
  return 'Something went wrong.';
}

type Confirmation =
  | { kind: 'remove'; member: CommunityMember }
  | { kind: 'makeOwner'; member: CommunityMember }
  | { kind: 'leave' }
  | { kind: 'ownerCannotLeave' }
  | { kind: 'delete' };

/**
 * Community Settings & Members — docs/features/communities-membership.md §5
 * (UC-10, UC-14). Every section and action follows the caller's role; the
 * server checks each one again.
 */
export function CommunitySettings() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const me = useAuthStore((state) => state.user);

  const load = useCallback(async (): Promise<SettingsData> => {
    // All three at once; for a non-admin the blocked list answers 403, which
    // simply means "nothing to show".
    const [community, members, blocked] = await Promise.all([
      getCommunity(id),
      listMembers(id),
      listBlocked(id).catch((error: unknown) => {
        if (isAxiosError(error) && error.response?.status === 403) {
          return [];
        }
        throw error;
      }),
    ]);
    return { community, members, blocked };
  }, [id]);
  const initial = useRequest(load);

  /** Data reloaded after an action, which replaces the first load without a skeleton flash. */
  const [fresh, setFresh] = useState<SettingsData | null>(null);
  const [lostAccess, setLostAccess] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [detailsVersion, setDetailsVersion] = useState(0);

  const data = fresh ?? (initial.status === 'ready' ? initial.data : null);

  const refresh = useCallback(async () => {
    try {
      setFresh(await load());
    } catch (error) {
      if (isNotFound(error)) {
        setLostAccess(true);
      }
    }
  }, [load]);

  /**
   * Runs one action: a 404 means someone else got there first (or the caller
   * lost access) — reload, and if the reload is also 404, show not-found.
   */
  async function run(key: string, action: () => Promise<void>, onError: (message: string) => void) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      onError(messageOf(error));
      if (isNotFound(error)) {
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  if (lostAccess || (initial.status === 'error' && isNotFound(initial.error))) {
    return <NotFound />;
  }

  function closeSheet() {
    setConfirming(null);
    setSheetError(null);
  }

  async function act(member: CommunityMember, action: MemberAction) {
    setOpenMenu(null);
    if (action === 'remove' || action === 'makeOwner') {
      setConfirming({ kind: action, member });
      return;
    }
    const role = action === 'makeAdmin' ? 'ADMIN' : 'MEMBER';
    await run(
      `role-${member.user.id}`,
      async () => {
        await changeRole(id, member.user.id, role);
        await refresh();
      },
      setNotice,
    );
  }

  async function confirm() {
    if (!confirming || !data) {
      return;
    }
    const current = confirming;
    await run(
      'confirm',
      async () => {
        if (current.kind === 'remove') {
          await removeMember(id, current.member.user.id);
          await refresh();
        } else if (current.kind === 'makeOwner') {
          await transferOwnership(id, current.member.user.id);
          await refresh();
        } else if (current.kind === 'leave') {
          await leaveCommunity(id);
          navigate('/home', { replace: true });
          return;
        } else if (current.kind === 'delete') {
          await deleteCommunity(id);
          toast.success('Community deleted');
          navigate('/home', { replace: true });
          return;
        }
        closeSheet();
      },
      setSheetError,
    );
  }

  return (
    <ScreenLayout>
      <Link
        to={`/communities/${id}`}
        className="-ml-2 mb-4 flex min-h-11 w-fit items-center px-2 text-sm text-muted"
      >
        ← Back
      </Link>
      <h1 className="mb-6 font-display text-2xl font-medium">Settings</h1>

      {!online && (
        <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          You&apos;re offline. Connect to make changes.
        </p>
      )}

      {!data && initial.status === 'loading' && (
        <div role="status" aria-label="Loading settings" className="flex flex-col gap-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-24" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      )}

      {!data && initial.status === 'error' && (
        <LoadError message="Couldn't load the settings." onRetry={initial.reload} />
      )}

      {data && (
        <div className="flex flex-col gap-8 pb-8">
          {isAdmin(data.community.myRole) && (
            <DetailsSection
              key={detailsVersion}
              community={data.community}
              disabled={!online}
              onSaved={async () => {
                await refresh();
                // Only a save of this form resets it; other refreshes keep what is being typed.
                setDetailsVersion((version) => version + 1);
              }}
            />
          )}

          {isAdmin(data.community.myRole) && (
            <Section title="Invite">
              <Button variant="secondary" onClick={() => setInviting(true)} className="self-start">
                Invite friends
              </Button>
            </Section>
          )}

          <Section title={`Members · ${memberCountLabel(data.members.length)}`}>
            {notice && (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                {notice}
              </p>
            )}
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {data.members.map((member) => {
                const isSelf = member.user.id === me?.id;
                const actions = memberActions(data.community.myRole, member.role, isSelf);
                const label = roleLabel(member.role);
                const menuOpen = openMenu === member.user.id;
                return (
                  <li key={member.user.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        id={member.user.id}
                        name={member.user.displayName}
                        pictureUrl={member.user.profilePictureUrl}
                        size={36}
                        decorative
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {member.user.displayName}
                        {isSelf && <span className="text-muted"> · You</span>}
                      </span>
                      {label && <span className="text-xs text-accent">{label}</span>}
                      {actions.length > 0 && (
                        <button
                          type="button"
                          aria-label={`Actions for ${member.user.displayName}`}
                          aria-expanded={menuOpen}
                          onClick={() => setOpenMenu(menuOpen ? null : member.user.id)}
                          disabled={!online || busy !== null}
                          className="flex size-11 items-center justify-center rounded-full text-muted disabled:opacity-50"
                        >
                          <span aria-hidden="true" className="text-lg leading-none">
                            ⋯
                          </span>
                        </button>
                      )}
                    </div>
                    {menuOpen && (
                      <div className="flex flex-wrap gap-2 pl-12">
                        {actions.map((action) => (
                          <Button
                            key={action}
                            variant="secondary"
                            onClick={() => void act(member, action)}
                            className={action === 'remove' ? 'text-danger' : ''}
                          >
                            {ACTION_LABELS[action]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          {isAdmin(data.community.myRole) && data.blocked.length > 0 && (
            <Section title="Blocked">
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                {data.blocked.map((entry) => (
                  <li key={entry.user.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar
                      id={entry.user.id}
                      name={entry.user.displayName}
                      pictureUrl={entry.user.profilePictureUrl}
                      size={36}
                      decorative
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{entry.user.displayName}</p>
                      <p className="text-xs text-muted">
                        Blocked {new Date(entry.blockedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      busy={busy === `unblock-${entry.user.id}`}
                      disabled={!online || busy !== null}
                      onClick={() =>
                        void run(
                          `unblock-${entry.user.id}`,
                          async () => {
                            await unblockUser(id, entry.user.id);
                            await refresh();
                          },
                          setNotice,
                        )
                      }
                    >
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Your membership">
            <Button
              variant="secondary"
              disabled={!online || busy !== null}
              onClick={() =>
                setConfirming({
                  kind: data.community.myRole === 'OWNER' ? 'ownerCannotLeave' : 'leave',
                })
              }
              className="self-start"
            >
              Leave community
            </Button>
          </Section>

          {data.community.myRole === 'OWNER' && (
            <Section title="Danger zone">
              <Button
                variant="secondary"
                disabled={!online || busy !== null}
                onClick={() => setConfirming({ kind: 'delete' })}
                className="self-start border-danger text-danger"
              >
                Delete community
              </Button>
            </Section>
          )}
        </div>
      )}

      {inviting && data && (
        <InvitePanel
          communityId={data.community.id}
          communityName={data.community.name}
          onClose={() => setInviting(false)}
        />
      )}

      {confirming && data && (
        <ConfirmSheet
          confirmation={confirming}
          community={data.community}
          busy={busy === 'confirm'}
          error={sheetError}
          onConfirm={() => void confirm()}
          onClose={closeSheet}
        />
      )}
    </ScreenLayout>
  );
}

const ACTION_LABELS: Record<MemberAction, string> = {
  makeAdmin: 'Make admin',
  makeMember: 'Make member',
  remove: 'Remove from community',
  makeOwner: 'Make owner',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

interface DetailsSectionProps {
  community: PublicCommunity;
  disabled: boolean;
  onSaved: () => Promise<void>;
}

/** Name and description, editable by admins. Remounted (by key) after each save. */
function DetailsSection({ community, disabled, onSaved }: DetailsSectionProps) {
  const form = useCommunityDetailsForm({
    name: community.name,
    description: community.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed =
    form.values !== null &&
    (form.values.name !== community.name || form.values.description !== community.description);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.values || !changed) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCommunity(community.id, form.values);
      toast.success('Changes saved');
      await onSaved();
    } catch (caught) {
      const message = messageOf(caught);
      if (isAxiosError(caught) && caught.response?.status === 422) {
        form.reject(message);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Details">
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <CommunityDetailsFields form={form} onEdit={() => setError(null)} />
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" busy={saving} disabled={!changed || disabled} className="self-start">
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </Section>
  );
}

interface ConfirmSheetProps {
  confirmation: Confirmation;
  community: PublicCommunity;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Every confirmation of the screen (§5.4), in one sheet. */
function ConfirmSheet({
  confirmation,
  community,
  busy,
  error,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  const [understood, setUnderstood] = useState(false);

  if (confirmation.kind === 'ownerCannotLeave') {
    return (
      <Sheet title="Leave community" onClose={onClose}>
        <p className="mb-6 text-sm">{OWNER_CANNOT_LEAVE}</p>
        <Button onClick={onClose} className="w-full">
          OK
        </Button>
      </Sheet>
    );
  }

  const name = 'member' in confirmation ? confirmation.member.user.displayName : '';
  const copy = {
    remove: {
      title: 'Remove from community',
      body: `Are you sure you want to remove ${name} from this community?`,
      note: "They won't be able to rejoin until an admin unblocks them. Their posts and ratings in this community will be deleted too.",
      action: 'Remove',
      busy: 'Removing…',
    },
    makeOwner: {
      title: 'Make owner',
      body: `Make ${name} the owner?`,
      note: `You'll become an admin, and only ${name} will be able to delete the community.`,
      action: 'Make owner',
      busy: 'Transferring…',
    },
    leave: {
      title: 'Leave community',
      body: 'Are you sure you want to leave this community?',
      note: null,
      action: 'Leave',
      busy: 'Leaving…',
    },
    delete: {
      title: 'Delete community',
      body: `Delete ${community.name}?`,
      note:
        community.memberCount > 1
          ? `Warning: this can't be undone. The community will be deleted for all ${community.memberCount} members.`
          : "Warning: this can't be undone.",
      action: 'Delete community',
      busy: 'Deleting…',
    },
  }[confirmation.kind];

  const needsCheckbox = confirmation.kind === 'delete';

  return (
    <Sheet title={copy.title} onClose={onClose} dismissible={!busy}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">{copy.body}</p>
        {copy.note && <p className="text-sm text-muted">{copy.note}</p>}
        {needsCheckbox && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="size-5 accent-accent"
            />
            I understand this can&apos;t be undone
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            busy={busy}
            disabled={needsCheckbox && !understood}
            className="flex-1"
          >
            {busy ? copy.busy : copy.action}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
