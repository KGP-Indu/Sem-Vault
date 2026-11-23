import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSelection, MAX_PICK } from '../site/js/lib/selection.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('toggle adds and removes, and the count follows', () => {
  const s = createSelection({ storage: memoryStorage() });
  s.toggle('a');
  s.toggle('b');
  s.toggle('a');
  assert.deepEqual(s.ids(), ['b']);
  assert.equal(s.size(), 1);
});

test('the selection survives moving between pages (kept in session storage)', () => {
  const storage = memoryStorage();
  createSelection({ storage }).toggle('a');
  assert.deepEqual(createSelection({ storage }).ids(), ['a']);
});

test('addAll adds a section at once and stops at the zip limit, saying how many fit', () => {
  const s = createSelection({ storage: memoryStorage() });
  const ids = Array.from({ length: MAX_PICK + 5 }, (_, i) => 'id' + i);
  assert.equal(s.addAll(ids), MAX_PICK);
  assert.equal(s.size(), MAX_PICK);
  assert.equal(s.toggle('extra'), false); // full: not added
  assert.equal(s.has('extra'), false);
});

test('clear empties it and listeners hear about every change', () => {
  const s = createSelection({ storage: memoryStorage() });
  const seen = [];
  s.onChange((ids) => seen.push(ids.length));
  s.toggle('a');
  s.addAll(['b', 'c']);
  s.clear();
  assert.deepEqual(seen, [1, 3, 0]);
});

test('forget drops ids that are no longer on the site', () => {
  const s = createSelection({ storage: memoryStorage() });
  s.addAll(['a', 'b', 'c']);
  s.keepOnly(new Set(['b']));
  assert.deepEqual(s.ids(), ['b']);
});

test('a broken saved value starts an empty selection', () => {
  const storage = memoryStorage();
  storage.setItem('semvault:picked', '{oops');
  assert.deepEqual(createSelection({ storage }).ids(), []);
});
