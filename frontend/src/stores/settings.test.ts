import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetOpenSent, useSettingsStore } from './settings';

const { fetchPublicSettings } = vi.hoisted(() => ({ fetchPublicSettings: vi.fn() }));

vi.mock('../api/settings', () => ({ fetchPublicSettings }));

/* docs/features/admin-overview.md §4.5 — one counted open per app load */

const SETTINGS = { accentColor: 'green', welcomeTagline: 'Hello' };

beforeEach(() => {
  vi.resetAllMocks();
  resetOpenSent();
});

describe('the settings store', () => {
  it('counts the first load only; later loads are re-fetches', async () => {
    // Arrange
    fetchPublicSettings.mockResolvedValue(SETTINGS);

    // Act
    await useSettingsStore.getState().load();
    await useSettingsStore.getState().load();

    // Assert
    expect(fetchPublicSettings.mock.calls).toEqual([[{ countOpen: true }], [{ countOpen: false }]]);
    expect(useSettingsStore.getState().welcomeTagline).toBe('Hello');
  });

  it('counts the open once when two loads start together', async () => {
    // Arrange
    fetchPublicSettings.mockResolvedValue(SETTINGS);

    // Act
    await Promise.all([useSettingsStore.getState().load(), useSettingsStore.getState().load()]);

    // Assert
    expect(fetchPublicSettings.mock.calls).toEqual([[{ countOpen: true }], [{ countOpen: false }]]);
  });

  it('leaves the open for the next load when the counting fetch fails', async () => {
    // Arrange
    fetchPublicSettings.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(SETTINGS);

    // Act
    await useSettingsStore.getState().load();
    await useSettingsStore.getState().load();
    await useSettingsStore.getState().load();

    // Assert
    expect(fetchPublicSettings.mock.calls).toEqual([
      [{ countOpen: true }],
      [{ countOpen: true }],
      [{ countOpen: false }],
    ]);
  });
});
