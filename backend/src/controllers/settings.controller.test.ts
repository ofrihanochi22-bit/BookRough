import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { publicSettings } from './settings.controller.js';

const { recordAppOpen, getPublicSettings, warn } = vi.hoisted(() => ({
  recordAppOpen: vi.fn(),
  getPublicSettings: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../services/appOpens.js', () => ({ recordAppOpen }));
vi.mock('../services/appSettings.js', () => ({
  getPublicSettings,
  getAdminSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/* docs/features/admin-overview.md §8 — counting an open never touches the settings answer */

function call(query: Record<string, unknown>, user?: object) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  const next = vi.fn();
  const done = publicSettings({ query, user } as unknown as Request, res, next);
  return { res, next, done };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPublicSettings.mockResolvedValue({ accentColor: 'orange', welcomeTagline: 'Hi' });
  recordAppOpen.mockResolvedValue(undefined);
});

describe('publicSettings', () => {
  it('counts a signed-in open on open=1', async () => {
    // Act
    const { done } = call({ open: '1' }, { id: 'u' });
    await done;

    // Assert
    expect(recordAppOpen).toHaveBeenCalledWith(true);
  });

  it('counts nothing without open=1', async () => {
    // Act
    const { done } = call({ open: ['1', '1'] });
    await done;

    // Assert
    expect(recordAppOpen).not.toHaveBeenCalled();
  });

  it('answers 200 with the settings, and logs a WARN, when counting fails', async () => {
    // Arrange
    recordAppOpen.mockRejectedValue(new Error('database down'));

    // Act
    const { res, next, done } = call({ open: '1' });
    await done;

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: { accentColor: 'orange', welcomeTagline: 'Hi' },
    });
    expect(next).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.anything(), 'Could not count an app open'),
    );
  });
});
