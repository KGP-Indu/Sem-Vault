import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore } from '../site/js/lib/swr.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function setup({ responses, cached, now = 1_000_000 } = {}) {
  const storage = memoryStorage();
  if (cached) storage.setItem('semvault:catalog:v2', JSON.stringify(cached));
  let calls = 0;
  const updates = [];
  const store = createCatalogStore({
    storage,
    now: () => now,
    fetchCatalog: async () => {
      const r = responses[Math.min(calls, responses.length - 1)];
      calls++;
      if (r instanceof Error) throw r;
      return r;
    },
    onUpdate: (data) => updates.push(data),
  });
  return { store, storage, updates, calls: () => calls };
}

const A = { ok: true, items: [{ id: 'a' }] };
const B = { ok: true, items: [{ id: 'b' }] };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('first visit with nothing saved waits for the network and saves the result', async () => {
  const s = setup({ responses: [A] });
  assert.deepEqual(await s.store.get(), A);
  assert.ok(s.storage.getItem('semvault:catalog:v2').includes('"a"'));
});

test('a saved catalog is returned at once, and a background refresh reports changes', async () => {
  const s = setup({ responses: [B], cached: { at: 1, data: A } });
  assert.deepEqual(await s.store.get(), A);
  await tick();
  assert.equal(s.calls(), 1);
  assert.deepEqual(s.updates, [B]);
});

test('a background refresh that finds nothing new does not trigger a re-draw', async () => {
  const s = setup({ responses: [A], cached: { at: 1, data: A } });
  await s.store.get();
  await tick();
  assert.deepEqual(s.updates, []);
});

test('a catalog saved under a minute ago is not refreshed again', async () => {
  const s = setup({ responses: [B], cached: { at: 1_000_000 - 30_000, data: A }, now: 1_000_000 });
  await s.store.get();
  await tick();
  assert.equal(s.calls(), 0);
});

test('only one refresh runs at a time across many page views', async () => {
  const s = setup({ responses: [B], cached: { at: 1, data: A } });
  await Promise.all([s.store.get(), s.store.get(), s.store.get()]);
  await tick();
  assert.equal(s.calls(), 1);
});

test('fresh: true always goes to the network', async () => {
  const s = setup({ responses: [B], cached: { at: 1_000_000, data: A } });
  assert.deepEqual(await s.store.get({ fresh: true }), B);
});

test('when the network fails, the saved catalog is still shown', async () => {
  const s = setup({ responses: [new Error('offline')], cached: { at: 1, data: A } });
  assert.deepEqual(await s.store.get(), A);
  await tick();
  assert.deepEqual(s.updates, []);
});

test('when the network fails and nothing is saved, the error reaches the page', async () => {
  const s = setup({ responses: [new Error('offline')] });
  await assert.rejects(s.store.get(), /offline/);
});

test('a broken saved value is ignored instead of crashing', async () => {
  const s = setup({ responses: [A] });
  s.storage.setItem('semvault:catalog:v2', '{not json');
  assert.deepEqual(await s.store.get(), A);
});

test('#4 a refresh that only changes the server timestamp does not trigger a re-draw', async () => {
  const s = setup({ responses: [{ ...A, updatedAt: 'later' }], cached: { at: 1, data: { ...A, updatedAt: 'earlier' } } });
  await s.store.get();
  await tick();
  assert.deepEqual(s.updates, []);
});
