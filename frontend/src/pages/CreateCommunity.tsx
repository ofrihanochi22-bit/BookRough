import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { createCommunity } from '../api/communities';
import { CommunityDetailsFields } from '../components/CommunityDetailsFields';
import { useCommunityDetailsForm } from '../hooks/useCommunityDetailsForm';
import { Button } from '../components/ui/Button';
import { CommunityCover } from '../components/ui/CommunityCover';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { cleanCommunityName } from '../lib/communityText';

/**
 * Create Community — docs/features/communities-create.md §6.5 (UC-9). A
 * full-screen route rather than a modal, so the phone's back gesture works.
 */
export function CreateCommunity() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const form = useCommunityDetailsForm();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

        {/* Static on purpose (option B): the friends picker arrives with friends in Phase 5. */}
        <section className="flex items-start gap-3 rounded-2xl bg-accent-soft px-4 py-4 text-accent-ink">
          <span aria-hidden="true" className="text-xl leading-6">
            ♫
          </span>
          <div>
            <h2 className="text-sm font-medium">Invite friends</h2>
            <p className="mt-1 text-xs">
              You&apos;ll be able to invite friends from here once you have friends on BookRough.
            </p>
          </div>
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
