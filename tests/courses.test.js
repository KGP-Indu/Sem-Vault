import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas.js';

const g = loadGas('Catalog.js', 'Profs.js', 'Courses.js');
const plain = (x) => JSON.parse(JSON.stringify(x));

const items = [
  { id: 'a', course: 'IM39005', status: 'approved' },
  { id: 'b', course: 'IM39005', status: 'pending' },
  { id: 'c', course: 'IM31005', status: 'approved' },
  { id: 'd', course: 'IM39005', status: 'removed' },
];
const tips = [{ id: 't1', course: 'IM39005', status: 'approved' }, { id: 't2', course: 'IM31005', status: 'approved' }];

test('moveCourseCode re-points every file and tip, whatever its status', () => {
  const out = plain(g.moveCourseCode(items, tips, 'IM39005', 'IM39010'));
  assert.deepEqual(out.items.map((x) => [x.id, x.course]), [['a', 'IM39010'], ['b', 'IM39010'], ['d', 'IM39010']]);
  assert.deepEqual(out.tips.map((x) => [x.id, x.course]), [['t1', 'IM39010']]);
});

test('moveCourseCode leaves the originals untouched', () => {
  g.moveCourseCode(items, tips, 'IM39005', 'IM39010');
  assert.equal(items[0].course, 'IM39005');
});

test('courseUse counts live and waiting files and tips, not removed or rejected ones', () => {
  assert.equal(g.courseUse(items, tips, 'IM39005'), 3); // a, b and t1
  assert.equal(g.courseUse(items, tips, 'IM99999'), 0);
});

test('validateCourse checks the code shape, name and semester, and tidies the values', () => {
  assert.deepEqual(plain(g.validateCourse({ code: ' im39005 ', name: ' QDC Lab ', short: '', semester: '5' })),
    { ok: true, errors: [], course: { code: 'IM39005', name: 'QDC Lab', short: 'IM39005', semester: 5 } });
  assert.equal(g.validateCourse({ code: 'QDC', name: 'x', semester: 5 }).ok, false);
  assert.equal(g.validateCourse({ code: 'IM39005', name: ' ', semester: 5 }).ok, false);
  assert.equal(g.validateCourse({ code: 'IM39005', name: 'x', semester: 11 }).ok, false);
});
