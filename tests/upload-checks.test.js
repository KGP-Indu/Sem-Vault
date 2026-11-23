import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadErrors, MAX_BYTES } from '../site/js/lib/upload.js';

const ok = { title: 'Notes', course: 'IM31005', type: 'slides', file: { name: 'a.pdf', size: 1000 } };

test('a valid upload has no errors', () => {
  assert.deepEqual(uploadErrors(ok), {});
});

test('a file over 25 MB is blocked with a clear message', () => {
  assert.equal(uploadErrors({ ...ok, file: { name: 'a.pdf', size: 30 * 1024 * 1024 } }).file, 'Max 25 MB per file');
});

test('a missing file, title or course is flagged', () => {
  const e = uploadErrors({ ...ok, title: ' ', course: '', file: null });
  assert.equal(e.title, 'Give it a title');
  assert.equal(e.course, 'Pick a course');
  assert.equal(e.file, 'Choose a file');
});

test('a not-listed course needs a name', () => {
  assert.equal(uploadErrors({ ...ok, course: 'OTHER:' }).course, 'Type the course name');
  assert.deepEqual(uploadErrors({ ...ok, course: 'OTHER:Ergonomics' }), {});
});

// ---- batch upload ----
import { rowDefaults } from '../site/js/lib/upload.js';

const f = (name, size = 10) => ({ name, size });

const courses = [{ code: 'IM31005', short: 'QDC', name: 'Quality Design and Control', semester: 5 }];

test('rowDefaults reads a question paper name into course, type, year, term, exam and a short title', () => {
  assert.deepEqual(rowDefaults('12834_IM31005_QUALITY-DESIGN-AND-CONTROL_2025_autumn_endsem.pdf', courses, { course: '', type: 'shortnotes' }),
    { title: 'QDC endsem 2025', course: 'IM31005', type: 'pyq', year: '2025', term: 'autumn', exam: 'endsem' });
});

test('rowDefaults falls back to the chosen course and type and a tidy title', () => {
  assert.deepEqual(rowDefaults('control_charts-summary.pdf', courses, { course: 'IM31005', type: 'slides' }),
    { title: 'control charts summary', course: 'IM31005', type: 'slides', year: '', term: '', exam: '' });
});

test('rowDefaults ignores a course code that is not on the site', () => {
  assert.equal(rowDefaults('IM99999_x_2024_midsem.pdf', courses, { course: 'IM31005', type: 'pyq' }).course, 'IM31005');
});
