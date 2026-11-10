import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DESIGN_STORAGE_KEY } from '../lib/design';
import { useDesignStore } from '../stores/design';
import { setDesign } from '../test/fixtures';
import { DesignSync } from './DesignSync';

function addThemeMeta(media: string, content: string) {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.media = media;
  meta.content = content;
  document.head.append(meta);
  return meta;
}

let light: HTMLMetaElement;
let dark: HTMLMetaElement;

beforeEach(() => {
  window.localStorage.clear();
  light = addThemeMeta('(prefers-color-scheme: light)', '#fbfaf7');
  dark = addThemeMeta('(prefers-color-scheme: dark)', '#151413');
});

afterEach(() => {
  light.remove();
  dark.remove();
  setDesign('current');
  delete document.documentElement.dataset.design;
});

describe('DesignSync (ui-redesign.md §4)', () => {
  it('leaves <html> without data-design and keeps the Current theme colours', () => {
    // Act
    render(<DesignSync />);

    // Assert
    expect(document.documentElement).not.toHaveAttribute('data-design');
    expect(light.content).toBe('#fbfaf7');
    expect(dark.content).toBe('#151413');
  });

  it('applies Mixtape at once when switched mid-session, and back again', () => {
    // Arrange
    render(<DesignSync />);

    // Act
    act(() => useDesignStore.getState().setDesign('mixtape'));

    // Assert
    expect(document.documentElement).toHaveAttribute('data-design', 'mixtape');
    expect(light.content).toBe('#ECEAF4');
    expect(dark.content).toBe('#1B1A2E');
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe('mixtape');

    // Act
    act(() => useDesignStore.getState().setDesign('current'));

    // Assert
    expect(document.documentElement).not.toHaveAttribute('data-design');
    expect(light.content).toBe('#fbfaf7');
    expect(dark.content).toBe('#151413');
  });
});
