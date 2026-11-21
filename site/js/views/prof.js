import { profPage } from '../lib/profs.js';
import { esc, courseOf } from './item.js';

export function render(el, params, catalog) {
  const page = profPage(catalog.tips || [], catalog.profs || [], params.id);
  if (!page) {
    el.innerHTML = '<p class="empty">This professor isn\'t listed. <a href="#/profs">See all professors</a>.</p>';
    return;
  }
  const { prof, courses, tips } = page;
  const courseName = (code) => {
    const c = courseOf(catalog, code);
    return c ? `<a href="#/course/${esc(code)}">${esc(c.name)}</a>` : esc(code);
  };
  el.innerHTML = `
    <nav class="crumbs"><a href="#/profs">Professors</a></nav>
    <h1>${esc(prof.name)}</h1>
    ${prof.dept ? `<p class="course-sub">${esc(prof.dept)}</p>` : ''}
    ${courses.length ? `<h2>Courses</h2><ul class="prof-taught">${courses.map((c) =>
      `<li>${courseName(c.code)}${c.years.length ? ` <span class="section-note">${esc(c.years.join(', '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
    <h2>Tips from students</h2>
    <p><a class="btn btn-quiet" href="#/tip?prof=${esc(prof.id)}">Add a tip about ${esc(prof.name)}</a></p>
    ${tips.length ? `<ul class="tips">${tips.map((t) => `
      <li class="tip">
        <p class="tip-text">${esc(t.text)}</p>
        <p class="item-meta">${[courseOf(catalog, t.course)?.short || t.course, t.year, t.authorName ? `by ${t.authorName}` : '']
          .filter(Boolean).map(esc).join(', ')}</p>
      </li>`).join('')}</ul>` : '<p class="empty">No tips yet.</p>'}`;
}
