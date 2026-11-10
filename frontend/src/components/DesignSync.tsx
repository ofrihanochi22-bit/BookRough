import { useEffect } from 'react';

import { THEME_COLORS } from '../lib/design';
import { useDesignStore } from '../stores/design';

/**
 * Applies the device's design choice — docs/features/ui-redesign.md §4: the
 * `data-design` attribute on <html> (the Mixtape tokens hang off it) and the
 * `theme-color` meta tags. Renders nothing; a switch flipped mid-session
 * applies at once, with no reload.
 */
export function DesignSync() {
  const design = useDesignStore((state) => state.design);

  useEffect(() => {
    const root = document.documentElement;
    if (design === 'mixtape') {
      root.dataset.design = 'mixtape';
    } else {
      delete root.dataset.design;
    }
    const colors = THEME_COLORS[design];
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const dark = meta.media.includes('dark');
      meta.content = dark ? colors.dark : colors.light;
    }
  }, [design]);

  return null;
}
