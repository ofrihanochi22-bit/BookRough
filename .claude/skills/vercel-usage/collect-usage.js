// Reads every "value / limit" meter on the Vercel Usage page (https://vercel.com/<team>/~/usage).
//
// Run with Claude in Chrome's javascript_tool on a freshly loaded Usage tab. The page is a
// virtualised list: a section renders only while it is on screen and unloads afterwards, so the
// script scrolls step by step and keeps what it has seen in window.__vercelUsage. One call stops
// after ~35 s (the tool times out at 45 s); call it again until `done` is true.
// It computes the percentages itself and returns only a summary, so the output is never truncated. Each meter is keyed
// "<group> / <meter>", e.g. "Images / Storage" or "Deployment Storage / Functions Storage".
/* global window, document, Node, setTimeout -- runs in the browser page, not in Node */
await (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ');
  const VALUE = /^\S[^/\n]{0,24}\s\/\s[^\n]{1,20}$/;
  const sc = document.scrollingElement;
  const state = (window.__vercelUsage = window.__vercelUsage || {
    pos: 0,
    pass: 1,
    countAtPassStart: 0,
    complete: false,
    meters: {},
  });

  const grab = () => {
    const groups = [...document.querySelectorAll('main h2')];
    for (const el of document.querySelectorAll('main div, main span, main p')) {
      const v = text(el);
      if (!VALUE.test(v) || !/\d/.test(v)) continue;
      if ([...el.children].some((c) => VALUE.test(text(c)))) continue;
      let a = el;
      let label = null;
      for (let k = 0; k < 8 && a && !label; k++) {
        a = a.parentElement;
        const h = a && a.querySelector('h3, h4, h5, h6, [role=heading]');
        if (h) label = text(h);
      }
      const group = groups
        .filter((g) => g.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
        .pop();
      state.meters[`${group ? text(group) : '?'} / ${label}`] = v;
    }
  };

  // A section can scroll past before it has loaded, so one pass may miss meters. Pass again until a
  // whole pass adds nothing new (at most 4 passes).
  const started = Date.now();
  while (!state.complete && Date.now() - started < 35000) {
    if (state.pos >= sc.scrollHeight) {
      const count = Object.keys(state.meters).length;
      if (count === state.countAtPassStart || state.pass >= 4) {
        state.complete = true;
        break;
      }
      state.pass += 1;
      state.countAtPassStart = count;
      state.pos = 0;
    }
    sc.scrollTo(0, state.pos);
    await sleep(700);
    grab();
    state.pos += window.innerHeight * 0.8;
  }
  const period = (document.body.innerText.match(
    /[A-Z][a-z]{2} \d{1,2}, [\d:]+ - [A-Z][a-z]{2} \d{1,2}, [\d:]+/,
  ) || [''])[0];
  // "5.25 GB", "18m 49s", "1,000,000", "23.4 GB-Hrs" -> one number per kind; "-" (no limit) -> null.
  const UNIT = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
  const amount = (s) => {
    s = s.trim();
    if (s === '-') return null;
    const bytes = s.match(/^([\d.,]+)\s?(B|kB|KB|MB|GB|TB)$/);
    if (bytes) return parseFloat(bytes[1].replace(/,/g, '')) * UNIT[bytes[2]];
    if (/[hms]/.test(s) && !/[A-Za-z]{2}/.test(s.replace(/\s/g, ''))) {
      let sec = 0;
      for (const [, n, u] of s.matchAll(/([\d.]+)\s?([hms])/g))
        sec += n * { h: 3600, m: 60, s: 1 }[u];
      return sec;
    }
    const n = s.match(/^([\d.,]+)/);
    return n ? parseFloat(n[1].replace(/,/g, '')) : NaN;
  };
  const STORAGE = [
    'Deployment Storage / Functions Storage',
    'Images / Storage',
    'Deployment Storage / Deployment Storage',
  ];
  const rows = Object.entries(state.meters).map(([meter, value]) => {
    const [used, limit] = value.split(' / ').map(amount);
    let pct = null;
    if (limit === 0) pct = used > 0 ? 100 : 0;
    else if (limit !== null) pct = Math.round((used / limit) * 1000) / 10;
    return { meter, value, pct };
  });
  const storage = Object.fromEntries(
    rows
      .filter((r) => STORAGE.includes(r.meter))
      .map((r) => [r.meter, { value: r.value, pct: r.pct }]),
  );
  const others = rows
    .filter((r) => !STORAGE.includes(r.meter) && r.pct !== null && !Number.isNaN(r.pct))
    .sort((a, b) => b.pct - a.pct);
  return JSON.stringify({
    done: state.complete,
    pass: state.pass,
    period,
    count: Object.keys(state.meters).length,
    storage,
    flagged: others.filter((r) => r.pct >= 60),
    highestOther: others[0] || null,
    missingStorage: STORAGE.filter((k) => !(k in state.meters)),
    unparsed: rows.filter((r) => Number.isNaN(r.pct)).map((r) => `${r.meter}: ${r.value}`),
  });
})();
