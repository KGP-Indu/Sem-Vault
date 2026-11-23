// The files someone has ticked for "Download as zip". Kept for the browser session so it survives moving
// between course pages. Capped at the backend's zip limit (MAX_ZIP_FILES in apps-script/Zip.js).

export const MAX_PICK = 30;
const KEY = 'semvault:picked';

export function createSelection({ storage }) {
  let picked = [];
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    if (Array.isArray(saved)) picked = saved.filter((x) => typeof x === 'string');
  } catch {
    picked = [];
  }
  const listeners = [];
  const changed = () => {
    try { storage.setItem(KEY, JSON.stringify(picked)); } catch { /* storage blocked: still works this page */ }
    listeners.forEach((fn) => fn([...picked]));
  };

  return {
    ids: () => [...picked],
    size: () => picked.length,
    has: (id) => picked.includes(id),
    // Returns whether the id is selected afterwards.
    toggle(id) {
      if (picked.includes(id)) picked = picked.filter((x) => x !== id);
      else if (picked.length < MAX_PICK) picked.push(id);
      else return false;
      changed();
      return picked.includes(id);
    },
    // Returns how many of the ids are selected afterwards.
    addAll(ids) {
      for (const id of ids) if (!picked.includes(id) && picked.length < MAX_PICK) picked.push(id);
      changed();
      return ids.filter((id) => picked.includes(id)).length;
    },
    removeAll(ids) {
      picked = picked.filter((x) => !ids.includes(x));
      changed();
    },
    keepOnly(liveIds) {
      const before = picked.length;
      picked = picked.filter((x) => liveIds.has(x));
      if (picked.length !== before) changed();
    },
    clear() {
      picked = [];
      changed();
    },
    onChange(fn) { listeners.push(fn); },
  };
}
