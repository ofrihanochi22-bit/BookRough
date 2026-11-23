import { describe, expect, it } from 'vitest';

import { request, results, round } from './fixtures.js';
import { escapeHtml, renderReport } from './report.js';

const count = (text: string, needle: string): number => text.split(needle).length - 1;

describe('escapeHtml', () => {
  it('escapes every character that could break out of HTML', () => {
    // Act
    const escaped = escapeHtml(`<script>alert("x") & 'y'</script>`);

    // Assert
    expect(escaped).toBe('&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;');
  });
});

describe('renderReport', () => {
  it('renders the verdict, one summary row per round, and one bar per request', () => {
    // Arrange
    const run = results();

    // Act
    const html = renderReport(run);

    // Assert
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('Passed: no failures in any round.');
    expect(html).toContain('Round of 2: passed');
    expect(count(html, '<tbody><tr><td>2</td>')).toBe(1);
    expect(count(html, '<title>#')).toBe(2);
    expect(html).toContain('No request failed.');
    expect(html).toContain('timeout × 1');
    expect(html).toContain('abc1234');
  });

  it('loads nothing from outside the file', () => {
    // Act
    const html = renderReport(results());

    // Assert
    expect(html).not.toMatch(/<script|<link|src="http/);
  });

  it('lists every failure with its detail, escaped', () => {
    // Arrange
    const failing = round({
      requests: [
        request({
          index: 4,
          outcome: 'failed',
          failure: 'server_error',
          detail: '500: <oops>',
          postId: null,
        }),
      ],
    });

    // Act
    const html = renderReport(results({ rounds: [failing] }));

    // Assert
    expect(html).toContain('Round of 2: failed');
    expect(html).toContain('<td>#5</td>');
    expect(html).toContain('500: &lt;oops&gt;');
    expect(html).not.toContain('500: <oops>');
  });

  it('renders an interrupted run as incomplete, with the rounds it never ran', () => {
    // Arrange
    const run = results({
      complete: false,
      abortReason: 'interrupted (Ctrl+C)',
      finishedAt: null,
      plannedRounds: [2, 20, 30],
    });

    // Act
    const html = renderReport(run);

    // Assert
    expect(html).toContain('(incomplete)');
    expect(html).toContain('incomplete: interrupted (Ctrl+C)');
    expect(html).toContain('Round of 20: not run');
    expect(html).toContain('Round of 30: not run');
    expect(html).toContain('did not finish');
  });

  it('renders a run that stopped before any round, without throwing', () => {
    // Arrange
    const run = results({
      complete: false,
      abortReason: 'Docker is not running.',
      environment: null,
      rounds: [],
      samples: [],
      health: [],
      serverConversions: [],
    });

    // Act
    const html = renderReport(run);

    // Assert
    expect(html).toContain('incomplete: Docker is not running.');
    expect(html).toContain('No samples were recorded.');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});
