/**
 * @file html.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

// NOTE: every value placed into page markup goes through escapeHTML, because
// package contents (schemas, samples, decision text) come from other people.
export function escapeHTML (
  value
) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNumber (
  value
) {
  return Number(value ?? 0).toLocaleString('en-US');
}

export function formatDate (
  isoText
) {
  const date = new Date(isoText);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function encodeSegment (
  value
) {
  return encodeURIComponent(value);
}

// NOTE: renders `backtick` spans in trusted-format text (decision titles and
// options from the register) as <code>, escaping everything else.
export function formatInlineCode (
  text
) {
  return String(text ?? '')
    .split('`')
    .map((part, i) => (i % 2 === 1 ? `<code>${escapeHTML(part)}</code>` : escapeHTML(part)))
    .join('');
}
