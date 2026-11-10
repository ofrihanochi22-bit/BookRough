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

// As index.html ships since the swap: Mixtape's attribute and bar colours.
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.design = 'mixtape';
  light = addThemeMeta('(prefers-color-scheme: light)', '#ECEAF4');
  dark = addThemeMeta('(prefers-color-scheme: dark)', '#1B1A2E');
});

afterEach(() => {
  light.remove();
  dark.remove();
  setDesign('current');
  delete document.documentElement.dataset.design;
});

describe('DesignSync (ui-redesign.md §4)', () => {
  it('keeps the static Mixtape attribute and colours on a device left on the default', () => {
    // Arrange
    setDesign('mixtape');

    // Act
    render(<DesignSync />);

    // Assert
    expect(document.documentElement).toHaveAttribute('data-design', 'mixtape');
    expect(light.content).toBe('#ECEAF4');
    expect(dark.content).toBe('#1B1A2E');
  });

  it('removes data-design and sets the Current theme colours on a device on Current', () => {
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
