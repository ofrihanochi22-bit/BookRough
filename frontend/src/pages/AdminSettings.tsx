import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import {
  fetchAdminSettings,
  updateAdminSettings,
  type AdminSettings,
  type AdminSettingsValues,
  type SettingChange,
  type SettingsUpdate,
} from '../api/settings';
import { Button } from '../components/ui/Button';
import { LoadError } from '../components/ui/LoadError';
import { Skeleton } from '../components/ui/Skeleton';
import { useForbiddenEndsAdmin } from '../hooks/useForbiddenEndsAdmin';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import {
  ACCENT_COLORS,
  BANNER_MAX_GRAPHEMES,
  bannerProblem,
  DEFAULT_TAGLINE,
  TAGLINE_MAX_GRAPHEMES,
  taglineProblem,
  type AccentColor,
} from '../lib/appSettings';
import { describeChange } from '../lib/settingsHistory';
import { cleanLine, graphemeCount } from '../lib/textRules';
import { useSettingsStore } from '../stores/settings';

import { NotFound } from './NotFound';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function messageOf(error: unknown): string {
  if (isAxiosError<{ message?: string }>(error)) {
    if (!error.response) {
      return "Can't reach the server. Check your connection and try again.";
    }
    return error.response.data?.message ?? 'Saving failed. Please try again.';
  }
  return 'Saving failed. Please try again.';
}

/**
 * The Settings tab — docs/features/admin-panel.md §5.3. The three settings,
 * one Save, and the last 20 changes. After a save the server's answer replaces
 * the loaded one, and the app re-applies the settings at once.
 */
export function AdminSettingsTab() {
  const request = useRequest(fetchAdminSettings);
  const forbidden = useForbiddenEndsAdmin(request);
  const [saved, setSaved] = useState<AdminSettings | null>(null);

  if (forbidden) {
    return <NotFound />;
  }
  if (request.status === 'loading') {
    return (
      <div role="status" aria-label="Loading settings" className="flex flex-col gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (request.status === 'error') {
    return <LoadError message="Couldn't load the settings." onRetry={request.reload} />;
  }

  const data = saved ?? request.data;
  return (
    <div className="flex flex-col gap-10 pb-4">
      {/* Remounted after each save, so the form restarts from the saved values. */}
      <SettingsForm
        key={JSON.stringify(data.settings)}
        initial={data.settings}
        onSaved={(result) => {
          setSaved(result);
          void useSettingsStore.getState().load();
        }}
      />
      <History changes={data.changes} />
    </div>
  );
}

interface SettingsFormProps {
  initial: AdminSettingsValues;
  onSaved: (result: AdminSettings) => void;
}

function SettingsForm({ initial, onSaved }: SettingsFormProps) {
  const online = useOnlineStatus();
  const [enabled, setEnabled] = useState(initial.announcement.enabled);
  const [text, setText] = useState(initial.announcement.text);
  const [accent, setAccent] = useState<AccentColor>(initial.accentColor);
  const [tagline, setTagline] = useState(initial.welcomeTagline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bannerError = bannerProblem(enabled, text);
  const taglineError = taglineProblem(tagline);

  const update: SettingsUpdate = {};
  if (enabled !== initial.announcement.enabled || cleanLine(text) !== initial.announcement.text) {
    update.announcement = { enabled, text: cleanLine(text) };
  }
  if (accent !== initial.accentColor) {
    update.accentColor = accent;
  }
  if (cleanLine(tagline) !== initial.welcomeTagline) {
    update.welcomeTagline = cleanLine(tagline);
  }

  const changed = Object.keys(update).length > 0;
  const canSave = changed && !bannerError && !taglineError && online && !saving;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await updateAdminSettings(update);
      toast.success('Settings saved');
      onSaved(result);
    } catch (caught) {
      setSaving(false);
      setError(messageOf(caught));
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-8">
      {!online && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          You&apos;re offline. Connect to change settings.
        </p>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">Announcement banner</legend>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
          Show the banner to everyone signed in
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-5 accent-accent"
          />
        </label>
        <div className="flex items-baseline justify-between">
          <label htmlFor="banner-text" className="text-sm">
            Banner text
          </label>
          <span className="text-xs text-muted" aria-hidden="true">
            {graphemeCount(cleanLine(text))}/{BANNER_MAX_GRAPHEMES}
          </span>
        </div>
        <textarea
          id="banner-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={1000}
          aria-invalid={bannerError !== null}
          aria-describedby="banner-text-error"
          className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
        />
        <p id="banner-text-error" className="min-h-5 text-xs text-danger">
          {bannerError}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 text-sm font-medium">Accent colour</legend>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <label
              key={color.value}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${
                accent === color.value ? 'border-ink' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="accent"
                value={color.value}
                checked={accent === color.value}
                onChange={() => setAccent(color.value)}
                className="sr-only"
              />
              {/* The swatch carries its own palette name, so it shows that colour. */}
              <span
                data-accent={color.value}
                aria-hidden="true"
                className="size-5 rounded-full bg-accent"
              />
              {color.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="welcome-tagline" className="text-sm font-medium">
            Welcome tagline
          </label>
          <span className="text-xs text-muted" aria-hidden="true">
            {graphemeCount(cleanLine(tagline))}/{TAGLINE_MAX_GRAPHEMES}
          </span>
        </div>
        <input
          id="welcome-tagline"
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          maxLength={1000}
          aria-invalid={taglineError !== null}
          aria-describedby="welcome-tagline-error"
          className="min-h-11 rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none focus:border-accent"
        />
        <div className="flex items-start justify-between gap-3">
          <p id="welcome-tagline-error" className="min-h-5 text-xs text-danger">
            {taglineError}
          </p>
          <button
            type="button"
            onClick={() => setTagline(DEFAULT_TAGLINE)}
            disabled={cleanLine(tagline) === DEFAULT_TAGLINE}
            className="min-h-11 shrink-0 px-2 text-sm text-accent disabled:text-muted"
          >
            Reset to default
          </button>
        </div>
      </div>

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

function History({ changes }: { changes: SettingChange[] }) {
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3">
      <h2 id="history-heading" className="text-sm font-medium">
        Recent changes
      </h2>
      {changes.length === 0 ? (
        <p className="text-sm text-muted">No changes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {changes.map((change) => (
            <li key={change.id} className="flex flex-col rounded-xl border border-line px-3 py-2">
              <span className="truncate text-sm">{describeChange(change)}</span>
              <span className="text-xs text-muted">
                {timeFormat.format(new Date(change.changedAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
