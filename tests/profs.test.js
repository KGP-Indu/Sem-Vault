import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas.js';
import { profsForCourse, profPage, profList, tipErrors } from '../site/js/lib/profs.js';

const g = loadGas('Catalog.js', 'Profs.js');
const plain = (x) => JSON.parse(JSON.stringify(x));

// ---- backend (apps-script/Profs.js) ----

test('tip rows round-trip and year comes back as a number', () => {
  const tip = { id: 'tp_1', profId: 'pf_1', course: 'IM31005', year: 2025, text: 'Grades mostly on the endsem.', authorName: '',
    submittedAt: '2026-11-21T00:00:00.000Z', status: 'pending', reviewedBy: '', reviewedAt: '', rejectReason: '' };
  const row = g.tipToRow(tip).map(String);
  assert.deepEqual(plain(g.rowToTip(row)), tip);
});

test('prof rows round-trip', () => {
  const prof = { id: 'pf_1', name: 'Prof. A. Sharma', dept: 'IM', status: 'approved', addedBy: 'm@x.com', addedAt: '2026-11-21T00:00:00.000Z' };
  assert.deepEqual(plain(g.rowToProf(g.profToRow(prof))), prof);
});

const goodTip = { profId: 'pf_1', course: 'IM31005', year: '2025', text: 'Endsem repeats PYQ patterns, practise those.' };

test('validateTip accepts a normal tip', () => {
  assert.deepEqual(plain(g.validateTip(goodTip)), { ok: true, errors: [] });
});

test('validateTip needs a prof (existing or new name), a course and 20-1500 characters', () => {
  assert.equal(g.validateTip({ ...goodTip, profId: '' }).ok, false);
  assert.equal(g.validateTip({ ...goodTip, profId: '', newProfName: 'Prof. B. Rao' }).ok, true);
  assert.equal(g.validateTip({ ...goodTip, course: '' }).ok, false);
  assert.equal(g.validateTip({ ...goodTip, text: 'too short' }).ok, false);
  assert.equal(g.validateTip({ ...goodTip, text: 'x'.repeat(1501) }).ok, false);
});

test('validateTip rejects a silly year but allows a blank one', () => {
  assert.equal(g.validateTip({ ...goodTip, year: '1890' }).ok, false);
  assert.equal(g.validateTip({ ...goodTip, year: '' }).ok, true);
});

test('findProfByName ignores case, spaces and Prof./Dr. titles', () => {
  const profs = [{ id: 'pf_1', name: 'Prof. A. K. Sharma', status: 'approved' }, { id: 'pf_2', name: 'B Rao', status: 'pending' }];
  assert.equal(g.findProfByName(profs, 'dr a k  sharma').id, 'pf_1');
  assert.equal(g.findProfByName(profs, 'A.K. Sharma').id, 'pf_1');
  assert.equal(g.findProfByName(profs, 'C Iyer'), null);
});

test('publicTips keeps approved tips and hides reviewer and status', () => {
  const tips = [{ id: 'a', status: 'approved', reviewedBy: 'm@x.com', rejectReason: '', text: 't' }, { id: 'b', status: 'pending' }];
  const out = plain(g.publicTips(tips));
  assert.deepEqual(out.map((t) => t.id), ['a']);
  for (const k of ['reviewedBy', 'status', 'rejectReason']) assert.ok(!(k in out[0]), k);
});

test('publicProfs lists approved profs with only id, name and dept', () => {
  const out = plain(g.publicProfs([{ id: 'a', name: 'A', dept: 'IM', status: 'approved', addedBy: 'm@x.com' }, { id: 'b', status: 'pending' }]));
  assert.deepEqual(out, [{ id: 'a', name: 'A', dept: 'IM' }]);
});

test('applyTipEdits only touches text, course, year and prof', () => {
  const tip = { id: 'a', text: 'old', course: 'IM31005', year: 2024, profId: 'p', status: 'pending', reviewedBy: '' };
  const out = g.applyTipEdits(tip, { text: 'new', status: 'approved', reviewedBy: 'x', year: '2025', profId: 'q' });
  assert.equal(out.text, 'new');
  assert.equal(out.year, 2025);
  assert.equal(out.profId, 'q');
  assert.equal(out.status, 'pending');
  assert.equal(out.reviewedBy, '');
});

