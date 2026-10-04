import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkAccentColor,
  checkAnnouncement,
  checkTagline,
  DEFAULT_TAGLINE,
  getAdminSettings,
  getPublicSettings,
  SETTINGS_MESSAGES,
  updateSettings,
} from './appSettings.js';

const { db, tx } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    appSetting: { findMany: vi.fn(), upsert: vi.fn() },
    settingChange: { create: vi.fn() },
  };
  const db = {
    appSetting: { findMany: vi.fn() },
    settingChange: { findMany: vi.fn() },
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { db, tx };
});

vi.mock('../db/prisma.js', () => ({ prisma: db }));

const DEFAULTS = {
  announcement: { enabled: false, text: '' },
  accentColor: 'purple',
  welcomeTagline: DEFAULT_TAGLINE,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.appSetting.findMany.mockResolvedValue([]);
  db.settingChange.findMany.mockResolvedValue([]);
  tx.appSetting.findMany.mockResolvedValue([]);
});

describe('the rules', () => {
  it('cleans the banner text and accepts it on or off', () => {
    // Act
    const on = checkAnnouncement({ enabled: true, text: '  Party   tonight ' });
    const offEmpty = checkAnnouncement({ enabled: false, text: '' });

    // Assert
    expect(on).toEqual({ ok: true, value: { enabled: true, text: 'Party tonight' } });
    expect(offEmpty.ok).toBe(true);
  });

  it.each([
    [
      'over 140 characters',
      { enabled: false, text: 'x'.repeat(141) },
      SETTINGS_MESSAGES.bannerLength,
    ],
    ['turned on with no text', { enabled: true, text: '   ' }, SETTINGS_MESSAGES.bannerEmpty],
    [
      'a zero-width character',
      { enabled: true, text: 'Hi​there' },
      SETTINGS_MESSAGES.bannerCharacter,
    ],
  ])('refuses a banner %s', (_label, input, message) => {
    // Act
    const result = checkAnnouncement(input);

    // Assert
    expect(result).toEqual({ ok: false, message });
  });

  it('accepts exactly 140 characters of banner and 80 of tagline', () => {
    // Act / Assert
    expect(checkAnnouncement({ enabled: true, text: 'x'.repeat(140) }).ok).toBe(true);
    expect(checkTagline('y'.repeat(80)).ok).toBe(true);
  });

  it.each([
    ['empty', '', SETTINGS_MESSAGES.taglineEmpty],
    ['whitespace only', '    ', SETTINGS_MESSAGES.taglineEmpty],
    ['over 80 characters', 'y'.repeat(81), SETTINGS_MESSAGES.taglineLength],
    ['a bidi mark', 'Music‮from friends', SETTINGS_MESSAGES.taglineCharacter],
  ])('refuses a tagline that is %s', (_label, raw, message) => {
    // Act
    const result = checkTagline(raw);

    // Assert
    expect(result).toEqual({ ok: false, message });
  });

  it('accepts only palette names as the accent colour', () => {
    // Act / Assert
    expect(checkAccentColor('green')).toEqual({ ok: true, value: 'green' });
    expect(checkAccentColor('#ff0000')).toEqual({
      ok: false,
      message: SETTINGS_MESSAGES.accentColor,
    });
    expect(checkAccentColor('red; background: url(x)').ok).toBe(false);
  });
});

describe('reading', () => {
  it('returns the defaults when nothing was ever saved', async () => {
    // Act
    const { settings } = await getAdminSettings();

    // Assert
    expect(settings).toEqual(DEFAULTS);
  });

  it('reads a stored value the rules reject as the default', async () => {
    // Arrange
    db.appSetting.findMany.mockResolvedValue([
      { key: 'ACCENT_COLOR', value: 'teal' },
      { key: 'WELCOME_TAGLINE', value: 42 },
      { key: 'ANNOUNCEMENT', value: { enabled: true } },
    ]);

    // Act
    const { settings } = await getAdminSettings();

    // Assert
    expect(settings).toEqual(DEFAULTS);
  });

  it('gives the banner only to signed-in callers, and null when it is off', async () => {
    // Arrange
    db.appSetting.findMany.mockResolvedValue([
      { key: 'ANNOUNCEMENT', value: { enabled: true, text: 'Hello' } },
    ]);

    // Act
    const signedOut = await getPublicSettings(false);
    const signedIn = await getPublicSettings(true);

    // Assert
    expect(signedOut).toEqual({ accentColor: 'purple', welcomeTagline: DEFAULT_TAGLINE });
    expect(signedIn).toMatchObject({ announcement: { text: 'Hello' } });

    db.appSetting.findMany.mockResolvedValue([
      { key: 'ANNOUNCEMENT', value: { enabled: false, text: 'Hello' } },
    ]);
    expect(await getPublicSettings(true)).toMatchObject({ announcement: null });
  });

  it('maps history rows to setting names, with a null author once the account is gone', async () => {
    // Arrange
    db.settingChange.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        key: 'ACCENT_COLOR',
        oldValue: 'purple',
        newValue: 'green',
        changedAt: new Date('2026-10-04T14:02:00.000Z'),
        changedBy: null,
      },
    ]);

    // Act
    const { changes } = await getAdminSettings();

    // Assert
    expect(changes).toEqual([
      {
        id: 'ch-1',
        key: 'accentColor',
        oldValue: 'purple',
        newValue: 'green',
        changedAt: '2026-10-04T14:02:00.000Z',
        changedBy: null,
      },
    ]);
    expect(db.settingChange.findMany.mock.calls[0]![0]).toMatchObject({ take: 20 });
  });
});

describe('updateSettings', () => {
  it('writes only what changed, one history row each, with the replaced value and the actor', async () => {
    // Arrange — the tagline was saved before; the colour never was.
    tx.appSetting.findMany.mockResolvedValue([{ key: 'WELCOME_TAGLINE', value: 'Old line' }]);

    // Act
    await updateSettings('admin-1', {
      accentColor: 'green',
      welcomeTagline: '  New   line ',
      announcement: { enabled: false, text: '' },
    });

    // Assert
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.appSetting.upsert).toHaveBeenCalledTimes(2);
    expect(tx.settingChange.create).toHaveBeenCalledWith({
      data: { key: 'ACCENT_COLOR', oldValue: 'purple', newValue: 'green', changedById: 'admin-1' },
    });
    expect(tx.settingChange.create).toHaveBeenCalledWith({
      data: {
        key: 'WELCOME_TAGLINE',
        oldValue: 'Old line',
        newValue: 'New line',
        changedById: 'admin-1',
      },
    });
  });

  it('writes nothing when every value is already current', async () => {
    // Act
    await updateSettings('admin-1', { accentColor: 'purple', welcomeTagline: DEFAULT_TAGLINE });

    // Assert
    expect(tx.appSetting.upsert).not.toHaveBeenCalled();
    expect(tx.settingChange.create).not.toHaveBeenCalled();
  });

  it('refuses an invalid value with 422 before opening a transaction', async () => {
    // Act
    const attempt = updateSettings('admin-1', { accentColor: 'green', welcomeTagline: '' });

    // Assert
    await expect(attempt).rejects.toMatchObject({
      statusCode: 422,
      message: SETTINGS_MESSAGES.taglineEmpty,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
