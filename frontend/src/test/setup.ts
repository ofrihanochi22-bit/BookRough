import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React Testing Library leaves the DOM in place between tests unless told
// otherwise; a stale tree makes the next test's queries ambiguous.
afterEach(() => {
  cleanup();
});
