import { API_URL } from './config.js';
import { createCatalogStore } from './lib/swr.js';

// ?preview in the address forces the sample data (for trying changes locally without the live backend).
export const previewMode = !API_URL || new URLSearchParams(location.search).has('preview');
// Dev only: with no server configured, localStorage 'semvault:mock' = '1' swaps in dev/mock-server.js.
export const mockMode = previewMode && localStorage.getItem('semvault:mock') === '1';
const mock = () => import('../dev/mock-server.js');

async function fetchCatalog() {
  const url = previewMode ? new URL('../dev/sample-catalog.json', import.meta.url) : `${API_URL}?action=catalog`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error);
  return data;
}

// Pages re-draw when a background refresh brings changes (see app.js).
const store = createCatalogStore({
  storage: localStorage,
  fetchCatalog,
  onUpdate: (data) => window.dispatchEvent(new CustomEvent('catalog-updated', { detail: data })),
});

export async function getCatalog({ fresh = false } = {}) {
  if (mockMode) return (await mock()).catalog();
  if (previewMode) return fetchCatalog(); // sample data: never mix it into the saved copy
  return store.get({ fresh });
}

export function clearCatalogCache() {
  store.clear();
}

export async function post(action, body = {}) {
  let data;
  if (mockMode) {
    try {
      data = await (await mock()).handle(action, body);
    } catch (e) {
      data = { ok: false, error: e.message, code: e.code };
    }
  } else {
    if (previewMode) throw new Error('Preview mode: not connected to the server yet');
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight Apps Script can't answer
      body: JSON.stringify({ action, ...body }),
    });
    try {
      data = await res.json();
    } catch {
      // Google answers oversized or broken requests with an HTML page, not JSON.
      throw new Error("The server didn't accept that. If the files are large, try smaller ones, then try again.");
    }
  }
  if (!data.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.code = data.code;
    throw err;
  }
  return data;
}
