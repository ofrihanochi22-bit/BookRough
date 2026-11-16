import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { wipeCache } from '../lib/requestCache';

// React Testing Library leaves the DOM in place between tests unless told
// otherwise; a stale tree makes the next test's queries ambiguous.
afterEach(() => {
  cleanup();
  // The read cache and the saved session live for the whole module, so one
  // test's answers would otherwise be shown at once by the next
  // (docs/features/client-cache.md).
  wipeCache();
  localStorage.clear();
});
