import { describe, expect, it } from 'vitest';

// Deliberately failing. This file exists only to prove that branch protection
// refuses a merge on a red check, and is deleted with its branch afterwards.
describe('the CI gate', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
