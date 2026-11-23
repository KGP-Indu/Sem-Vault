import { getCatalog, previewMode } from './api.js';
import { SITE_NAME } from './config.js';
import { initPicking, selection } from './pick.js';

const picking = initPicking();

const routes = [
  [/^\/?$/, 'home'],
  [/^\/sem\/(?<sem>\d+)$/, 'home'],
  [/^\/course\/(?<code>[^/]+)$/, 'course'],
  [/^\/pyqs$/, 'pyqs'],
  [/^\/search$/, 'search'],
  [/^\/profs$/, 'profs'],
  [/^\/prof\/(?<id>[^/]+)$/, 'prof'],
  [/^\/tip$/, 'tip'],
  [/^\/upload$/, 'upload'],
  [/^\/mod$/, 'mod'],
];
// Pages with nothing typed into them can be re-drawn when newer data arrives.
const REDRAWABLE = new Set(['home', 'course', 'pyqs', 'search', 'profs', 'prof']);
const NAV_FOR = { profs: 'profs', prof: 'profs', tip: 'profs' };

const main = document.getElementById('main');
let current = { view: null, params: {} };

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  for (const [re, view] of routes) {
    const m = re.exec(path);
    if (m) {
      const params = Object.fromEntries(new URLSearchParams(query));
      return { view, params: { ...params, ...(m.groups ? { ...m.groups } : {}) } };
    }
  }
  return { view: null, params: {} };
}

function paint(mod, view, params, catalog) {
  selection.keepOnly(new Set(catalog.items.map((i) => i.id))); // drop picks that left the site
  mod.render(main, params, catalog, { rerender: route });
  picking.sync();
  if (!performance.getEntriesByName('sv:first-paint').length) performance.mark('sv:first-paint'); // for speed checks
  const h1 = main.querySelector('h1')?.textContent;
  document.title = view === 'home' || !h1 ? SITE_NAME : `${h1} | ${SITE_NAME}`;
  document.body.dataset.view = view;
  const q = document.getElementById('header-q');
  if (q) q.value = view === 'search' ? params.q || '' : '';
  const navView = NAV_FOR[view] || view;
  document.querySelectorAll('.site-nav a').forEach((a) => {
    a.toggleAttribute('aria-current', a.getAttribute('href') === `#/${navView === 'home' ? '' : navView}`);
  });
}

let renderId = 0;

async function route() {
  const id = ++renderId;
  const { view, params } = parseHash();
  current = { view, params };
  if (!view) {
    main.innerHTML = '<p class="empty">That page does not exist. <a href="#/">Go to all courses</a>.</p>';
    return;
  }
  // Only show "Loading" if the page isn't ready almost at once (it usually is, from the saved copy).
  const slow = setTimeout(() => { if (id === renderId) main.innerHTML = '<p class="loading">Loading the library…</p>'; }, 150);
  main.setAttribute('aria-busy', 'true');
  try {
    const [mod, catalog] = await Promise.all([import(`./views/${view}.js`), getCatalog()]);
    if (id !== renderId) return; // a newer navigation won
    paint(mod, view, params, catalog);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="error"><p>Couldn't load the library. Check your connection and try again.</p>
      <button class="btn" type="button" data-retry>Try again</button></div>`;
    main.querySelector('[data-retry]').addEventListener('click', route);
  } finally {
    clearTimeout(slow);
    main.removeAttribute('aria-busy');
  }
  if (!params.sem) window.scrollTo(0, 0);
}

// A background refresh brought changes: re-draw in place, keeping the scroll position and open sections.
const typing = () => document.activeElement?.matches?.('input, textarea, select');

window.addEventListener('catalog-updated', async function redraw(e) {
  const { view, params } = current;
  if (!REDRAWABLE.has(view)) return;
  // Someone is typing (a search box, a filter): re-draw once they leave the box, not under their fingers.
  if (typing()) {
    document.activeElement.addEventListener('blur', () => redraw(e), { once: true });
    return;
  }
  const open = [...main.querySelectorAll('details[open][data-type]')].map((d) => d.dataset.type);
  const y = window.scrollY;
  const mod = await import(`./views/${view}.js`);
  paint(mod, view, params, e.detail);
  open.forEach((t) => main.querySelector(`details[data-type="${t}"]`)?.setAttribute('open', ''));
  window.scrollTo(0, y);
});

document.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-search]')) return;
  e.preventDefault();
  const q = String(new FormData(e.target).get('q') || '').trim();
  if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
});

if (previewMode) document.querySelector('[data-preview-banner]').hidden = false;

window.addEventListener('hashchange', route);
route();
