/**
 * @file diff.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML } from './html.js';

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

// NOTE: a line diff by longest common subsequence. Construct definitions are
// a few hundred lines at most, so the simple table is fast enough. Lines
// are compared with surrounding whitespace ignored, so re-indenting alone
// shows no change.
export function diffLines (
  earlierLines,
  currentLines
) {
  const a = earlierLines.map((line) => line.trim());
  const b = currentLines.map((line) => line.trim());
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ kind: 'same', text: currentLines[j], earlierLine: i, currentLine: j });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      result.push({ kind: 'removed', text: earlierLines[i], earlierLine: i });
      i++;
    } else {
      result.push({ kind: 'added', text: currentLines[j], currentLine: j });
      j++;
    }
  }
  for (; i < a.length; i++) {
    result.push({ kind: 'removed', text: earlierLines[i], earlierLine: i });
  }
  for (; j < b.length; j++) {
    result.push({ kind: 'added', text: currentLines[j], currentLine: j });
  }
  return result;
}

// NOTE: shows changed lines with up to `context` unchanged lines around
// them; longer unchanged runs fold into a "lines unchanged" marker. Line
// numbers are the real ones in each release's schema file.
export function renderDiff (
  earlier,
  current,
  context = 3
) {
  const entries = diffLines(earlier.sourceLines, current.sourceLines);
  const keep = entries.map(() => false);
  entries.forEach((entry, index) => {
    if (entry.kind !== 'same') {
      for (let k = Math.max(0, index - context); k <= Math.min(entries.length - 1, index + context); k++) {
        keep[k] = true;
      }
    }
  });
  const lines = [];
  let skipped = 0;
  entries.forEach((entry, index) => {
    if (!keep[index]) {
      skipped++;
      return;
    }
    if (skipped > 0) {
      lines.push(`<span class="diff-skip">… ${skipped} unchanged ${skipped === 1 ? 'line' : 'lines'}</span>`);
      skipped = 0;
    }
    const earlierNumber = entry.earlierLine === undefined ? '' : earlier.startLine + entry.earlierLine;
    const currentNumber = entry.currentLine === undefined ? '' : current.startLine + entry.currentLine;
    const mark = { same: ' ', added: '+', removed: '−' }[entry.kind];
    lines.push(`<span class="diff-line diff-line--${entry.kind}"><span class="line-number">${earlierNumber}</span><span class="line-number">${currentNumber}</span><span class="diff-mark" aria-hidden="true">${mark}</span>${escapeHTML(entry.text)}</span>`);
  });
  if (skipped > 0) {
    lines.push(`<span class="diff-skip">… ${skipped} unchanged ${skipped === 1 ? 'line' : 'lines'}</span>`);
  }
  if (!entries.some((entry) => entry.kind !== 'same')) {
    return '<p class="small muted">The definitions differ only in whitespace or attribute order.</p>';
  }
  return `<div class="code-window diff"><pre>${lines.join('')}</pre></div>`;
}

// NOTE: whether two definitions differ only in their annotations.
export function isDocumentationOnly (
  earlier,
  current
) {
  const strip = (canonical) => canonical.replace(/<(\w+:)?annotation\b[\s\S]*?<\/(\w+:)?annotation>/g, '').replace(/\s+/g, ' ');
  return strip(earlier.canonical) === strip(current.canonical);
}
