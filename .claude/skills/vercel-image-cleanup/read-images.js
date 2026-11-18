// Reads the image table of a Vercel Container Registry repository page
// (https://vercel.com/bookrough/bookrough/images/<repository>).
//
// Run with Claude in Chrome's javascript_tool on that page. The rows are table rows (clicking one
// opens the image's own page), and they render a moment after the page loads, so the script waits
// up to 10 s for them. One image can carry several tags: a commit that does not change the backend
// reuses the previous image, so the same image is tagged with every such commit's SHA (12 hex
// characters on the page). Returns JSON { count, images: [{ row, tags, size, digest, published }] },
// where `row` is the row's position in the table (0 = top, the newest). Each image also carries
// `snapshot`, the entry the skill posts to Admin → Overview (null when its size or digest is
// unreadable).
/* global document -- runs in the browser page, not in Node */
await (async () => {
  const sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  const read = () =>
    [...document.querySelectorAll('tr')].filter((r) => /sha256:/.test(r.innerText));
  let rows = read();
  for (let attempt = 0; attempt < 10 && rows.length === 0; attempt++) {
    await sleep(1000);
    rows = read();
  }
  // Admin → Overview's shape (docs/features/admin-overview.md §4.4): bytes, the 12-hex digest, and
  // a publish time estimated from the "N units ago" column (null when unreadable).
  const UNIT = { kB: 1e3, MB: 1e6, GB: 1e9 };
  const AGE = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  };
  const toBytes = (size) => {
    const m = size.match(/^([\d.,]+)\s?(kB|MB|GB)$/);
    return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * UNIT[m[2]]) : null;
  };
  const toTime = (published) => {
    if (published === 'just now') return new Date().toISOString();
    const m = published.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
    return m ? new Date(Date.now() - Number(m[1]) * AGE[m[2]] * 1000).toISOString() : null;
  };
  const images = rows.map((r, row) => {
    const text = r.innerText.replace(/\s+/g, ' ').trim();
    const tags = [...new Set(text.match(/\b[0-9a-f]{12}\b/g) || [])];
    const size = (text.match(/[\d.,]+\s?(?:kB|MB|GB)/) || [''])[0];
    const digest = (text.match(/sha256:[0-9a-f]{12}/) || [''])[0];
    const published = (text.match(/\d+\s+\w+\s+ago|just now/) || [''])[0];
    const sizeBytes = toBytes(size);
    return {
      row,
      tags,
      size,
      digest,
      published,
      snapshot:
        digest && sizeBytes !== null
          ? {
              tags,
              digest: digest.slice('sha256:'.length),
              sizeBytes,
              publishedAt: toTime(published),
            }
          : null,
    };
  });
  return JSON.stringify({ count: images.length, images });
})();
