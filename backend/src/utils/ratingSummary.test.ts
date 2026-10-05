import { describe, expect, it } from 'vitest';

import { NO_RATINGS, summarize } from './ratingSummary.js';

describe('summarize', () => {
  it('rounds the average half-up to one decimal, exactly', () => {
    // Act & Assert: 7.25 and 7.35 are where floating point rounds the wrong way.
    expect(summarize(29, 4)).toEqual({ average: 7.3, count: 4 }); // 7.25
    expect(summarize(147, 20)).toEqual({ average: 7.4, count: 20 }); // 7.35
    expect(summarize(22, 3)).toEqual({ average: 7.3, count: 3 }); // 7.333…
    expect(summarize(9, 1)).toEqual({ average: 9, count: 1 });
    expect(summarize(19, 2)).toEqual({ average: 9.5, count: 2 });
  });

  it('has no average when nobody has rated', () => {
    // Act & Assert
    expect(summarize(0, 0)).toBe(NO_RATINGS);
    expect(NO_RATINGS).toEqual({ average: null, count: 0 });
  });
});
