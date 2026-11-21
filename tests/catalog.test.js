import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas.js';

const g = loadGas('Catalog.js');
const plain = (x) => JSON.parse(JSON.stringify(x));

const full = {
  id: 'it_ab12cd34', course: 'IM31005', type: 'shortnotes', title: 'Formula sheet',
  description: 'All formulas', fileId: 'F1', sourceFileId: 'S1', sourceName: 'sheet.tex',
  year: 2025, term: 'autumn', exam: 'endsem', uploaderName: 'Indu', uploaderEmail: 'u@x.com',
  uploadedAt: '2026-11-21T10:00:00.000Z', status: 'approved', startHere: true, startOrder: 1,
  reviewedBy: 'm@x.com', reviewedAt: '2026-11-21T11:00:00.000Z', rejectReason: '',
};

test('rowToItem(itemToRow(x)) round-trips an item', () => {
  assert.deepEqual(plain(g.rowToItem(g.itemToRow(full))), full);
});

test('rowToItem turns sheet TRUE into boolean startHere', () => {
  const row = g.itemToRow(full);
  row[g.CATALOG_COLUMNS.indexOf('startHere')] = 'TRUE';
  assert.equal(g.rowToItem(row).startHere, true);
  row[g.CATALOG_COLUMNS.indexOf('startHere')] = '';
  assert.equal(g.rowToItem(row).startHere, false);
});

test('publicView keeps only approved items and strips private fields', () => {
  const items = ['pending', 'rejected', 'removed', 'approved'].map((status, i) => ({ ...full, id: 'i' + i, status }));
  const out = plain(g.publicView(items));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'i3');
  for (const k of ['uploaderEmail', 'status', 'rejectReason']) assert.ok(!(k in out[0]), k);
});

const meta = { course: 'IM31005', type: 'slides', title: 'Notes' };
const pdf = { name: 'a.pdf', mimeType: 'application/pdf', base64: 'AAAA' };

test('validateUpload accepts a valid pdf with no source', () => {
  assert.deepEqual(plain(g.validateUpload(meta, pdf, null)), { ok: true, errors: [] });
});

test('validateUpload rejects missing title, course, bad type', () => {
  assert.equal(g.validateUpload({ ...meta, title: '  ' }, pdf, null).ok, false);
  assert.equal(g.validateUpload({ ...meta, course: '' }, pdf, null).ok, false);
  assert.equal(g.validateUpload({ ...meta, type: 'video' }, pdf, null).ok, false);
});

test('validateUpload rejects a file over 25 MB', () => {
  const big = { ...pdf, base64: 'A'.repeat(Math.ceil((g.MAX_BYTES + 10) * 4 / 3)) };
  const r = g.validateUpload(meta, big, null);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('25 MB')));
});

test('validateUpload rejects a source that is not .tex or .zip', () => {
  assert.equal(g.validateUpload(meta, pdf, { name: 'a.docx', base64: 'AA' }).ok, false);
  assert.equal(g.validateUpload(meta, pdf, { name: 'a.TEX', base64: 'AA' }).ok, true);
  assert.equal(g.validateUpload(meta, pdf, { name: 'src.zip', base64: 'AA' }).ok, true);
});

test('validateUpload rejects a missing file', () => {
  assert.equal(g.validateUpload(meta, null, null).ok, false);
});

const pending = { ...full, status: 'pending', reviewedBy: '', reviewedAt: '' };
const at = '2026-11-21T12:00:00.000Z';

test('applyReview approve sets status and reviewer', () => {
  const r = g.applyReview(pending, { decision: 'approve', reviewer: 'm@x.com', at });
  assert.equal(r.ok, true);
  assert.equal(r.item.status, 'approved');
  assert.equal(r.item.reviewedBy, 'm@x.com');
  assert.equal(r.item.reviewedAt, at);
});

test('applyReview on an already reviewed item says who reviewed it', () => {
  const r = g.applyReview({ ...pending, status: 'approved', reviewedBy: 'a@x.com' }, { decision: 'approve', reviewer: 'm@x.com', at });
  assert.deepEqual(plain(r), { ok: false, error: 'Already reviewed by a@x.com' });
});

test('applyReview reject needs a reason and stores it', () => {
  assert.equal(g.applyReview(pending, { decision: 'reject', reviewer: 'm@x.com', at }).ok, false);
  const r = g.applyReview(pending, { decision: 'reject', reviewer: 'm@x.com', at, reason: 'duplicate' });
  assert.equal(r.item.status, 'rejected');
  assert.equal(r.item.rejectReason, 'duplicate');
});

test('applyEdits ignores keys outside the allowed list', () => {
  const out = g.applyEdits(full, { title: 'New', fileId: 'HACK', reviewedBy: 'x', startHere: false, startOrder: 3, type: 'book' });
  assert.equal(out.title, 'New');
  assert.equal(out.fileId, 'F1');
  assert.equal(out.reviewedBy, 'm@x.com');
  assert.equal(out.startHere, true); // Start here was removed in revision 2
  assert.equal(out.startOrder, 1);
  assert.equal(out.type, 'book');
});

test('applyEdits only allows status to become removed', () => {
  assert.equal(g.applyEdits(full, { status: 'pending' }).status, 'approved');
  assert.equal(g.applyEdits(full, { status: 'removed' }).status, 'removed');
});

test('validateUpload accepts a not-listed course as OTHER:<name>', () => {
  assert.equal(g.validateUpload({ ...meta, course: 'OTHER:Ergonomics' }, pdf, null).ok, true);
});

test('validateUpload rejects OTHER: with a blank course name', () => {
  const r = g.validateUpload({ ...meta, course: 'OTHER:  ' }, pdf, null);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('Course is required'));
});

test('the six section types are the item types', () => {
  assert.deepEqual([...g.ITEM_TYPES], ['book', 'slides', 'shortnotes', 'pyq', 'test', 'assignment']);
});

test('rowToItem maps old types to the new sections', () => {
  const at = (type) => { const r = g.itemToRow({ ...full, type }); return g.rowToItem(r).type; };
  assert.equal(at('formula'), 'shortnotes');
  assert.equal(at('notes'), 'shortnotes');
  assert.equal(at('other'), 'shortnotes');
  assert.equal(at('lab'), 'assignment');
  assert.equal(at('book'), 'book');
});

test('validateUpload rejects an old type name', () => {
  assert.equal(g.validateUpload({ ...meta, type: 'formula' }, pdf, null).ok, false);
});

test('downloadName uses the title with the extension', () => {
  assert.equal(g.downloadName('QDC formula sheet', 'pdf'), 'QDC formula sheet.pdf');
  assert.equal(g.downloadName('QDC formula sheet', 'ZIP'), 'QDC formula sheet.zip');
});

test('downloadName removes characters Windows and phones refuse in file names', () => {
  assert.equal(g.downloadName('Ch 1/2: "Intro" <draft>?*|', 'pdf'), 'Ch 1 2 Intro draft.pdf');
  assert.equal(g.downloadName('  trailing dots... ', 'tex'), 'trailing dots.tex');
});

test('downloadName falls back to file and caps long titles', () => {
  assert.equal(g.downloadName('   ', 'pdf'), 'file.pdf');
  assert.equal(g.downloadName('x'.repeat(300), 'pdf'), 'x'.repeat(120) + '.pdf');
});

test('extOf reads a lowercase extension or falls back', () => {
  assert.equal(g.extOf('Sheet.PDF', 'pdf'), 'pdf');
  assert.equal(g.extOf('notes', 'tex'), 'tex');
  assert.equal(g.extOf('bundle.src.zip', 'tex'), 'zip');
});
