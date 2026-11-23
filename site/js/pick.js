// "Download a selection": checkboxes on file rows, a bar at the bottom of the page, and the zip download.
// The backend builds the zip (browsers can't fetch Drive files across sites) and sends it back base64-encoded.
import { post } from './api.js';
import { createSelection, MAX_PICK } from './lib/selection.js';
import { esc } from './lib/esc.js';

export const selection = createSelection({ storage: sessionStorage });

export function pickBox(item) {
  return `<label class="pick"><input type="checkbox" data-pick="${esc(item.id)}"${selection.has(item.id) ? ' checked' : ''}>
    <span class="sr-only">Select ${esc(item.title)}</span></label>`;
}

export function initPicking() {
  const bar = document.querySelector('[data-pickbar]');
  const count = bar.querySelector('[data-pickcount]');
  const msg = bar.querySelector('[data-pickmsg]');
  const zipBtn = bar.querySelector('[data-pickzip]');
  const say = (text) => { msg.textContent = text; };

  const sync = (ids) => {
    bar.hidden = ids.length === 0 && !msg.textContent;
    count.textContent = `${ids.length} selected${ids.length >= MAX_PICK ? ` (the most per zip)` : ''}`;
    zipBtn.hidden = ids.length === 0;
    document.querySelectorAll('[data-pick]').forEach((cb) => { cb.checked = selection.has(cb.dataset.pick); });
    document.querySelectorAll('[data-pickall]').forEach((b) => {
      const all = sectionIds(b);
      b.textContent = all.length && all.every((id) => selection.has(id)) ? 'Unselect all' : 'Select all';
    });
  };
  selection.onChange((ids) => { say(''); sync(ids); });

  document.addEventListener('change', (e) => {
    if (!e.target.matches('[data-pick]')) return;
    const on = selection.toggle(e.target.dataset.pick);
    if (e.target.checked && !on) {
      e.target.checked = false;
      say(`A zip can hold up to ${MAX_PICK} files. Download these first, then pick more.`);
      sync(selection.ids());
    }
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pickall]');
    if (!b) return;
    e.preventDefault();
    const ids = sectionIds(b);
    if (ids.every((id) => selection.has(id))) {
      selection.removeAll(ids);
    } else {
      const got = selection.addAll(ids);
      if (got < ids.length) say(`Only ${got} of these fit: a zip can hold up to ${MAX_PICK} files.`);
    }
  });

  bar.querySelector('[data-pickclear]').addEventListener('click', () => { say(''); selection.clear(); });

  zipBtn.addEventListener('click', async () => {
    const n = selection.size();
    zipBtn.disabled = true;
    say(`Preparing a zip of ${n} file${n === 1 ? '' : 's'}… this can take a few seconds.`);
    try {
      const r = await post('zip', { ids: selection.ids() });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: r.name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      selection.clear();
      say(`Downloaded ${r.count} file${r.count === 1 ? '' : 's'} as “${r.name}”.` +
        (r.skipped ? ` ${r.skipped} ${r.skipped === 1 ? 'was' : 'were'} no longer on the site.` : ''));
      sync([]);
    } catch (err) {
      say(`Couldn't make the zip: ${err.message}`);
      sync(selection.ids());
    } finally {
      zipBtn.disabled = false;
    }
  });

  sync(selection.ids());
  return { sync: () => sync(selection.ids()) };
}

// The ids of the files in the section (or table) a "Select all" button belongs to.
function sectionIds(button) {
  const scope = button.closest('[data-pickscope]') || document;
  return [...scope.querySelectorAll('[data-pick]')].map((cb) => cb.dataset.pick);
}
