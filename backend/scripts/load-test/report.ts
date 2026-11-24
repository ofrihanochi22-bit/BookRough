/**
 * results.json → report.html (docs/features/load-test.md §5): one file, inline
 * SVG, no scripts and nothing fetched, so it opens straight from disk.
 */
import { judgeRound, judgeRun, percentile, summarizeRound, type RoundSummary } from './analysis.js';
import { CEILING_MARGIN_MS, CEILING_MS, HEALTH_SLOW_MS, MEMORY_LIMIT_MB } from './config.js';
import type { Outcome, RoundResult, RunResults } from './types.js';

const COLORS: Record<Outcome, string> = {
  converted: '#1D9E75',
  pending: '#BA7517',
  failed: '#E24B4A',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const seconds = (ms: number | null): string => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const megabytes = (mb: number | null): string => (mb === null ? '–' : `${Math.round(mb)} MB`);
const percent = (share: number | null): string =>
  share === null ? '–' : `${Math.round(share * 100)}%`;

// --- charts --------------------------------------------------------------------

const CHART_W = 760;
const PAD = { left: 56, right: 16, top: 16, bottom: 32 };

function axisTicks(max: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count);
}

/** Each request as a bar from send to answer, with its 12 s ceiling as a tick. */
function timelineSvg(round: RoundResult): string {
  const rowH = 9;
  const height = PAD.top + round.requests.length * rowH + PAD.bottom;
  const latest = Math.max(
    CEILING_MS + 5_000,
    ...round.requests.map((r) => r.answeredAt - round.startedAt),
  );
  const spanS = Math.ceil(latest / 1000 / 2) * 2;
  const plotW = CHART_W - PAD.left - PAD.right;
  const x = (ms: number): number => PAD.left + (ms / (spanS * 1000)) * plotW;

  const grid = axisTicks(spanS, spanS / 2)
    .map(
      (s) =>
        `<line x1="${x(s * 1000)}" x2="${x(s * 1000)}" y1="${PAD.top}" y2="${height - PAD.bottom}" class="grid"/>` +
        `<text x="${x(s * 1000)}" y="${height - PAD.bottom + 16}" class="tick" text-anchor="middle">${s}s</text>`,
    )
    .join('');

  const rows = round.requests
    .map((r, i) => {
      const y = PAD.top + i * rowH;
      const sent = r.sentAt - round.startedAt;
      const answered = r.answeredAt - round.startedAt;
      const color = r.failure ? COLORS.failed : COLORS[r.outcome];
      const title = `#${r.index + 1}: ${r.outcome}${r.failure ? ` (${r.failure})` : ''}, ${seconds(r.latencyMs)}`;
      return (
        `<rect x="${x(sent)}" y="${y + 1}" width="${Math.max(1, x(answered) - x(sent))}" height="${rowH - 2}" fill="${color}"><title>${escapeHtml(title)}</title></rect>` +
        `<line x1="${x(sent + CEILING_MS)}" x2="${x(sent + CEILING_MS)}" y1="${y}" y2="${y + rowH}" class="ceiling"/>`
      );
    })
    .join('');

  return `<svg viewBox="0 0 ${CHART_W} ${height}" role="img" aria-label="Request timeline, round of ${round.size}">
<text x="${PAD.left - 8}" y="${PAD.top + 8}" class="tick" text-anchor="end">#1</text>
<text x="${PAD.left - 8}" y="${height - PAD.bottom}" class="tick" text-anchor="end">#${round.requests.length}</text>
${grid}${rows}</svg>`;
}

interface Series {
  label: string;
  color: string;
  points: { x: number; y: number }[];
}

