import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DESIGN,
  DESIGN_STORAGE_KEY,
  designFromSearch,
  initialDesign,
  readStoredDesign,
  storeDesign,
} from './design';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('design preference (ui-redesign.md §4)', () => {
  it('?design=new chooses Mixtape and remembers it on the device', () => {
    // Act
    const design = initialDesign('?design=new');

    // Assert
    expect(design).toBe('mixtape');
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe('mixtape');
  });

  it('?design=old chooses Current and remembers it, replacing Mixtape', () => {
    // Arrange
    storeDesign('mixtape');

    // Act
    const design = initialDesign('?foo=1&design=old');

    // Assert
    expect(design).toBe('current');
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe('current');
  });

  it('without the parameter, reads the stored choice', () => {
    // Arrange
    storeDesign('mixtape');

    // Act & Assert
    expect(initialDesign('')).toBe('mixtape');
    expect(initialDesign('?tab=users')).toBe('mixtape');
  });

  it('defaults to Current with nothing stored', () => {
    // Act & Assert
    expect(DEFAULT_DESIGN).toBe('current');
    expect(initialDesign('')).toBe('current');
  });

  it('ignores an unknown parameter value and keeps the stored choice', () => {
    // Arrange
    storeDesign('mixtape');

    // Act & Assert
    expect(designFromSearch('?design=mixtape')).toBeNull();
    expect(designFromSearch('?design=NEW')).toBeNull();
    expect(designFromSearch('?design=constructor')).toBeNull();
    expect(initialDesign('?design=fancy')).toBe('mixtape');
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe('mixtape');
  });

  it('falls back to the default when the stored value is unknown', () => {
    // Arrange
    window.localStorage.setItem(DESIGN_STORAGE_KEY, 'gig-poster');

    // Act & Assert
    expect(readStoredDesign()).toBe('current');
  });

  it('falls back to the default when storage throws, and a URL choice still applies', () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    // Act & Assert
    expect(initialDesign('')).toBe('current');
    expect(initialDesign('?design=new')).toBe('mixtape');
  });
});
