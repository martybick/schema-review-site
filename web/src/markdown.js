/**
 * @file markdown.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML } from './html.js';

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

// NOTE: a deliberately small Markdown renderer for the decision register,
// comments and the user manual: paragraphs, "- " and "1. " lists, pipe
// tables, fenced code, **bold**, `code` and [links](url). Everything is
// escaped first, so no HTML in the source survives; links go only to
// http(s) addresses and the site's own #/ pages. With `headings`, "#"
// lines become headings with ids (the manual); without, they become bold
// paragraphs (text written inside a page that has its own headings).
export function renderMarkdown (
  text,
  {
    headings = false
  } = {}
) {
  const source = String(text ?? '').replace(/\r\n/g, '\n');
  const parts = source.split(/^```[^\n]*\n([\s\S]*?)^```\s*$/m);
  return parts.map((part, index) => index % 2 === 1
    ? `<div class="code-window"><pre>${escapeHTML(part.replace(/\n$/, ''))}</pre></div>`
    : part.split(/\n\s*\n/).map((block) => renderBlock(block, headings)).filter(Boolean).join('\n'))
    .join('\n');
}

// NOTE: "Getting In" -> "getting-in", for heading ids and page sections.
export function getSlug (
  text
) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function renderBlock (
  block,
  headings
) {
  const lines = block.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return '';
  }
  if (lines.every((line) => line.trim().startsWith('|'))) {
    return renderTable(lines);
  }
  if (/^\s*[-*] /.test(lines[0])) {
    return `<ul>${collectItems(lines, /^\s*[-*] /).map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
  }
  if (/^\s*\d+\. /.test(lines[0])) {
    return `<ol>${collectItems(lines, /^\s*\d+\. /).map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`;
  }
  const heading = /^(#{1,6}) (.*)$/.exec(lines[0]);
  if (heading) {
    const rest = lines.length > 1 ? `<p>${renderInline(lines.slice(1).join(' '))}</p>` : '';
    if (!headings) {
      return `<p><strong>${renderInline(heading[2])}</strong></p>${rest}`;
    }
    const level = Math.min(heading[1].length, 4);
    return `<h${level} id="${getSlug(heading[2])}">${renderInline(heading[2])}</h${level}>${rest}`;
  }
  return `<p>${renderInline(lines.map((line) => line.trim()).join(' '))}</p>`;
}

function collectItems (
  lines,
  marker
) {
  const items = [];
  for (const line of lines) {
    if (marker.test(line)) {
      items.push(line.replace(marker, ''));
    } else if (items.length > 0) {
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }
  return items;
}

function renderTable (
  lines
) {
  const rows = lines
    .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  if (rows.length === 0) {
    return '';
  }
  const [header, ...body] = rows;
  return `<div class="table-box"><table><thead><tr>${header.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderInline (
  text
) {
  return escapeHTML(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#\/)[^\s)]+)\)/g, (match, label, address) => address.startsWith('#')
      ? `<a href="${address}">${label}</a>`
      : `<a href="${address}" target="_blank" rel="noopener">${label}</a>`);
}
