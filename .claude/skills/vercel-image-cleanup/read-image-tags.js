// Reads every tag of one image from its own page in the Vercel Container Registry
// (https://vercel.com/bookrough/bookrough/images/api/image_<id>).
//
// Run with Claude in Chrome's javascript_tool on that page when read-images.js reported the image
// with `tagsComplete: false`: the repository table folds tags past the fifth into "+N", and the
// image page lists them all under "Image tags" (docs/features/image-cleanup-hidden-tags.md). The
// page renders a moment after it loads, so the script waits up to 10 s for that section.
// Returns JSON { count, tags, digest }: the tags (12 hex characters each) and the manifest digest
// as "sha256:" + 12 hex, to compare with the table row's. `count` 0 means the section was not found
// (not an image page, or the layout changed): the skill then keeps the image.
/* global document -- runs in the browser page, not in Node */
await (async () => {
  const sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  const section = () => {
    const text = document.body.innerText;
    const start = text.indexOf('Image tags');
    if (start < 0) return null;
    // The section runs to the next one, "Image layers"; without it, to the end of the page.
    const end = text.indexOf('Image layers', start);
    return text.slice(start, end < 0 ? undefined : end);
  };
  let tagsText = section();
  for (let attempt = 0; attempt < 10 && tagsText === null; attempt++) {
    await sleep(1000);
    tagsText = section();
  }
  const tags = tagsText ? [...new Set(tagsText.match(/\b[0-9a-f]{12}\b/g) || [])] : [];
  const digest = (document.body.innerText.match(/sha256:[0-9a-f]{12}/) || [''])[0];
  return JSON.stringify({ count: tags.length, tags, digest });
})();
