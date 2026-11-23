import { coursePage, TYPE_LABELS } from '../lib/catalog.js';
import { profsForCourse } from '../lib/profs.js';
import { esc, itemRow, courseOf } from './item.js';

export function render(el, params, catalog) {
  const course = courseOf(catalog, params.code);
  if (!course) {
    el.innerHTML = `<p class="empty">There's no course with code ${esc(params.code)}. <a href="#/">See all courses</a>.</p>`;
    return;
  }
  const page = coursePage(catalog.items, course.code);
  const profs = profsForCourse(catalog.tips || [], catalog.profs || [], course.code);
  el.innerHTML = `
    <nav class="crumbs"><a href="#/sem/${course.semester}">Semester ${course.semester}</a></nav>
    <h1 class="course-title">${esc(course.name)}</h1>
    <p class="course-sub">${esc(course.code)}, ${page.total} file${page.total === 1 ? '' : 's'}</p>
    ${profs.length ? `<p class="course-profs">Taught by ${profs.map((p) =>
      `<a href="#/prof/${esc(p.id)}">${esc(p.name)}</a> <span class="section-note">(${esc(p.years.join(', '))})</span>`).join(', ')}.
      <a href="#/profs">Tips on profs</a></p>` : ''}
    <div class="sections">
    ${page.sections.map((s) => `
      <details class="group" data-type="${s.type}"${s.items.length ? '' : ' data-empty'}>
        <summary><span>${TYPE_LABELS[s.type]}</span><span class="group-count">${s.items.length}</span></summary>
        ${s.items.length
          ? `<div data-pickscope><p class="pick-all"><button class="link-btn" type="button" data-pickall>Select all</button></p>
            <ul class="items">${s.items.map((i) => itemRow(i)).join('')}</ul></div>`
          : `<p class="empty">Nothing here yet. Have some? <a href="#/upload?course=${esc(course.code)}&type=${s.type}">Upload it</a>.</p>`}
      </details>`).join('')}
    </div>
  `;
}
