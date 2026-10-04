import { useState } from 'react';

import {
  checkCommunityDescription,
  checkCommunityName,
  COMMUNITY_TEXT_MESSAGES,
} from '../lib/communityText';

const NAME_MESSAGES: ReadonlySet<string> = new Set([
  COMMUNITY_TEXT_MESSAGES.nameRequired,
  COMMUNITY_TEXT_MESSAGES.nameLength,
  COMMUNITY_TEXT_MESSAGES.nameTooLong,
  COMMUNITY_TEXT_MESSAGES.character,
]);

/** A server rejection, pinned to the exact text it was about. */
interface Rejection {
  field: 'name' | 'description';
  text: string;
  message: string;
}

/**
 * State and rules for a community's name and description — shared by Create
 * Community and Settings, so both apply docs/features/communities-create.md §4
 * the same way.
 */
export function useCommunityDetailsForm(initial = { name: '', description: '' }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [nameTouched, setNameTouched] = useState(false);
  const [rejection, setRejection] = useState<Rejection | null>(null);

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

  /** The cleaned values, or null while either field breaks a rule. */
  const values =
    nameCheck.ok && descriptionCheck.ok && !nameError && !descriptionError
      ? { name: nameCheck.value, description: descriptionCheck.value }
      : null;

  return {
    name,
    description,
    setName,
    setDescription,
    touchName: () => setNameTouched(true),
    nameError,
    descriptionError,
    values,
    /** Pins a server 422 message to the field it is about. */
    reject(message: string) {
      const field = NAME_MESSAGES.has(message) ? 'name' : 'description';
      setRejection({ field, text: field === 'name' ? name : description, message });
    },
  };
}

export type CommunityDetailsForm = ReturnType<typeof useCommunityDetailsForm>;
