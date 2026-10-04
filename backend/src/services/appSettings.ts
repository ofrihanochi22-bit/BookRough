import { type Prisma, type SettingKey } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { cleanLine, graphemeCount, hasOnlyPrintableCharacters } from './textRules.js';

/**
 * The admin area's presentation settings — docs/features/admin-panel.md §3.2.
 * This registry is the single source of truth: the three keys, their rules
 * and their defaults. A new setting needs a new spec, never just a new row.
 *
 * The frontend mirrors the limits, palette and default tagline in
 * frontend/src/lib/appSettings.ts; a change here must be made there too.
 */

const log = createLogger('appSettings');

export const ACCENT_COLORS = ['purple', 'blue', 'green', 'orange', 'pink'] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export const BANNER_MAX_GRAPHEMES = 140;
export const TAGLINE_MAX_GRAPHEMES = 80;
export const DEFAULT_TAGLINE = 'Share music with friends, on whatever app they use.';

export interface Announcement {
  enabled: boolean;
  text: string;
}

export interface Settings {
  announcement: Announcement;
  accentColor: AccentColor;
  welcomeTagline: string;
}

export type SettingName = keyof Settings;

export const SETTINGS_MESSAGES = {
  bannerLength: `The banner text can be up to ${BANNER_MAX_GRAPHEMES} characters.`,
  bannerEmpty: 'Write the banner text before turning it on.',
  bannerCharacter: "The banner text has a character that isn't allowed.",
  taglineEmpty: 'The tagline cannot be empty.',
  taglineLength: `The tagline can be up to ${TAGLINE_MAX_GRAPHEMES} characters.`,
  taglineCharacter: "The tagline has a character that isn't allowed.",
  accentColor: 'Choose one of the listed colours.',
} as const;

type Check<T> = { ok: true; value: T } | { ok: false; message: string };

export function checkAnnouncement(input: Announcement): Check<Announcement> {
  const text = cleanLine(input.text);
  if (!hasOnlyPrintableCharacters(text)) {
    return { ok: false, message: SETTINGS_MESSAGES.bannerCharacter };
  }
  if (graphemeCount(text) > BANNER_MAX_GRAPHEMES) {
    return { ok: false, message: SETTINGS_MESSAGES.bannerLength };
  }
  if (input.enabled && text === '') {
    return { ok: false, message: SETTINGS_MESSAGES.bannerEmpty };
  }
  return { ok: true, value: { enabled: input.enabled, text } };
}

export function checkTagline(raw: string): Check<string> {
  const tagline = cleanLine(raw);
  if (tagline === '') {
    return { ok: false, message: SETTINGS_MESSAGES.taglineEmpty };
  }
  if (!hasOnlyPrintableCharacters(tagline)) {
    return { ok: false, message: SETTINGS_MESSAGES.taglineCharacter };
  }
  if (graphemeCount(tagline) > TAGLINE_MAX_GRAPHEMES) {
    return { ok: false, message: SETTINGS_MESSAGES.taglineLength };
  }
  return { ok: true, value: tagline };
}

export function checkAccentColor(raw: string): Check<AccentColor> {
  return (ACCENT_COLORS as readonly string[]).includes(raw)
    ? { ok: true, value: raw as AccentColor }
    : { ok: false, message: SETTINGS_MESSAGES.accentColor };
}

/** Shape checks for a stored JSON value, before its rules are applied. */
const announcementShape = z.object({ enabled: z.boolean(), text: z.string() }).strict();

interface Entry<T> {
  key: SettingKey;
  defaultValue: T;
  /** Validates a value from a request or from the database. */
  check: (value: unknown) => Check<T>;
}

const REGISTRY: { [N in SettingName]: Entry<Settings[N]> } = {
  announcement: {
    key: 'ANNOUNCEMENT',
    defaultValue: { enabled: false, text: '' },
    check: (value) => {
      const shape = announcementShape.safeParse(value);
      return shape.success ? checkAnnouncement(shape.data) : { ok: false, message: 'bad shape' };
    },
  },
  accentColor: {
    key: 'ACCENT_COLOR',
    defaultValue: 'purple',
    check: (value) =>
      typeof value === 'string' ? checkAccentColor(value) : { ok: false, message: 'bad shape' },
  },
  welcomeTagline: {
    key: 'WELCOME_TAGLINE',
    defaultValue: DEFAULT_TAGLINE,
    check: (value) =>
      typeof value === 'string' ? checkTagline(value) : { ok: false, message: 'bad shape' },
  },
};

