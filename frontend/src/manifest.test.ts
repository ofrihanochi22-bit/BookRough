import { describe, expect, it } from 'vitest';

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

function lightCanvas(): string | undefined {
  return /--canvas:\s*(#[0-9a-f]{6})/i.exec(indexCss)?.[1];
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
    const canvas = lightCanvas();

    // Assert
    expect(canvas).toBe('#fbfaf7');
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

  it('registers no service worker yet — that is Step 6.2', () => {
    // Assert
    for (const source of [indexHtml, mainSource]) {
      expect(source).not.toMatch(/serviceWorker\.register|registerSW/);
    }
  });
});