// ---- site (site/js/lib/profs.js) ----

const profs = [{ id: 'p1', name: 'Prof. Sharma', dept: 'IM' }, { id: 'p2', name: 'Prof. Rao', dept: 'IM' }];
const tip = (id, profId, course, year, submittedAt = '2026-01-01') => ({ id, profId, course, year, text: id, submittedAt });
const tips = [tip('t1', 'p1', 'IM31005', 2024), tip('t2', 'p1', 'IM31005', 2025), tip('t3', 'p2', 'IM31005', 2023),
  tip('t4', 'p1', 'IM31201', 2025), tip('t5', 'p2', 'IM31201', '')];

test('profsForCourse lists each prof once with their years, most recent first', () => {
  assert.deepEqual(profsForCourse(tips, profs, 'IM31005'), [
    { id: 'p1', name: 'Prof. Sharma', years: [2025, 2024] },
    { id: 'p2', name: 'Prof. Rao', years: [2023] },
  ]);
});

test('profsForCourse skips tips whose prof is not public', () => {
  assert.deepEqual(profsForCourse([tip('x', 'gone', 'IM31005', 2025)], profs, 'IM31005'), []);
});

test('profPage gathers courses with years and tips newest first', () => {
  const page = profPage(tips, profs, 'p1');
  assert.equal(page.prof.name, 'Prof. Sharma');
  assert.deepEqual(page.courses, [{ code: 'IM31005', years: [2025, 2024] }, { code: 'IM31201', years: [2025] }]);
  assert.deepEqual(page.tips.map((t) => t.id), ['t2', 't4', 't1']);
});

test('profPage returns null for an unknown prof', () => {
  assert.equal(profPage(tips, profs, 'nope'), null);
});

test('profList sorts by name and counts tips', () => {
  assert.deepEqual(profList(profs, tips).map((p) => [p.name, p.tipCount]), [['Prof. Rao', 2], ['Prof. Sharma', 3]]);
});

test('tipErrors mirrors the server rules in the browser', () => {
  assert.deepEqual(tipErrors({ prof: 'p1', course: 'IM31005', text: 'Endsem repeats PYQ patterns.' }), {});
  assert.equal(tipErrors({ prof: '', course: 'IM31005', text: 'Endsem repeats PYQ patterns.' }).prof, 'Pick a professor');
  assert.equal(tipErrors({ prof: 'NEW', newProf: ' ', course: 'IM31005', text: 'Endsem repeats PYQ patterns.' }).prof, "Type the professor's name");
  assert.equal(tipErrors({ prof: 'p1', course: '', text: 'Endsem repeats PYQ patterns.' }).course, 'Pick a course');
  assert.equal(tipErrors({ prof: 'p1', course: 'IM31005', text: 'short' }).text, 'Write at least 20 characters');
});

// ---- review fixes (revision 2) ----

test('#3 isOrphanPendingProf: a new prof with no other live tip can be dropped', () => {
  const profs = [{ id: 'pn', status: 'pending' }, { id: 'pa', status: 'approved' }];
  const tips = [{ id: 't1', profId: 'pn', status: 'pending' }, { id: 't2', profId: 'pn', status: 'rejected' }];
  assert.equal(g.isOrphanPendingProf(profs, tips, 'pn', 't1'), true);
  assert.equal(g.isOrphanPendingProf(profs, [...tips, { id: 't3', profId: 'pn', status: 'pending' }], 'pn', 't1'), false);
  assert.equal(g.isOrphanPendingProf(profs, tips, 'pa', 't1'), false); // approved profs are never dropped
});

test('#3 profNameClash finds another prof with the same name, ignoring itself and removed ones', () => {
  const profs = [{ id: 'a', name: 'Prof. A. K. Sharma', status: 'approved' }, { id: 'b', name: 'Dr AK Sharma', status: 'pending' },
    { id: 'c', name: 'C Rao', status: 'removed' }];
  assert.equal(g.profNameClash(profs, 'A.K. Sharma', 'b').id, 'a');
  assert.equal(g.profNameClash(profs, 'Prof. A. K. Sharma', 'a').id, 'b');
  assert.equal(g.profNameClash(profs, 'C Rao', 'x'), null);
  assert.equal(g.profNameClash(profs, 'Somebody New', 'x'), null);
});
