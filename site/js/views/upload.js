import { post, previewMode } from '../api.js';
import { semesters, TYPE_ORDER } from '../lib/catalog.js';
import { uploadErrors, readBase64, rowDefaults } from '../lib/upload.js';
import { esc } from './item.js';

const TYPE_HELP = {
  book: 'Book', slides: 'PPT or class notes', shortnotes: 'Short notes or formulas', pyq: 'Question paper (PYQ)',
  test: 'Class test or quiz', assignment: 'Assignment or lab report',
};

// Several files in one go. Each file is its own row (title, course, section), filled in from the
// file name. Files are sent one at a time (each must fit Apps Script's request limit), with a status line per row.
export function render(el, params, catalog) {
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= 2010; y--) years.push(y);
  const startType = TYPE_ORDER.includes(params.type) ? params.type : 'shortnotes';
  const startCourse = catalog.courses.some((c) => c.code === params.course) ? params.course : '';
  let rows = [];
  let nextId = 1;

  el.innerHTML = `
    <h1>Upload</h1>
    <p class="lede">Share notes, books, PYQs and more. Pick one file or many at once. A mod checks every upload before it goes on the site, usually within a day.</p>
    ${previewMode ? '<p class="notice">Preview mode: the site isn\'t connected to the server yet, so uploads are switched off.</p>' : ''}
    <form class="upload-form" novalidate data-upload>
      <div class="field">
        <label for="up-files">Files</label>
        <input id="up-files" name="files" type="file" multiple>
        <p class="hint">Max 25 MB each. Pick several at once if you like. Question papers downloaded from the KGP library site fill in their details by themselves.</p>
      </div>
      <div class="field-row">
        <label>Course for these files<select name="course">
          <option value="">Pick a course</option>
          ${courseOptions(catalog.courses, startCourse)}
          <option value="OTHER:">Not listed</option>
        </select></label>
        <label class="field-extra" data-other hidden>Course name and code<input name="other" type="text" placeholder="e.g. Ergonomics, IM31010"></label>
      </div>
      <fieldset class="field">
        <legend>What are they?</legend>
        <div class="chips">
          ${TYPE_ORDER.map((t) => `<label class="chip"><input type="radio" name="type" value="${t}"${t === startType ? ' checked' : ''}><span>${TYPE_HELP[t]}</span></label>`).join('')}
        </div>
        <p class="hint">Applies to every file; change any single file below.</p>
      </fieldset>
      <div data-rows></div>
      <div class="field-row">
        <label>Your name <span class="optional">optional</span><input name="uploaderName" type="text" autocomplete="name"></label>
        <label>Email <span class="optional">optional, only mods see it</span><input name="uploaderEmail" type="email" autocomplete="email"></label>
      </div>
      <div class="hp" aria-hidden="true"><label>Leave this empty<input name="hp" type="text" tabindex="-1" autocomplete="off"></label></div>
      <p class="form-error" data-err="server" role="alert"></p>
      <button class="btn btn-big" type="submit" data-submit>Upload for review</button>
    </form>`;

  const form = el.querySelector('[data-upload]');
  const list = form.querySelector('[data-rows]');
  const shared = () => ({
    course: form.course.value === 'OTHER:' ? 'OTHER:' + form.other.value.trim() : form.course.value,
    type: form.type.value,
  });
  const pending = () => rows.filter((r) => r.status !== 'done');

  const drawRows = () => {
    const btn = form.querySelector('[data-submit]');
    const left = pending().length;
    btn.textContent = left > 1 ? `Upload ${left} files for review` : 'Upload for review';
    if (!rows.length) {
      list.innerHTML = '<p class="empty">No files chosen yet.</p>';
      return;
    }
    list.innerHTML = `<ul class="up-rows">${rows.map((r) => rowHtml(r, catalog.courses, years)).join('')}</ul>`;
  };

  form.files.addEventListener('change', () => {
    const s = shared();
    for (const file of form.files.files) {
      const d = rowDefaults(file.name, catalog.courses, s);
      // A course or section read from the file name counts as set by hand: the shared choice won't override it.
      rows.push({ id: nextId++, file, description: '', status: '', touched: { course: d.course !== s.course, type: d.type !== s.type }, ...d });
    }
    form.files.value = ''; // so picking more files adds to the list
    drawRows();
  });

  // Shared course/type flow into rows the person hasn't set by hand.
  const applyShared = () => {
    const s = shared();
    for (const r of pending()) {
      if (!r.touched.course) r.course = s.course;
      if (!r.touched.type) r.type = s.type;
    }
    drawRows();
  };
  form.course.addEventListener('change', () => {
    form.querySelector('[data-other]').hidden = form.course.value !== 'OTHER:';
    applyShared();
  });
  form.other.addEventListener('change', applyShared);
  form.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener('change', applyShared));

  // Edits inside a row.
  list.addEventListener('input', (e) => {
    const li = e.target.closest('[data-row]');
    if (!li) return;
    const r = rows.find((x) => x.id === Number(li.dataset.row));
    const k = e.target.dataset.k;
    if (!k) return;
    r[k] = e.target.value;
    r.touched[k] = true;
    if (k === 'type') drawRows(); // shows or hides the year/term/exam fields
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-row]');
    if (!li) return;
    if (e.target.matches('[data-drop]')) {
      rows = rows.filter((x) => x.id !== Number(li.dataset.row));
      drawRows();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const serverErr = form.querySelector('[data-err="server"]');
    serverErr.textContent = '';
    const todo = pending();
    if (!todo.length) {
      serverErr.textContent = 'Choose at least one file.';
      return;
    }
    let bad = 0;
    for (const r of todo) {
      const errs = uploadErrors({ title: r.title, course: r.course, file: r.file });
      r.status = Object.keys(errs).length ? 'error' : '';
      r.message = Object.values(errs).join('. ');
      if (r.status) bad++;
    }
    drawRows();
    if (bad) {
      serverErr.textContent = `Fix the ${bad === 1 ? 'file' : `${bad} files`} marked below first.`;
      return;
    }
    const btn = form.querySelector('[data-submit]');
    btn.disabled = true;
    form.files.disabled = true;
    let ok = 0;
    for (const [i, r] of todo.entries()) {
      r.status = 'sending';
      r.message = `Uploading ${i + 1} of ${todo.length}…`;
      drawRows();
      try {
        const meta = {
          course: r.course, type: r.type, title: r.title.trim(), description: r.description.trim(),
          year: r.year, term: r.term, exam: r.exam,
          uploaderName: form.uploaderName.value.trim(), uploaderEmail: form.uploaderEmail.value.trim(),
        };
        const body = { meta, hp: form.hp.value,
          file: { name: r.file.name, mimeType: r.file.type || 'application/octet-stream', base64: await readBase64(r.file) } };
        await post('upload', body);
        r.status = 'done';
        r.message = 'Uploaded';
        ok++;
      } catch (err) {
        r.status = 'error';
        r.message = `Failed: ${err.message}`;
        if (err.code === 429) break; // hourly limit: the rest would fail too
      }
    }
    btn.disabled = false;
    form.files.disabled = false;
    drawRows();
    const failed = pending().length;
    serverErr.textContent = '';
    if (!failed) {
      el.innerHTML = `
        <h1>Thanks, ${ok === 1 ? "it's" : `all ${ok} are`} in the queue</h1>
        <p class="notice success">A mod will review ${ok === 1 ? 'it' : 'them'}, usually within a day, and then ${ok === 1 ? 'it shows' : 'they show'} up on the course page.</p>
        <p><a class="btn" href="#/upload" data-again>Upload more</a> <a class="btn btn-quiet" href="#/">Back to courses</a></p>`;
      el.querySelector('[data-again]').addEventListener('click', (ev) => { ev.preventDefault(); render(el, params, catalog); });
    } else {
      serverErr.textContent = `${ok} uploaded, ${failed} not. Check the files marked below and press Upload again to retry them.`;
    }
  });

  drawRows();
}

