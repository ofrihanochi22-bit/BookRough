// Reads every "value / limit" meter on the Vercel Usage page (https://vercel.com/<team>/~/usage).
//
// Run with Claude in Chrome's javascript_tool on a freshly loaded Usage tab. The page is a
// virtualised list: a section renders only while it is on screen and unloads afterwards, so the
// script scrolls step by step and keeps what it has seen in window.__vercelUsage. One call stops
// after ~35 s (the tool times out at 45 s); call it again until `done` is true. Each meter is keyed
// "<group> / <meter>", e.g. "Images / Storage" or "Deployment Storage / Functions Storage".
await (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ');
  const VALUE = /^\S[^/\n]{0,24}\s\/\s[^\n]{1,20}$/;
  const sc = document.scrollingElement;
  const state = (window.__vercelUsage = window.__vercelUsage || { pos: 0, meters: {} });

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

  const started = Date.now();
  while (Date.now() - started < 35000 && state.pos < sc.scrollHeight) {
    sc.scrollTo(0, state.pos);
    await sleep(700);
    grab();
    state.pos += window.innerHeight * 0.8;
  }
  const period = (document.body.innerText.match(
    /[A-Z][a-z]{2} \d{1,2}, [\d:]+ - [A-Z][a-z]{2} \d{1,2}, [\d:]+/,
  ) || [''])[0];
  return JSON.stringify({
    done: state.pos >= sc.scrollHeight,
    period,
    count: Object.keys(state.meters).length,
    meters: state.meters,
  });
})();
