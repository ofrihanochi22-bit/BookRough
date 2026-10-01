import { SignedInPlaceholder } from '../components/SignedInPlaceholder';

/**
 * Placeholder. The onboarding feature (docs/features/onboarding.md) replaces it
 * with the real form: display name and preferred streaming service.
 */
export function CompleteProfile() {
  return <SignedInPlaceholder title="Complete your profile" note="Profile setup comes next." />;
}
