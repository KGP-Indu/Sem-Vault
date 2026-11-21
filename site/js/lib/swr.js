// Stale-while-revalidate for the catalog: the backend takes ~2 s per call, so show the copy saved on
// this device at once and refresh it in the background; onUpdate fires only when something changed.

const KEY = 'semvault:catalog:v2';
const FRESH_FOR = 60 * 1000; // a copy younger than this is not refreshed again

// What the page shows; the server's timestamp changes on every cache rebuild and must not cause a re-draw.
const contentOf = (data) => {
  const { updatedAt, ...rest } = data || {};
  return JSON.stringify(rest);
};

export function createCatalogStore({ storage, fetchCatalog, onUpdate = () => {}, now = () => Date.now() }) {
  let inflight = null;

  const read = () => {
    try {
      const v = JSON.parse(storage.getItem(KEY));
      return v && v.data ? v : null;
    } catch {
      return null;
    }
  };

  const save = (data) => {
    try {
      storage.setItem(KEY, JSON.stringify({ at: now(), data }));
    } catch {
      // storage full or blocked: the site still works, just without the instant start
    }
  };

  const load = () => {
    if (!inflight) {
      inflight = fetchCatalog()
        .then((data) => { save(data); return data; })
        .finally(() => { inflight = null; });
    }
    return inflight;
  };

  return {
    async get({ fresh = false } = {}) {
      const saved = fresh ? null : read();
      if (!saved) return load();
      if (now() - saved.at >= FRESH_FOR) {
        const before = contentOf(saved.data);
        load()
          .then((data) => { if (contentOf(data) !== before) onUpdate(data); })
          .catch(() => {}); // offline: keep showing the saved copy
      }
      return saved.data;
    },
    clear() {
      storage.removeItem(KEY);
    },
  };
}
