import type { CommunityDetailsForm } from '../hooks/useCommunityDetailsForm';
import {
  cleanCommunityDescription,
  cleanCommunityName,
  DESCRIPTION_MAX_GRAPHEMES,
  NAME_MAX_GRAPHEMES,
} from '../lib/communityText';
import { graphemeCount } from '../lib/textRules';

const inputClass =
  'rounded-xl border bg-surface px-4 text-base text-ink outline-none focus:border-accent';

interface CommunityDetailsFieldsProps {
  form: CommunityDetailsForm;
  /** Called on every edit, e.g. to clear a form-level error. */
  onEdit?: () => void;
}

/** The Name and Description fields with their counters and error lines. */
export function CommunityDetailsFields({ form, onEdit }: CommunityDetailsFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="community-name" className="text-sm font-medium">
            Name
          </label>
          <span className="text-xs text-muted" aria-hidden="true">
            {graphemeCount(cleanCommunityName(form.name))}/{NAME_MAX_GRAPHEMES}
          </span>
        </div>
        <input
          id="community-name"
          value={form.name}
          onChange={(event) => {
            form.setName(event.target.value);
            onEdit?.();
          }}
          onBlur={form.touchName}
          maxLength={400}
          autoComplete="off"
          aria-invalid={form.nameError !== null}
          aria-describedby="community-name-error"
          className={`min-h-11 ${inputClass} ${form.nameError ? 'border-danger' : 'border-line'}`}
        />
        <p id="community-name-error" aria-live="polite" className="min-h-5 text-xs text-danger">
          {form.nameError}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="community-description" className="text-sm font-medium">
            Description <span className="font-normal text-muted">(optional)</span>
          </label>
          <span className="text-xs text-muted" aria-hidden="true">
            {graphemeCount(cleanCommunityDescription(form.description))}/{DESCRIPTION_MAX_GRAPHEMES}
          </span>
        </div>
        <textarea
          id="community-description"
          value={form.description}
          onChange={(event) => {
            form.setDescription(event.target.value);
            onEdit?.();
          }}
          rows={4}
          maxLength={4000}
          aria-invalid={form.descriptionError !== null}
          aria-describedby="community-description-error"
          className={`py-3 ${inputClass} ${form.descriptionError ? 'border-danger' : 'border-line'}`}
        />
        <p
          id="community-description-error"
          aria-live="polite"
          className="min-h-5 text-xs text-danger"
        >
          {form.descriptionError}
        </p>
      </div>
    </>
  );
}
