import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas.js';

const g = loadGas('Catalog.js', 'Zip.js');
const plain = (x) => JSON.parse(JSON.stringify(x));

test('validateZipIds accepts up to 30 ids and drops repeats', () => {
  assert.deepEqual(plain(g.validateZipIds(['a', 'b', 'a'])), { ok: true, errors: [], ids: ['a', 'b'] });
});

test('validateZipIds refuses an empty, oversized or malformed selection', () => {
  assert.equal(g.validateZipIds([]).ok, false);
  assert.equal(g.validateZipIds('a').ok, false);
  assert.equal(g.validateZipIds([1, 2]).ok, false);
  const many = Array.from({ length: 31 }, (_, i) => 'id' + i);
  const r = g.validateZipIds(many);
  assert.equal(r.ok, false);
  assert.ok(r.errors[0].includes('30'));
});

test('zipEntryNames names files by title and keeps same-titled files apart', () => {
  assert.deepEqual(plain(g.zipEntryNames([
    { title: 'QDC endsem 2025', ext: 'pdf' },
    { title: 'QDC endsem 2025', ext: 'pdf' },
    { title: 'qdc endsem 2025', ext: 'pdf' },
    { title: 'Lab report', ext: 'docx' },
  ])), ['QDC endsem 2025.pdf', 'QDC endsem 2025 (2).pdf', 'qdc endsem 2025 (3).pdf', 'Lab report.docx']);
});

test('zipName uses the course short name when everything is from one course', () => {
  const courses = [{ code: 'IM31005', short: 'QDC' }];
  assert.equal(g.zipName(courses, [{ course: 'IM31005' }, { course: 'IM31005' }]), 'Indu Sem Vault - QDC.zip');
  assert.equal(g.zipName(courses, [{ course: 'IM31005' }, { course: 'IM31201' }]), 'Indu Sem Vault - selection.zip');
});

test('zipSizeError explains an oversized selection in MB', () => {
  assert.equal(g.zipSizeError(20 * 1024 * 1024), null);
  assert.equal(g.zipSizeError(40 * 1024 * 1024),
    'That selection is 40 MB. A zip can be up to 25 MB, so download it in smaller parts.');
});
