/**
 * Renders the PNG icon set from public/icons/icon.svg — docs/features/pwa-installable.md §3.2.
 * Run by hand when the SVG changes, never in CI or the build; the PNGs are committed.
 *
 *   npm ci --prefix e2e && npx --prefix e2e playwright install chromium   (once)
 *   node frontend/scripts/render-icons.mjs
 *
 * Chromium comes from the e2e package's Playwright, so the frontend gains no dependency.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const svg = await readFile(`${publicDir}icons/icon.svg`, 'utf8');

const outputs = [
  { file: 'icons/icon-192.png', size: 192 },
  { file: 'icons/icon-512.png', size: 512 },
  { file: 'icons/icon-512-maskable.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
try {
  for (const { file, size } of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: `${publicDir}${file}`, omitBackground: false });
    await page.close();
    console.info(`wrote ${file} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
