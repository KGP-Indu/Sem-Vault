// Shared rendering helpers for item rows.
import { driveUrls, TYPE_SINGULAR } from '../lib/catalog.js';
import { esc } from '../lib/esc.js';
import { pickBox } from '../pick.js';

export { esc };

export function courseOf(catalog, code) {
  return catalog.courses.find((c) => c.code === code);
}

function meta(item) {
  if (item.type !== 'pyq') return TYPE_SINGULAR[item.type] || '';
  const exam = { midsem: 'Midsem', endsem: 'Endsem' }[item.exam] || 'Question paper';
  return [exam, item.term, item.year].filter(Boolean).join(' ');
}

// Sample data (dev/sample-catalog.json) points at Drive files that don't exist.
export const isSample = (fileId) => String(fileId || '').startsWith('sample-');

export function itemRow(item, { showCourse = null } = {}) {
  if (isSample(item.fileId)) return sampleRow(item, showCourse);
  const f = driveUrls(item.fileId);
  return `
  <li class="item">
    ${pickBox(item)}
    <div class="item-text">
      <a class="item-title" href="${f.view}" target="_blank" rel="noopener">${esc(item.title)}</a>
      <p class="item-meta">${esc(meta(item))}${showCourse ? `, <a href="#/course/${esc(showCourse.code)}">${esc(showCourse.short)}</a>` : ''}</p>
      ${item.description ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
    </div>
    <div class="item-actions">
      <a class="btn" href="${f.download}">Download</a>
    </div>
  </li>`;
}

function sampleRow(item, showCourse) {
  return `
  <li class="item">
    ${pickBox(item)}
    <div class="item-text">
      <span class="item-title">${esc(item.title)}</span>
      <p class="item-meta">${esc(meta(item))}${showCourse ? `, <a href="#/course/${esc(showCourse.code)}">${esc(showCourse.short)}</a>` : ''}</p>
      ${item.description ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
    </div>
    <div class="item-actions">
      <button class="btn" type="button" disabled title="Sample entry: there is no real file yet">Download</button>
    </div>
  </li>`;
}