function lineChartSvg(options: {
  series: Series[];
  xMax: number;
  yMax: number;
  xLabel: (v: number) => string;
  yLabel: (v: number) => string;
  xTicks: number[];
  height?: number;
  bands?: { from: number; to: number; label: string }[];
  limit?: { y: number; label: string };
  label: string;
}): string {
  const height = options.height ?? 240;
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (v: number): number => PAD.left + (v / options.xMax) * plotW;
  const y = (v: number): number => PAD.top + plotH - (v / options.yMax) * plotH;

  const bands = (options.bands ?? [])
    .map(
      (b) =>
        `<rect x="${x(b.from)}" y="${PAD.top}" width="${Math.max(1, x(b.to) - x(b.from))}" height="${plotH}" class="band"/>` +
        `<text x="${(x(b.from) + x(b.to)) / 2}" y="${PAD.top + 12}" class="tick" text-anchor="middle">${escapeHtml(b.label)}</text>`,
    )
    .join('');
  const yGrid = axisTicks(options.yMax, 4)
    .map(
      (v) =>
        `<line x1="${PAD.left}" x2="${CHART_W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
        `<text x="${PAD.left - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${escapeHtml(options.yLabel(v))}</text>`,
    )
    .join('');
  const xAxis = options.xTicks
    .map(
      (v) =>
        `<text x="${x(v)}" y="${height - PAD.bottom + 16}" class="tick" text-anchor="middle">${escapeHtml(options.xLabel(v))}</text>`,
    )
    .join('');
  const limit = options.limit
    ? `<line x1="${PAD.left}" x2="${CHART_W - PAD.right}" y1="${y(options.limit.y)}" y2="${y(options.limit.y)}" class="limit"/>` +
      `<text x="${CHART_W - PAD.right}" y="${y(options.limit.y) - 4}" class="tick" text-anchor="end">${escapeHtml(options.limit.label)}</text>`
    : '';
  const lines = options.series
    .map((s) => {
      const path = s.points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
      const dots =
        s.points.length <= 12
          ? s.points
              .map((p) => `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="3" fill="${s.color}"/>`)
              .join('')
          : '';
      return `<polyline points="${path}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
    })
    .join('');
  const legend = options.series
    .map(
      (s) =>
        `<span class="key"><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`,
    )
    .join('');

  return `<div class="legend">${legend}</div><svg viewBox="0 0 ${CHART_W} ${height}" role="img" aria-label="${escapeHtml(options.label)}">${bands}${yGrid}${limit}${lines}${xAxis}</svg>`;
}

function barChartSvg(summaries: RoundSummary[]): string {
  const height = 200;
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, summaries.length);
  const barW = Math.min(64, slot * 0.6);
  const y = (share: number): number => PAD.top + plotH - share * plotH;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (v) =>
        `<line x1="${PAD.left}" x2="${CHART_W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
        `<text x="${PAD.left - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${v * 100}%</text>`,
    )
    .join('');
  const bars = summaries
    .map((s, i) => {
      const cx = PAD.left + slot * i + slot / 2;
      const share = s.conversionRate ?? 0;
      return (
        `<rect x="${cx - barW / 2}" y="${y(share)}" width="${barW}" height="${y(0) - y(share)}" fill="${COLORS.converted}"/>` +
        `<text x="${cx}" y="${y(share) - 6}" class="tick" text-anchor="middle">${percent(s.conversionRate)} (${s.converted})</text>` +
        `<text x="${cx}" y="${height - PAD.bottom + 16}" class="tick" text-anchor="middle">N = ${s.size}</text>`
      );
    })
    .join('');
  return `<svg viewBox="0 0 ${CHART_W} ${height}" role="img" aria-label="Share of posts converted by round">${grid}${bars}</svg>`;
}

// --- sections ------------------------------------------------------------------

function verdictSection(results: RunResults): string {
  const run = judgeRun(results);
  const rows = results.rounds
    .map((round) => {
      const v = judgeRound(round, results.health, results.serverErrors);
      return `<li class="${v.passed ? 'pass' : 'fail'}"><strong>Round of ${round.size}: ${v.passed ? 'passed' : 'failed'}</strong>${
        v.passed ? '' : ` — ${escapeHtml(v.reasons.join('; '))}`
      }</li>`;
    })
    .join('');
  const missing = results.plannedRounds
    .slice(results.rounds.length)
    .map((size) => `<li class="skip"><strong>Round of ${size}: not run</strong></li>`)
    .join('');
  const headline = run.passed
    ? 'Passed: no failures in any round.'
    : `Failed: ${escapeHtml(run.reasons.join('; '))}.`;
  return `<section><h2>Verdict</h2><p class="headline ${run.passed ? 'pass' : 'fail'}">${headline}</p><ul class="verdicts">${rows}${missing}</ul></section>`;
}

function summarySection(summaries: RoundSummary[]): string {
  const rows = summaries
    .map(
      (
        s,
      ) => `<tr><td>${s.size}</td><td>${s.answered}</td><td>${s.converted}</td><td>${s.pending}</td>
<td class="${s.failed > 0 ? 'bad' : ''}">${s.failed}</td><td>${s.repeatedLinks}</td><td>${seconds(s.p50)}</td><td>${seconds(s.p95)}</td>
<td class="${s.max !== null && s.max > CEILING_MS + CEILING_MARGIN_MS ? 'bad' : ''}">${seconds(s.max)}</td>
<td>${megabytes(s.peakMemoryMb)}</td><td class="${(s.worstHealthMs ?? 0) > HEALTH_SLOW_MS || s.healthFailures > 0 ? 'bad' : ''}">${seconds(s.worstHealthMs)}${s.healthFailures > 0 ? ` (${s.healthFailures} failed)` : ''}</td></tr>`,
    )
    .join('');
  return `<section><h2>Summary</h2><table>
<thead><tr><th>N</th><th>Answered</th><th>Converted</th><th>Pending</th><th>Failures</th><th>Repeated links</th><th>p50</th><th>p95</th><th>Max</th><th>Peak memory</th><th>Slowest health check</th></tr></thead>
<tbody>${rows}</tbody></table>
<p class="note">Latency is from send to answer. A pending post is saved with its original link only, by design (CLAUDE.md §7), and is not a failure. "Repeated links" counts links an earlier round already sent: the pool holds fewer links than a full run needs, and squigly.link may answer a repeated link faster. The ceiling is ${CEILING_MS / 1000} s plus a ${CEILING_MARGIN_MS / 1000} s margin.</p></section>`;
}

function reasonsText(reasons: Record<string, number>): string {
  const parts = Object.entries(reasons).map(([reason, count]) => `${reason} × ${count}`);
  return parts.length === 0 ? 'none' : parts.join(', ');
}

function timelinesSection(results: RunResults, summaries: RoundSummary[]): string {
  const legend = (['converted', 'pending', 'failed'] as const)
    .map(
      (o) =>
        `<span class="key"><span class="swatch" style="background:${COLORS[o]}"></span>${o}</span>`,
    )
    .join('');
  const rounds = results.rounds
    .map(
      (round, i) =>
        `<h3>Round of ${round.size}</h3><p class="note">Why posts were not converted, from the server's log: ${escapeHtml(reasonsText(summaries[i]?.pendingReasons ?? {}))}.</p>${timelineSvg(round)}`,
    )
    .join('');
  return `<section><h2>Timelines</h2><p class="note">Each row is one request, from send to answer. The grey tick on each row is that request's ${CEILING_MS / 1000} s ceiling.</p><div class="legend">${legend}<span class="key"><span class="swatch tickswatch"></span>ceiling</span></div>${rounds}</section>`;
}

function latencySection(summaries: RoundSummary[]): string {
  const sizes = summaries.map((s) => s.size);
  const xMax = Math.max(...sizes, 1) * 1.1;
  const pick = (key: 'p50' | 'p95' | 'max'): { x: number; y: number }[] =>
    summaries.filter((s) => s[key] !== null).map((s) => ({ x: s.size, y: (s[key] ?? 0) / 1000 }));
  const yMax = Math.max(16, ...summaries.map((s) => (s.max ?? 0) / 1000 + 2));
  return `<section><h2>Latency by round</h2>${lineChartSvg({
    series: [
      { label: 'p50', color: '#378ADD', points: pick('p50') },
      { label: 'p95', color: '#7F77DD', points: pick('p95') },
      { label: 'max', color: '#D85A30', points: pick('max') },
    ],
    xMax,
    yMax,
    xTicks: sizes,
    xLabel: (v) => `N = ${v}`,
    yLabel: (v) => `${Math.round(v)} s`,
    limit: { y: CEILING_MS / 1000, label: `${CEILING_MS / 1000} s ceiling` },
    label: 'Latency p50, p95 and max by round size',
  })}</section>`;
}

function resourcesSection(results: RunResults): string {
  if (results.samples.length === 0) {
    return '<section><h2>Memory and CPU</h2><p>No samples were recorded.</p></section>';
  }
  const end = Math.max(...results.samples.map((s) => s.t), 1);
  const xTicks = axisTicks(end, 6);
  const bands = results.rounds.map((r) => ({
    from: r.startedAt,
    to: r.endedAt,
    label: `N=${r.size}`,
  }));
  const minutes = (ms: number): string => `${(ms / 60_000).toFixed(1)} min`;
  const peak = Math.max(...results.samples.map((s) => s.memoryMb));
  const memory = lineChartSvg({
    series: [
      {
        label: `memory (peak ${Math.round(peak)} MB)`,
        color: '#7F77DD',
        points: results.samples.map((s) => ({ x: s.t, y: s.memoryMb })),
      },
    ],
    xMax: end,
    yMax: MEMORY_LIMIT_MB,
    xTicks,
    xLabel: minutes,
    yLabel: (v) => `${Math.round(v)} MB`,
    bands,
    limit: { y: MEMORY_LIMIT_MB * 0.98, label: `${MEMORY_LIMIT_MB} MB limit` },
    label: 'Container memory over the run',
  });
  const cpu = lineChartSvg({
    series: [
      {
        label: 'CPU (100% = the one vCPU)',
        color: '#D85A30',
        points: results.samples.map((s) => ({ x: s.t, y: Math.min(s.cpuPercent, 100) })),
      },
    ],
    xMax: end,
    yMax: 100,
    xTicks,
    xLabel: minutes,
    yLabel: (v) => `${Math.round(v)}%`,
    bands,
    height: 200,
    label: 'Container CPU over the run',
  });
  return `<section><h2>Memory and CPU</h2>${memory}${cpu}</section>`;
}

function healthSection(results: RunResults): string {
  const ok = results.health.filter((h) => h.ok).map((h) => h.latencyMs);
  return `<section><h2>Responsiveness</h2><p>While the bursts ran, <code>GET /api/health</code> was called every second: ${results.health.length} checks, ${results.health.length - ok.length} failed, median ${seconds(percentile(ok, 50))}, slowest ${seconds(ok.length ? Math.max(...ok) : null)}.</p></section>`;
}

function failuresSection(results: RunResults): string {
  const rows = results.rounds
    .flatMap((round) => round.requests.filter((r) => r.failure))
    .map(
      (r) =>
        `<tr><td>${r.round}</td><td>#${r.index + 1}</td><td>${seconds(r.sentAt)}</td><td>${escapeHtml(r.failure ?? '')}</td><td>${escapeHtml(r.detail ?? '')}</td></tr>`,
    )
    .join('');
  const errors = results.serverErrors
    .map((e) => `<li>${seconds(e.t)}: ${escapeHtml(e.message)}</li>`)
    .join('');
  const table = rows
    ? `<table><thead><tr><th>Round</th><th>Request</th><th>Sent at</th><th>Kind</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p>No request failed.</p>';
  const errorList = errors ? `<h3>Error-level log lines</h3><ul>${errors}</ul>` : '';
  return `<section><h2>Failures</h2>${table}${errorList}</section>`;
}

function environmentSection(results: RunResults): string {
  const env = results.environment;
  const squigly = results.serverConversions.filter(
    (c) => c.outcome !== 'unavailable' || c.reason !== 'timeout',
  ).length;
  const rows: [string, string][] = env
    ? [
        ['Commit', env.commit],
        ['Image', env.image],
        ['Limits', `${env.memoryLimit} memory, ${env.cpuLimit} vCPU`],
        ['Host', `${env.hostPlatform}, ${env.hostCpus} CPUs, ${env.hostMemoryGb} GB`],
        ['Node in the container', env.nodeInContainer],
        ['Playwright', env.playwright],
      ]
    : [];
  rows.push(
    ['Started', results.startedAt],
    ['Finished', results.finishedAt ?? 'did not finish'],
    [
      'Conversions that reached squigly.link',
      `about ${squigly} (every logged conversion except those that gave up on time; an attempt cut off mid-page is not counted)`,
    ],
  );
  return `<section><h2>Environment</h2><table class="env"><tbody>${rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('')}</tbody></table></section>`;
}

const STYLE = `
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#222;line-height:1.5}
h1{font-size:1.5rem;margin-bottom:.25rem}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}h3{font-size:1rem;margin:1.25rem 0 .25rem}
table{border-collapse:collapse;width:100%;font-size:.875rem}th,td{padding:.35rem .5rem;border-bottom:1px solid #eee;text-align:left}thead th{background:#f6f6f4}
table.env th{width:14rem;font-weight:500;color:#555}
.bad{color:#A32D2D;font-weight:600}.note{color:#666;font-size:.85rem}
.headline{font-weight:600;padding:.5rem .75rem;border-radius:6px}.headline.pass{background:#EAF3DE;color:#27500A}.headline.fail{background:#FCEBEB;color:#791F1F}
.verdicts{list-style:none;padding:0}.verdicts li{padding:.2rem 0}.verdicts .pass strong{color:#3B6D11}.verdicts .fail strong{color:#A32D2D}.verdicts .skip{color:#888}
svg{width:100%;height:auto;display:block;margin:.25rem 0 1rem}
svg .grid{stroke:#eee}svg .tick{font-size:11px;fill:#666}svg .ceiling{stroke:#888;stroke-width:1.5}svg .limit{stroke:#A32D2D;stroke-dasharray:4 4}svg .band{fill:#f3f2ee}
.legend{display:flex;gap:1rem;font-size:.8rem;color:#555;flex-wrap:wrap}.key{display:inline-flex;align-items:center;gap:.35rem}
.swatch{width:12px;height:12px;border-radius:2px;display:inline-block}.tickswatch{width:2px;background:#888}
code{background:#f3f2ee;padding:0 .25rem;border-radius:3px}
`;

export function renderReport(results: RunResults): string {
  const summaries = results.rounds.map((round) =>
    summarizeRound(round, results.samples, results.health, results.serverConversions),
  );
  const status = results.complete ? '' : ' <span class="bad">(incomplete)</span>';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BookRough burst load test — ${escapeHtml(results.startedAt)}</title><style>${STYLE}</style></head>
<body><h1>Burst load test: sending recommendations${status}</h1>
<p class="note">Rounds of ${results.plannedRounds.join(', ')} <code>POST /api/recommendations</code> requests, each spread over 5 seconds, against the backend image on this machine. Plan: docs/features/load-test.md.</p>
${verdictSection(results)}
${results.rounds.length > 0 ? summarySection(summaries) : ''}
${results.rounds.length > 0 ? latencySection(summaries) : ''}
${results.rounds.length > 0 ? `<section><h2>Conversion rate by round</h2>${barChartSvg(summaries)}</section>` : ''}
${resourcesSection(results)}
${healthSection(results)}
${timelinesSection(results, summaries)}
${failuresSection(results)}
${environmentSection(results)}
</body></html>
`;
}
