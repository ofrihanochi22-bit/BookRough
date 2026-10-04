import { describe, expect, it } from 'vitest';

import {
  accentLabel,
  bannerProblem,
  isAccentColor,
  SETTINGS_MESSAGES,
  taglineProblem,
} from './appSettings';
import { describeChange } from './settingsHistory';

describe('the mirrored rules', () => {
  it.each([
    [true, 'Party tonight', null],
    [false, '', null],
    [false, 'x'.repeat(140), null],
    [false, 'x'.repeat(141), SETTINGS_MESSAGES.bannerLength],
    [true, '   ', SETTINGS_MESSAGES.bannerEmpty],
    [true, 'Hi​there', SETTINGS_MESSAGES.bannerCharacter],
  ])('banner enabled=%s %j -> %s', (enabled, text, expected) => {
    // Act / Assert
    expect(bannerProblem(enabled, text)).toBe(expected);
  });

  it.each([
    ['Music from friends.', null],
    ['y'.repeat(80), null],
    ['   ', SETTINGS_MESSAGES.taglineEmpty],
    ['y'.repeat(81), SETTINGS_MESSAGES.taglineLength],
    ['Music‮from friends', SETTINGS_MESSAGES.taglineCharacter],
  ])('tagline %j -> %s', (tagline, expected) => {
    // Act / Assert
    expect(taglineProblem(tagline)).toBe(expected);
  });

  it('knows the palette', () => {
    // Act / Assert
    expect(isAccentColor('green')).toBe(true);
    expect(isAccentColor('teal')).toBe(false);
    expect(accentLabel('orange')).toBe('Orange');
    expect(accentLabel('teal')).toBe('teal');
  });
});

describe('describeChange', () => {
  const base = { id: 'c', changedAt: '2026-10-04T14:02:00.000Z' };
  const ofri = { id: 'u', displayName: 'Ofri' };

  it.each([
    [
      { key: 'accentColor', oldValue: 'purple', newValue: 'green', changedBy: ofri },
      'Ofri changed the accent colour from Purple to Green',
    ],
    [
      { key: 'welcomeTagline', oldValue: 'a', newValue: 'Music.', changedBy: ofri },
      'Ofri changed the tagline to “Music.”',
    ],
    [
      {
        key: 'announcement',
        oldValue: { enabled: false, text: '' },
        newValue: { enabled: true, text: 'Hi' },
        changedBy: ofri,
      },
      'Ofri turned on the banner: “Hi”',
    ],
    [
      {
        key: 'announcement',
        oldValue: { enabled: true, text: 'Hi' },
        newValue: { enabled: false, text: 'Hi' },
        changedBy: ofri,
      },
      'Ofri turned off the banner',
    ],
    [
      {
        key: 'announcement',
        oldValue: { enabled: true, text: 'Hi' },
        newValue: { enabled: true, text: 'Bye' },
        changedBy: null,
      },
      'Deleted account changed the banner text to “Bye”',
    ],
  ] as const)('%j', (change, expected) => {
    // Act / Assert
    expect(describeChange({ ...base, ...change })).toBe(expected);
  });
});
