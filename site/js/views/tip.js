import { post, previewMode } from '../api.js';
import { semesters } from '../lib/catalog.js';
import { tipErrors, TIP_MAX } from '../lib/profs.js';
import { esc } from './item.js';

export function render(el, params, catalog) {
  const profs = [...(catalog.profs || [])].sort((a, b) => a.name.localeCompare(b.name));
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= 2010; y--) years.push(y);
  el.innerHTML = `
    <nav class="crumbs"><a href="#/profs">Professors</a></nav>
    <h1>Add a tip</h1>
    <p class="lede">Help juniors know what to expect: how the prof teaches, how they grade, what the exams are like, attendance rules, what to focus on. Keep it about the course, not the person. A mod reads every tip before it goes up.</p>
    ${previewMode ? '<p class="notice">Preview mode: the site isn\'t connected to the server yet, so tips can\'t be sent.</p>' : ''}
    <form class="upload-form" novalidate data-tipform>
      <div class="field">
        <label for="tip-prof">Professor</label>
        <select id="tip-prof" name="prof">
          <option value="">Pick a professor</option>
          ${profs.map((p) => `<option value="${esc(p.id)}"${params.prof === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
          <option value="NEW">Not listed</option>
        </select>
        <div class="field-extra" data-newprof hidden>
          <label for="tip-newprof">Professor's name</label>
          <input id="tip-newprof" name="newProf" type="text" maxlength="80" placeholder="e.g. Prof. A. K. Sharma">
        </div>
        <p class="form-error" data-err="prof"></p>
      </div>
      <div class="field-row">
        <label>Course<select name="course">
          <option value="">Pick a course</option>
          ${semesters(catalog.courses).map((s) => `<optgroup label="Semester ${s.semester}">${s.courses.map((c) =>
            `<option value="${esc(c.code)}">${esc(c.short)} (${esc(c.code)})</option>`).join('')}</optgroup>`).join('')}
        </select></label>
        <label>Year taught<select name="year"><option value="">Not sure</option>${years.map((y) => `<option>${y}</option>`).join('')}</select></label>
      </div>
      <p class="form-error" data-err="course"></p>
      <div class="field">
        <label for="tip-text">Your tip</label>
        <textarea id="tip-text" name="text" rows="6" maxlength="${TIP_MAX}" placeholder="e.g. Endsem is mostly numericals in the PYQ pattern. Class tests are surprise ones, so keep up weekly. Attendance below 75% gets reported."></textarea>
        <p class="hint" data-count>0 / ${TIP_MAX}</p>
        <p class="form-error" data-err="text"></p>
      </div>
      <div class="field">
        <label for="tip-name">Your name <span class="optional">optional, shown with the tip</span></label>
        <input id="tip-name" name="authorName" type="text" maxlength="60" autocomplete="name">
      </div>
      <div class="hp" aria-hidden="true"><label>Leave this empty<input name="hp" type="text" tabindex="-1" autocomplete="off"></label></div>
      <p class="form-error" data-err="server" role="alert"></p>
      <button class="btn btn-big" type="submit">Send for review</button>
    </form>`;

  const form = el.querySelector('[data-tipform]');
  const showNew = () => { form.querySelector('[data-newprof]').hidden = form.prof.value !== 'NEW'; };
  form.prof.addEventListener('change', showNew);
  form.text.addEventListener('input', () => {
    form.querySelector('[data-count]').textContent = `${form.text.value.length} / ${TIP_MAX}`;
  });
  showNew();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = { prof: form.prof.value, newProf: form.newProf.value, course: form.course.value, text: form.text.value };
    const errors = tipErrors(v);
    form.querySelectorAll('[data-err]').forEach((p) => { p.textContent = errors[p.dataset.err] || ''; });
    if (Object.keys(errors).length) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await post('submitTip', {
        hp: form.hp.value,
        tip: {
          profId: v.prof === 'NEW' ? '' : v.prof, newProfName: v.prof === 'NEW' ? v.newProf.trim() : '',
          course: v.course, year: form.year.value, text: v.text.trim(), authorName: form.authorName.value.trim(),
        },
      });
      el.innerHTML = `
        <h1>Thanks, your tip is in the queue</h1>
        <p class="notice success">A mod will read it, usually within a day, and then it shows on the professor's page.</p>
        <p><a class="btn" href="#/tip?n=${Date.now()}">Add another tip</a> <a class="btn btn-quiet" href="#/profs">Back to professors</a></p>`;
    } catch (err) {
      form.querySelector('[data-err="server"]').textContent = `Couldn't send: ${err.message}`;
      btn.disabled = false;
      btn.textContent = 'Send for review';
    }
  });
}
