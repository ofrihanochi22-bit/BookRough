// Reads the image table of a Vercel Container Registry repository page
// (https://vercel.com/bookrough/bookrough/images/<repository>).
//
// Run with Claude in Chrome's javascript_tool on that page. The rows are table rows (clicking one
// opens the image's own page), and they render a moment after the page loads, so the script waits
// up to 10 s for them. One image can carry several tags: a commit that does not change the backend
// reuses the previous image, so the same image is tagged with every such commit's SHA (12 hex
// characters on the page). Returns JSON { count, images: [{ row, tags, size, digest, published }] },
// where `row` is the row's position in the table (0 = top, the newest).
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
  const images = rows.map((r, row) => {
    const text = r.innerText.replace(/\s+/g, ' ').trim();
    return {
      row,
      tags: [...new Set(text.match(/\b[0-9a-f]{12}\b/g) || [])],
      size: (text.match(/[\d.,]+\s?(?:kB|MB|GB)/) || [''])[0],
      digest: (text.match(/sha256:[0-9a-f]{12}/) || [''])[0],
      published: (text.match(/\d+\s+\w+\s+ago|just now/) || [''])[0],
    };
  });
  return JSON.stringify({ count: images.length, images });
})();
