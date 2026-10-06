import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { createCommunity } from '../api/communities';
import { listFriends } from '../api/friends';
import { inviteFriends, type InviteCandidate } from '../api/invitations';
import { CommunityDetailsFields } from '../components/CommunityDetailsFields';
import { FriendPicker } from '../components/FriendPicker';
import { useCommunityDetailsForm } from '../hooks/useCommunityDetailsForm';
import { Button } from '../components/ui/Button';
import { CommunityCover } from '../components/ui/CommunityCover';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { cleanCommunityName } from '../lib/communityText';
import { INVITES_NOT_SENT, MAX_SELECTED } from '../lib/invitationCopy';

/** A new community has no members, invitations or bans: every friend is invitable. */
async function loadCandidates(): Promise<InviteCandidate[]> {
  const friends = await listFriends();
  return friends.map((friend) => ({ user: friend.user, status: 'INVITABLE' }));
}

/**
 * Create Community — docs/features/communities-create.md §6.5 (UC-9). A
 * full-screen route rather than a modal, so the phone's back gesture works.
 * The friends picker invites after the community exists
 * (docs/features/invite-friends.md §5.2), so an invitation failure never
 * loses the community.
 */
export function CreateCommunity() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const form = useCommunityDetailsForm();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const friends = useRequest(loadCandidates);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  function toggle(userId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < MAX_SELECTED) {
        next.add(userId);
      }
      return next;
    });
  }

  const canSubmit = form.values !== null && online && !saving;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    form.touchName();
    if (!canSubmit || !form.values) {
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const community = await createCommunity(form.values);
      if (selected.size > 0) {
        try {
          await inviteFriends(community.id, [...selected]);
        } catch {
          // The community exists; its invite panel opens by itself to retry.
          toast.error(INVITES_NOT_SENT);
        }
      }
      // Replace, so Back from the new community returns to the dashboard.
      navigate(`/communities/${community.id}`, { replace: true, state: { justCreated: true } });
    } catch (caught) {
      setSaving(false);
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      const message = response?.data?.message;
      if (response?.status === 422 && message) {
        form.reject(message);
      } else if (response) {
        setFormError(message ?? 'Creating the community failed. Please try again.');
      } else {
        setFormError("Can't reach the server. Check your connection and try again.");
      }
    }
  }

  return (
    <ScreenLayout>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-medium">New community</h1>
          <Link to="/home" className="flex min-h-11 items-center px-2 text-sm text-muted">
            Cancel
          </Link>
        </header>

        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            You&apos;re offline. Connect to create a community.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <CommunityCover id={null} name={cleanCommunityName(form.name)} variant="banner" />
          <p className="text-xs text-muted">
            Your cover&apos;s colour is picked when the community is created.
          </p>
        </div>

        <CommunityDetailsFields form={form} onEdit={() => setFormError(null)} />

        <section aria-labelledby="invite-friends" className="flex flex-col gap-2">
          <h2 id="invite-friends" className="text-sm font-medium">
            Invite friends
          </h2>
          <p className="text-xs text-muted">
            They&apos;ll get an invitation to join once the community is created.
          </p>
          <FriendPicker
            mode="select"
            candidates={friends.status === 'ready' ? friends.data : null}
            failed={friends.status === 'error'}
            onRetry={friends.reload}
            online={online}
            selected={selected}
            onToggle={toggle}
          />
          {selected.size >= MAX_SELECTED && (
            <p className="text-xs text-muted">You can invite up to {MAX_SELECTED} at once.</p>
          )}
        </section>

        {formError && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" busy={saving} disabled={!canSubmit} className="mb-4 w-full">
          {saving ? 'Creating…' : 'Create'}
        </Button>
      </form>
    </ScreenLayout>
  );
}
