import { profList } from '../lib/profs.js';
import { esc, courseOf } from './item.js';

export function render(el, params, catalog) {
  const profs = profList(catalog.profs || [], catalog.tips || []);
  el.innerHTML = `
    <h1>Professors</h1>
    <p class="lede">Tips from seniors on how each professor teaches, grades and sets exams. Checked by a mod before they go up.</p>
    <p><a class="btn" href="#/tip">Add a tip</a></p>
    ${profs.length > 6 ? `<label class="sr-only" for="prof-q">Find a professor</label>
      <input id="prof-q" class="prof-filter" type="search" placeholder="Find a professor" autocomplete="off">` : ''}
    ${profs.length ? `<ul class="prof-list">${profs.map((p) => `
      <li data-name="${esc(p.name.toLowerCase())}"><a class="prof-row" href="#/prof/${esc(p.id)}">
        <span class="prof-name">${esc(p.name)}</span>
        <span class="prof-courses">${p.courses.map((c) => esc(courseOf(catalog, c)?.short || c)).join(', ') || '&nbsp;'}</span>
        <span class="course-count">${p.tipCount} tip${p.tipCount === 1 ? '' : 's'}</span>
      </a></li>`).join('')}</ul>`
      : '<p class="empty">No professors yet. Be the first to add a tip.</p>'}`;
  const filter = el.querySelector('#prof-q');
  filter?.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    el.querySelectorAll('.prof-list li').forEach((li) => { li.hidden = q && !li.dataset.name.includes(q); });
  });
}
