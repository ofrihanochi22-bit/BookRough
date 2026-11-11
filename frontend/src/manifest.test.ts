import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { CassetteMark } from './components/ui/Cassette';

/**
 * The installable-PWA contract (docs/features/pwa-installable.md §3, §7).
 *
 * The files are read from disk through Node's `fs`, reached with
 * `process.getBuiltinModule` and typed by hand: the frontend has no Node type
 * definitions (production-deploy.md §9), and Vite's `?inline` / `?raw` imports
 * do not give a PNG's bytes or a CSS file's text under Vitest (`css: false`).
 */
interface NodeFs {
  readFileSync(path: string): Uint8Array;
  existsSync(path: string): boolean;
}

const { process } = globalThis as unknown as {
  process: { getBuiltinModule(id: 'node:fs'): NodeFs; cwd(): string };
};
const fs = process.getBuiltinModule('node:fs');

/** A file under frontend/ — Vitest's root and the working directory of every test script. */
function file(path: string): string {
  return `${process.cwd()}/${path}`;
}

function text(path: string): string {
  return new TextDecoder().decode(fs.readFileSync(file(path)));
}

/** A served path ("/icons/icon-192.png") as a file under public/. */
function served(path: string): string {
  return file(`public${path}`);
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): string {
  const bytes = fs.readFileSync(served(path));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return `${view.getUint32(16)}x${view.getUint32(20)}`;
}

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

const manifest = JSON.parse(text('public/manifest.webmanifest')) as Record<string, unknown> & {
  icons: ManifestIcon[];
};
const indexHtml = text('index.html');
const indexCss = text('src/index.css');
const mainSource = text('src/main.tsx');

/** The light canvas token (ui-redesign.md §3.1). */
function lightCanvas(): string | undefined {
  return /:root\s*\{[^}]*?--canvas:\s*(#[0-9a-f]{6})/i.exec(indexCss)?.[1];
}

/** The dark canvas token: the `:root` block inside the dark-scheme media query. */
function darkCanvas(): string | undefined {
  return /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{[^}]*?--canvas:\s*(#[0-9a-f]{6})/i.exec(
    indexCss,
  )?.[1];
}

/** The `theme-color` meta for one scheme. */
function themeColor(scheme: 'light' | 'dark'): string | undefined {
  const tag = `<meta name="theme-color" content="(#[0-9a-f]{6})" media="[(]prefers-color-scheme: ${scheme}[)]"`;
  return new RegExp(tag, 'i').exec(indexHtml)?.[1];
}

describe('manifest.webmanifest', () => {
  it('names the app and opens it standalone at the root', () => {
    // Assert
    expect(manifest).toMatchObject({
      name: 'BookRough',
      short_name: 'BookRough',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
  });

  it('takes its colours from the light canvas token', () => {
    // Arrange
    const canvas = lightCanvas()?.toLowerCase();

    // Assert
    expect(canvas).toBe('#eceaf4');
    expect(manifest.theme_color).toBe(canvas);
    expect(manifest.background_color).toBe(canvas);
  });

  it('lists a 192 and a 512 icon, and a 512 maskable icon', () => {
    // Act
    const listed = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`);

    // Assert
    expect(listed).toEqual(
      expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
    );
  });

  it('points every icon at a PNG that exists and has the declared size', () => {
    // Act & Assert
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(fs.existsSync(served(icon.src)), icon.src).toBe(true);
      expect(pngSize(icon.src), icon.src).toBe(icon.sizes);
    }
  });

  it('does not lock the orientation', () => {
    // Assert
    expect(manifest).not.toHaveProperty('orientation');
  });
});

describe('index.html', () => {
  it('paints the browser bar with the canvas token of each scheme (ui-redesign.md §3.1)', () => {
    // Arrange
    const light = lightCanvas()?.toLowerCase();
    const dark = darkCanvas()?.toLowerCase();

    // Assert
    expect(light).toBe('#eceaf4');
    expect(dark).toBe('#1b1a2e');
    expect(themeColor('light')?.toLowerCase()).toBe(light);
    expect(themeColor('dark')?.toLowerCase()).toBe(dark);
  });

  it('links the manifest, the SVG favicon and a 180 px apple-touch-icon', () => {
    // Assert
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(indexHtml).toContain('<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />');
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(pngSize('/apple-touch-icon.png')).toBe('180x180');
  });

  it("carries Safari's home-screen tags and keeps the full-bleed viewport", () => {
    // Assert
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-title" content="BookRough" />');
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    );
    expect(indexHtml).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  it('leaves the service worker to UpdatePrompt, which main.tsx mounts', () => {
    // Assert
    expect(mainSource).toContain('<UpdatePrompt />');
    for (const source of [indexHtml, mainSource]) {
      expect(source).not.toMatch(/serviceWorker\.register|registerSW/);
    }
  });
});

describe('icons/icon.svg (pwa-icons-cassette.md §5)', () => {
  const svg = new DOMParser().parseFromString(
    text('public/icons/icon.svg'),
    'image/svg+xml',
  ).documentElement;
  const mark = svg.querySelector('g');

  /**
   * Every drawn shape under `parent`, in paint order, as its tag and sorted
   * attributes — grouping (`<g>`) and attribute order do not matter.
   */
  function shape(parent: Element | null): string[] {
    return Array.from(parent?.querySelectorAll('rect, circle, path') ?? [], (child) => {
      const attributes = Array.from(child.attributes, (a) => `${a.name}=${a.value.toLowerCase()}`);
      return `${child.tagName.toLowerCase()} ${attributes.sort().join(' ')}`;
    });
  }

  /** The mark's placement: `translate(x y) scale(s)` on the group. */
  function placement(): { x: number; y: number; s: number } {
    const match = /translate\(([\d.]+)[ ,]+([\d.]+)\)\s*scale\(([\d.]+)\)/.exec(
      mark?.getAttribute('transform') ?? '',
    );
    expect(match, 'transform').not.toBeNull();
    const [, x, y, s] = match ?? [];
    return { x: Number(x), y: Number(y), s: Number(s) };
  }

  it('draws the CassetteMark exactly as the logo component renders it', () => {
    // Arrange
    const { getByTestId } = render(createElement(CassetteMark));
    const logo = getByTestId('cassette-mark');

    // Act & Assert
    expect(logo.getAttribute('viewBox')).toBe('0 0 104 66');
    expect(shape(mark)).toEqual(shape(logo));
  });

  it('sits on a full-bleed dark canvas square', () => {
    // Arrange
    const background = svg.children[0];

    // Assert
    expect(svg.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(background?.tagName).toBe('rect');
    expect(background?.getAttribute('width')).toBe('512');
    expect(background?.getAttribute('height')).toBe('512');
    expect(background?.hasAttribute('rx')).toBe(false);
    expect(background?.getAttribute('fill')?.toLowerCase()).toBe('#1b1a2e');
  });

  it('centres the mark inside the maskable safe circle', () => {
    // Arrange
    const { x, y, s } = placement();
    const [width, height] = [104 * s, 66 * s];

    // Act
    const farthestCorner = Math.hypot(width / 2, height / 2);

    // Assert
    expect(x + width / 2).toBeCloseTo(256, 1);
    expect(y + height / 2).toBeCloseTo(256, 1);
    expect(farthestCorner).toBeLessThanOrEqual(512 * 0.4);
  });

  it('no longer carries the placeholder purple', () => {
    // Assert
    expect(text('public/icons/icon.svg').toLowerCase()).not.toContain('#534ab7');
  });
});
