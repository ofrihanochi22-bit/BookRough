import { markTutorialSeen } from '../api/users';
import { useAuthStore, type TutorialItem } from '../stores/auth';

/**
 * Hides a tutorial item now and tells the server in the background
 * (docs/features/onboarding-tutorial.md §5). A failure is deliberately silent:
 * the cost is seeing the item once more next session, and a toast about help
 * text would be noise.
 */
export function dismissTutorialItem(item: TutorialItem): void {
  useAuthStore.getState().markTutorialSeen(item);
  markTutorialSeen(item).catch(() => undefined);
}