const NAMES = Object.keys(REGISTRY) as SettingName[];
const NAME_BY_KEY = Object.fromEntries(NAMES.map((name) => [REGISTRY[name].key, name])) as Record<
  SettingKey,
  SettingName
>;

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Every setting, from the database or its default. A stored value the current
 * rules reject (an old palette name, say) reads as the default, with a WARN —
 * the app never breaks over a bad setting.
 */
async function readSettings(db: Db): Promise<Settings> {
  const rows = await db.appSetting.findMany();
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const settings = {} as Record<SettingName, unknown>;

  for (const name of NAMES) {
    const entry = REGISTRY[name];
    if (!stored.has(entry.key)) {
      settings[name] = entry.defaultValue;
      continue;
    }
    const checked = entry.check(stored.get(entry.key));
    if (checked.ok) {
      settings[name] = checked.value;
    } else {
      log.warn({ key: entry.key }, 'Stored setting failed validation; using the default');
      settings[name] = entry.defaultValue;
    }
  }
  return settings as unknown as Settings;
}

/** GET /api/settings — what the app applies. The banner is for signed-in users only. */
export async function getPublicSettings(signedIn: boolean) {
  const settings = await readSettings(prisma);
  const base = { accentColor: settings.accentColor, welcomeTagline: settings.welcomeTagline };
  if (!signedIn) {
    return base;
  }
  const { announcement } = settings;
  return { ...base, announcement: announcement.enabled ? { text: announcement.text } : null };
}

export interface SettingChangeView {
  id: string;
  key: SettingName;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
  changedBy: { id: string; displayName: string | null } | null;
}

const HISTORY_LENGTH = 20;

/** GET /api/admin/settings — the values and the last 20 changes, newest first. */
export async function getAdminSettings(): Promise<{
  settings: Settings;
  changes: SettingChangeView[];
}> {
  const [settings, changes] = await Promise.all([
    readSettings(prisma),
    prisma.settingChange.findMany({
      orderBy: [{ changedAt: 'desc' }, { id: 'asc' }],
      take: HISTORY_LENGTH,
      select: {
        id: true,
        key: true,
        oldValue: true,
        newValue: true,
        changedAt: true,
        changedBy: { select: { id: true, displayName: true } },
      },
    }),
  ]);

  return {
    settings,
    changes: changes.map((change) => ({
      id: change.id,
      key: NAME_BY_KEY[change.key],
      oldValue: change.oldValue,
      newValue: change.newValue,
      changedAt: change.changedAt.toISOString(),
      changedBy: change.changedBy
        ? { id: change.changedBy.id, displayName: change.changedBy.displayName }
        : null,
    })),
  };
}

export type SettingsUpdate = {
  announcement?: Announcement | undefined;
  accentColor?: string | undefined;
  welcomeTagline?: string | undefined;
};

/** Any constant: it only has to be the same for every settings write. */
const SETTINGS_LOCK = 1907;

/**
 * PATCH /api/admin/settings. Every value is validated before anything is
 * written; then, in one transaction, each setting that actually changed is
 * stored and gets one history row with the value it replaced. A setting sent
 * with its current value writes nothing.
 */
export async function updateSettings(actorId: string, update: SettingsUpdate) {
  const wanted = new Map<SettingName, unknown>();
  for (const name of NAMES) {
    if (update[name] === undefined) {
      continue;
    }
    const checked = REGISTRY[name].check(update[name]);
    if (!checked.ok) {
      throw new AppError(checked.message, 422);
    }
    wanted.set(name, checked.value);
  }

  const changed = await prisma.$transaction(async (tx) => {
    // Serialises settings writes, so the "old value" in each history row is
    // the one this write really replaced, even with two admins saving at once.
    // Raw SQL because Prisma has no advisory locks (CLAUDE.md §4).
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${SETTINGS_LOCK})`;
    const current = await readSettings(tx);
    const keys: SettingKey[] = [];

    for (const [name, value] of wanted) {
      const oldValue = current[name];
      if (JSON.stringify(oldValue) === JSON.stringify(value)) {
        continue;
      }
      const { key } = REGISTRY[name];
      const json = value as Prisma.InputJsonValue;
      await tx.appSetting.upsert({
        where: { key },
        create: { key, value: json },
        update: { value: json },
      });
      await tx.settingChange.create({
        data: {
          key,
          oldValue: oldValue as Prisma.InputJsonValue,
          newValue: json,
          changedById: actorId,
        },
      });
      keys.push(key);
    }
    return keys;
  });

  if (changed.length > 0) {
    // The keys, never the texts.
    log.info({ userId: actorId, keys: changed }, 'Settings changed');
  }
  return getAdminSettings();
}
