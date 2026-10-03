import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { createCommunity } from '../api/communities';
import { Button } from '../components/ui/Button';
import { CommunityCover } from '../components/ui/CommunityCover';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  checkCommunityDescription,
  checkCommunityName,
  cleanCommunityDescription,
  cleanCommunityName,
  COMMUNITY_TEXT_MESSAGES,
  DESCRIPTION_MAX_GRAPHEMES,
  NAME_MAX_GRAPHEMES,
} from '../lib/communityText';
import { graphemeCount } from '../lib/textRules';

const NAME_MESSAGES: ReadonlySet<string> = new Set([
  COMMUNITY_TEXT_MESSAGES.nameRequired,
  COMMUNITY_TEXT_MESSAGES.nameLength,
  COMMUNITY_TEXT_MESSAGES.nameTooLong,
]);

/** A server rejection, pinned to the exact text it was about. */
interface Rejection {
  field: 'name' | 'description';
  text: string;
  message: string;
}

const inputClass =
  'rounded-xl border bg-surface px-4 text-base text-ink outline-none focus:border-accent';

/**
 * Create Community — docs/features/communities-create.md §6.5 (UC-9). A
 * full-screen route rather than a modal, so the phone's back gesture works.
 */
export function CreateCommunity() {
  const navigate = useNavigate();
  const online = useOnlineStatus();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const cleanedName = cleanCommunityName(name);
  const nameCheck = checkCommunityName(name);
  const descriptionCheck = checkCommunityDescription(description);

  const nameError =
    rejection?.field === 'name' && rejection.text === name
      ? rejection.message
      : !nameCheck.ok && nameTouched
        ? nameCheck.message
        : null;
  const descriptionError =
    rejection?.field === 'description' && rejection.text === description
      ? rejection.message
      : descriptionCheck.ok
        ? null
        : descriptionCheck.message;

  const canSubmit =
    nameCheck.ok && descriptionCheck.ok && !nameError && !descriptionError && online && !saving;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNameTouched(true);
    if (!canSubmit || !nameCheck.ok || !descriptionCheck.ok) {
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const community = await createCommunity({
        name: nameCheck.value,
        description: descriptionCheck.value,
      });
      // Replace, so Back from the new community returns to the dashboard.
      navigate(`/communities/${community.id}`, { replace: true });
    } catch (caught) {
      setSaving(false);
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      const message = response?.data?.message;
      if (response?.status === 422 && message) {
        const field = NAME_MESSAGES.has(message) ? 'name' : 'description';
        setRejection({ field, text: field === 'name' ? name : description, message });
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
          <CommunityCover id={null} name={cleanedName} variant="banner" />
          <p className="text-xs text-muted">
            Your cover&apos;s colour is picked when the community is created.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="community-name" className="text-sm font-medium">
              Name
            </label>
            <span className="text-xs text-muted" aria-hidden="true">
              {graphemeCount(cleanedName)}/{NAME_MAX_GRAPHEMES}
            </span>
          </div>
          <input
            id="community-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFormError(null);
            }}
            onBlur={() => setNameTouched(true)}
            maxLength={400}
            autoComplete="off"
            aria-invalid={nameError !== null}
            aria-describedby="community-name-error"
            className={`min-h-11 ${inputClass} ${nameError ? 'border-danger' : 'border-line'}`}
          />
          <p id="community-name-error" aria-live="polite" className="min-h-5 text-xs text-danger">
            {nameError}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="community-description" className="text-sm font-medium">
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <span className="text-xs text-muted" aria-hidden="true">
              {graphemeCount(cleanCommunityDescription(description))}/{DESCRIPTION_MAX_GRAPHEMES}
            </span>
          </div>
          <textarea
            id="community-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setFormError(null);
            }}
            rows={4}
            maxLength={4000}
            aria-invalid={descriptionError !== null}
            aria-describedby="community-description-error"
            className={`py-3 ${inputClass} ${descriptionError ? 'border-danger' : 'border-line'}`}
          />
          <p
            id="community-description-error"
            aria-live="polite"
            className="min-h-5 text-xs text-danger"
          >
            {descriptionError}
          </p>
        </div>

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