function courseOptions(courses, selected) {
  return semesters(courses).map((s) => `<optgroup label="Semester ${s.semester}">${s.courses.map((c) =>
    `<option value="${esc(c.code)}"${c.code === selected ? ' selected' : ''}>${esc(c.name)} (${esc(c.code)})</option>`).join('')}</optgroup>`).join('');
}

function rowHtml(r, courses, years) {
  const done = r.status === 'done';
  const sel = (v, cur) => (String(v) === String(cur) ? ' selected' : '');
  const isOther = String(r.course).startsWith('OTHER:');
  return `
  <li class="up-row${r.status ? ` is-${r.status}` : ''}" data-row="${r.id}">
    <div class="up-row-head">
      <span class="up-file">${esc(r.file.name)}</span>
      ${done ? '' : '<button class="link-btn" type="button" data-drop>Remove</button>'}
    </div>
    ${done ? '' : `
    <div class="up-row-grid">
      <label class="span">Title<input data-k="title" type="text" value="${esc(r.title)}"></label>
      <label>Course<select data-k="course">
        <option value=""${sel('', r.course)}>Pick a course</option>
        ${isOther ? `<option value="${esc(r.course)}" selected>Not listed: ${esc(r.course.slice(6))}</option>` : ''}
        ${semesters(courses).map((s) => s.courses.map((c) => `<option value="${esc(c.code)}"${sel(c.code, r.course)}>${esc(c.short)} (${esc(c.code)})</option>`).join('')).join('')}
      </select></label>
      <label>Section<select data-k="type">${TYPE_ORDER.map((t) => `<option value="${t}"${sel(t, r.type)}>${TYPE_HELP[t]}</option>`).join('')}</select></label>
      ${r.type === 'pyq' ? `
      <label>Year<select data-k="year"><option value="">?</option>${years.map((y) => `<option${sel(y, r.year)}>${y}</option>`).join('')}</select></label>
      <label>Term<select data-k="term"><option value="">?</option><option value="autumn"${sel('autumn', r.term)}>Autumn</option><option value="spring"${sel('spring', r.term)}>Spring</option></select></label>
      <label>Exam<select data-k="exam"><option value="">?</option><option value="midsem"${sel('midsem', r.exam)}>Midsem</option><option value="endsem"${sel('endsem', r.exam)}>Endsem</option></select></label>` : ''}
      <label class="span">What's in it? <span class="optional">optional</span><input data-k="description" type="text" value="${esc(r.description)}"></label>
    </div>`}
    ${r.message ? `<p class="up-status">${esc(r.message)}</p>` : ''}
  </li>`;
}
