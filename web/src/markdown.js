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

// NOTE: a deliberately small Markdown renderer for the decision register's
// text and for comments: paragraphs, "- " lists, pipe tables, **bold** and
// `code`. Everything is escaped first, so no HTML in the source survives.
export function renderMarkdown (
  text
) {
  const blocks = String(text ?? '').replace(/\r\n/g, '\n').split(/\n\s*\n/);
  return blocks.map(renderBlock).filter(Boolean).join('\n');
}

function renderBlock (
  block
) {
  const lines = block.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return '';
  }
  if (lines.every((line) => line.trim().startsWith('|'))) {
    return renderTable(lines);
  }
  if (/^\s*[-*] /.test(lines[0])) {
    const items = [];
    for (const line of lines) {
      if (/^\s*[-*] /.test(line)) {
        items.push(line.replace(/^\s*[-*] /, ''));
      } else if (items.length > 0) {
        items[items.length - 1] += ` ${line.trim()}`;
      }
    }
    return `<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
  }
  if (/^#{1,6} /.test(lines[0])) {
    return `<p><strong>${renderInline(lines[0].replace(/^#+ /, ''))}</strong></p>${lines.length > 1 ? `<p>${renderInline(lines.slice(1).join(' '))}</p>` : ''}`;
  }
  return `<p>${renderInline(lines.map((line) => line.trim()).join(' '))}</p>`;
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
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
