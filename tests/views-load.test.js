import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

// Loads every page script the way a browser would, so a missing export or import (like a helper
// deleted by mistake) fails here instead of on the live site.
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
globalThis.location = { search: '?preview', hash: '' };
globalThis.window = globalThis;

const dir = new URL('../site/js/views/', import.meta.url);

for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  test(`views/${f} loads with all its imports`, async () => {
    const mod = await import(new URL(f, dir));
    if (f !== 'item.js') assert.equal(typeof mod.render, 'function');
  });
}

test('itemRow renders a sample row with a checkbox and no source button', async () => {
  const { itemRow } = await import(new URL('item.js', dir));
  const html = itemRow({ id: 'x1', title: 'T <b>', type: 'shortnotes', fileId: 'sample-x1', description: '' });
  assert.match(html, /data-pick="x1"/);
  assert.match(html, /T &lt;b&gt;/);
  assert.doesNotMatch(html, /Source|AI agent/);
});
