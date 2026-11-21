import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semesters, coursePage, filterPyqs, search, driveUrls, TYPE_ORDER, TYPE_LABELS } from '../site/js/lib/catalog.js';

const courses = [
  { code: 'IM31005', name: 'Quality Design and Control', short: 'QDC', semester: 5 },
  { code: 'IM21203', name: 'Engineering Economy', short: 'EngEco', semester: 4 },
  { code: 'IM31003', name: 'Supply Chain Management', short: 'SCM', semester: 5 },
];
const it = (id, extra) => ({ id, course: 'IM31005', type: 'shortnotes', title: id, description: '', year: '', ...extra });

test('semesters groups courses ascending, courses sorted by code', () => {
  assert.deepEqual(semesters(courses).map((s) => [s.semester, s.courses.map((c) => c.code)]),
    [[4, ['IM21203']], [5, ['IM31003', 'IM31005']]]);
});

test('the six sections have the agreed names, in order', () => {
  assert.deepEqual(TYPE_ORDER.map((t) => TYPE_LABELS[t]),
    ['Books', 'PPTs & class notes', 'Short notes & formulas', 'PYQs', 'Tests', 'Assignments']);
});

test('coursePage always lists all six sections, even empty ones', () => {
  const page = coursePage([it('p', { type: 'pyq' })], 'IM31005');
  assert.deepEqual(page.sections.map((s) => [s.type, s.items.length]),
    [['book', 0], ['slides', 0], ['shortnotes', 0], ['pyq', 1], ['test', 0], ['assignment', 0]]);
  assert.equal(page.total, 1);
});

test('coursePage sorts each section newest year first, then by title', () => {
  const items = [it('b'), it('a'), it('old', { year: 2022 }), it('new', { year: 2025 })];
  assert.deepEqual(coursePage(items, 'IM31005').sections[2].items.map((x) => x.id), ['new', 'old', 'a', 'b']);
});

test('coursePage never shows items from other courses', () => {
  const page = coursePage([it('x', { course: 'IM31003' })], 'IM31005');
  assert.equal(page.total, 0);
});

const pyq = (id, course, year, term, exam) => it(id, { type: 'pyq', course, year, term, exam });
const pyqs = [pyq('a', 'IM31005', 2024, 'autumn', 'midsem'), pyq('b', 'IM31005', 2025, 'autumn', 'midsem'),
  pyq('c', 'IM31005', 2025, 'autumn', 'endsem'), pyq('d', 'IM21203', 2023, 'spring', 'endsem'), it('n')];

test('filterPyqs with no filter returns all pyqs, newest first, endsem before midsem', () => {
  assert.deepEqual(filterPyqs(pyqs, {}).map((x) => x.id), ['c', 'b', 'a', 'd']);
});

test('filterPyqs narrows by course, year, term and exam', () => {
  assert.deepEqual(filterPyqs(pyqs, { course: 'IM31005', exam: 'midsem' }).map((x) => x.id), ['b', 'a']);
  assert.deepEqual(filterPyqs(pyqs, { year: '2023' }).map((x) => x.id), ['d']);
  assert.deepEqual(filterPyqs(pyqs, { term: 'spring' }).map((x) => x.id), ['d']);
});

test('search matches title, description and course names, case-insensitive', () => {
  const items = [it('Control Charts'), it('z', { description: 'CUSUM and EWMA' }), it('y', { course: 'IM21203' })];
  assert.deepEqual(search(items, courses, 'control').map((x) => x.id), ['Control Charts', 'z']);
  assert.deepEqual(search(items, courses, 'ewma').map((x) => x.id), ['z']);
  assert.deepEqual(search(items, courses, 'engeco').map((x) => x.id), ['y']);
  assert.deepEqual(search(items, courses, '  '), []);
});

test('driveUrls builds view and download links', () => {
  assert.deepEqual(driveUrls('abc'), {
    view: 'https://drive.google.com/file/d/abc/view',
    download: 'https://drive.google.com/uc?export=download&id=abc',
  });
});
