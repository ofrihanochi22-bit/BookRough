import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import { useDesignStore } from '../stores/design';

// Mixtape is the default design since the swap (docs/features/ui-redesign.md
// §6, slice 5), but the Current look stays until the cleanup PR, and the suites
// written for it are its regression tests. They render under Current unless a
// test sets the design itself (`setDesign('mixtape')` in the *.mixtape tests);
// the default itself is proven in lib/design.test.ts and DesignSync.test.tsx.
// Removed with the Current look in the cleanup PR.
beforeEach(() => {
  useDesignStore.setState({ design: 'current' });
});

// React Testing Library leaves the DOM in place between tests unless told
// otherwise; a stale tree makes the next test's queries ambiguous.
afterEach(() => {
  cleanup();
});
