// DEV ONLY. An in-browser stand-in for the Apps Script API so the mod panel can be tried
// before the real server exists. Turn on in the console with:
//   localStorage.setItem('semvault:mock', '1'); location.reload()
// The "token" is just the email you type at sign-in. Nothing here is used by the live site.

const OWNER = 'kgp.indu@gmail.com';
let state = null;

async function load() {
  if (state) return state;
  const saved = sessionStorage.getItem('semvault:mockstate');
  if (saved) return (state = JSON.parse(saved));
  const base = await (await fetch(new URL('./sample-catalog.json', import.meta.url))).json();
  const items = base.items.map((x) => ({ ...x, status: 'approved', uploaderEmail: '', rejectReason: '' }));
  items.push(
    { id: 'p1', course: 'IM31005', type: 'pyq', title: 'QDC midsem 2025', description: '', fileId: 'sample-p1', sourceFileId: '', sourceName: '', year: 2025, term: 'autumn', exam: 'midsem', uploaderName: 'A junior', uploaderEmail: 'junior@example.com', uploadedAt: '2026-11-21T03:00:00.000Z', status: 'pending', startHere: false, startOrder: '', reviewedBy: '', reviewedAt: '', rejectReason: '' },
    { id: 'p2', course: 'OTHER:Ergonomics IM31010', type: 'shortnotes', title: 'Ergonomics crash notes', description: 'Anthropometry and work design', fileId: 'sample-p2', sourceFileId: 'sample-p2s', sourceName: 'ergo.tex', year: '', term: '', exam: '', uploaderName: '', uploaderEmail: '', uploadedAt: '2026-11-21T05:00:00.000Z', status: 'pending', startHere: false, startOrder: '', reviewedBy: '', reviewedAt: '', rejectReason: '' },
  );
  const profs = base.profs.map((x) => ({ ...x, status: 'approved', addedBy: OWNER, addedAt: '2026-11-01T00:00:00.000Z' }));
  profs.push({ id: 'pf_new1', name: 'Dr C Newname', dept: 'IM', status: 'pending', addedBy: 'student', addedAt: '2026-11-21T04:00:00.000Z' });
  const tips = base.tips.map((x) => ({ ...x, status: 'approved', reviewedBy: OWNER, reviewedAt: x.submittedAt, rejectReason: '' }));
  tips.push({ id: 'tp_p1', profId: 'pf_new1', course: 'IM31005', year: 2026, text: 'Takes surprise quizzes in the first ten minutes, so come on time.', authorName: '', submittedAt: '2026-11-21T04:00:00.000Z', status: 'pending', reviewedBy: '', reviewedAt: '', rejectReason: '' });
  state = { courses: base.courses, items, profs, tips, mods: [{ email: 'mod@example.com', addedBy: OWNER, addedAt: '2026-11-20T00:00:00.000Z' }], requests: [{ email: 'wannabe@example.com', requestedAt: '2026-11-21T02:00:00.000Z' }], log: [] };
  return state;
}

function save() { sessionStorage.setItem('semvault:mockstate', JSON.stringify(state)); }
function fail(error, code = 400) { const e = new Error(error); e.code = code; throw e; }
function role(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return 'none';
  if (e === OWNER) return 'owner';
  return state.mods.some((m) => m.email === e) ? 'mod' : 'none';
}
function need(body, min) {
  const r = role(body.idToken);
  const rank = { none: 0, mod: 1, owner: 2 };
  if (!body.idToken) fail('Please sign in again', 401);
  if (rank[r] < rank[min]) fail('Not authorised', 403);
  return String(body.idToken).toLowerCase();
}
function log(actor, action, target, detail) { state.log.push({ at: new Date().toISOString(), actor, action, target, detail }); }
const find = (id) => state.items.find((x) => x.id === id) || fail('Item not found', 404);

export async function catalog() {
  await load();
  const strip = ({ uploaderEmail, status, rejectReason, reviewedBy, ...rest }) => rest;
  const tipOut = ({ status, reviewedBy, reviewedAt, rejectReason, ...rest }) => rest;
  return {
    ok: true, courses: state.courses, items: state.items.filter((x) => x.status === 'approved').map(strip),
    profs: state.profs.filter((p) => p.status === 'approved').map(({ id, name, dept }) => ({ id, name, dept })),
    tips: state.tips.filter((t) => t.status === 'approved').map(tipOut), updatedAt: new Date().toISOString(),
  };
}

export async function handle(action, body) {
  await load();
  const out = (() => {
    switch (action) {
      case 'me': return { email: String(body.idToken).toLowerCase(), role: role(body.idToken) };
      case 'pending': need(body, 'mod'); return { items: state.items.filter((x) => x.status === 'pending').map((x) => ({ ...x, fileUrl: '#', sourceUrl: x.sourceFileId ? '#' : '' })), tips: state.tips.filter((t) => t.status === 'pending'), profs: state.profs.filter((p) => p.status !== 'removed') };
      case 'review': {
        const me = need(body, 'mod');
        const it = find(body.id);
        if (it.status !== 'pending') fail('Already reviewed by ' + it.reviewedBy, 409);
        Object.assign(it, body.edits || {});
        if (body.decision === 'approve' && String(it.course).startsWith('OTHER:')) fail('Pick an existing course (or add one) before approving');
        if (body.decision === 'reject' && !String(body.reason || '').trim()) fail('A reason is required to reject');
        Object.assign(it, { status: body.decision === 'approve' ? 'approved' : 'rejected', reviewedBy: me, reviewedAt: new Date().toISOString(), rejectReason: body.reason || '' });
        log(me, body.decision, it.id, it.title);
        return { item: it };
      }
      case 'update': {
        const me = need(body, 'mod');
        const it = find(body.id);
        Object.assign(it, body.edits);
        log(me, it.status === 'removed' ? 'remove' : 'edit', it.id, it.title);
        return { item: it };
      }
      case 'saveCourse': {
        const me = need(body, 'mod');
        const live = (x) => x.status === 'approved' || x.status === 'pending';
        if (body.remove) {
          const n = state.items.filter((x) => x.course === body.code && live(x)).length + state.tips.filter((t) => t.course === body.code && live(t)).length;
          if (n) fail(`This course still has ${n} files or tips on it. Move or remove those first.`);
          state.courses = state.courses.filter((x) => x.code !== body.code);
          log(me, 'remove-course', body.code, '');
          return { courses: state.courses };
        }
        const c = { ...body.course, code: String(body.course.code).trim().toUpperCase(), semester: Number(body.course.semester) };
        c.short = String(c.short || '').trim() || c.code;
        if (!/^[A-Z]{2}\d{5}$/.test(c.code)) fail('Course code looks like IM31005');
        const old = body.oldCode || '';
        if (old !== c.code && state.courses.some((x) => x.code === c.code)) fail(`${c.code} is already a course`);
        if (old && old !== c.code) {
          state.items.forEach((x) => { if (x.course === old) x.course = c.code; });
          state.tips.forEach((t) => { if (t.course === old) t.course = c.code; });
        }
        state.courses = state.courses.filter((x) => x.code !== c.code && x.code !== old).concat([c]);
        log(me, 'course', c.code, c.name);
        return { courses: state.courses };
      }
      case 'library': need(body, 'mod'); return { items: state.items.filter((x) => x.status === 'approved'), tips: state.tips.filter((t) => t.status === 'approved'), profs: state.profs.filter((p) => p.status !== 'removed') };
      case 'submitTip': {
        const t = body.tip;
        let profId = t.profId;
        if (!profId) {
          profId = 'pf_' + Date.now();
          state.profs.push({ id: profId, name: t.newProfName, dept: 'IM', status: 'pending', addedBy: 'student', addedAt: new Date().toISOString() });
        }
        state.tips.push({ id: 'tp_' + Date.now(), profId, course: t.course, year: Number(t.year) || '', text: t.text, authorName: t.authorName, submittedAt: new Date().toISOString(), status: 'pending', reviewedBy: '', reviewedAt: '', rejectReason: '' });
        return { id: 'ok' };
      }
      case 'reviewTip': {
        const me = need(body, 'mod');
        const t = state.tips.find((x) => x.id === body.id) || fail('Tip not found', 404);
        if (t.status !== 'pending') fail('Already reviewed by ' + t.reviewedBy, 409);
        const { profName, ...edits } = body.edits || {};
        Object.assign(t, edits, { year: Number(edits.year) || '' });
        if (body.decision === 'reject' && !String(body.reason || '').trim()) fail('A reason is required to reject');
        if (body.decision === 'approve') {
          const prof = state.profs.find((p) => p.id === t.profId);
          prof.status = 'approved';
          if (profName) prof.name = profName;
        }
        Object.assign(t, { status: body.decision === 'approve' ? 'approved' : 'rejected', reviewedBy: me, reviewedAt: new Date().toISOString(), rejectReason: body.reason || '' });
        log(me, body.decision + '-tip', t.id, t.text.slice(0, 60));
        return { tip: t };
      }
      case 'updateTip': {
        const me = need(body, 'mod');
        const t = state.tips.find((x) => x.id === body.id) || fail('Tip not found', 404);
        if (body.edits.status === 'removed') t.status = 'removed';
        log(me, 'remove-tip', t.id, t.text.slice(0, 60));
        return { tip: t };
      }
      case 'saveProf': {
        const me = need(body, 'mod');
        const p = body.prof;
        let prof = p.id && state.profs.find((x) => x.id === p.id);
        if (!prof) { prof = { id: 'pf_' + Date.now(), dept: 'IM', addedBy: me, addedAt: new Date().toISOString() }; state.profs.push(prof); }
        if (p.remove) prof.status = 'removed';
        else Object.assign(prof, { name: p.name, status: prof.status || 'approved' });
        log(me, 'prof', prof.id, prof.name);
        return { prof, profs: state.profs };
      }
      case 'activity': need(body, 'mod'); return { rows: state.log.slice(-(body.limit || 200)).reverse() };
      case 'requestMod': {
        const me = String(body.idToken).toLowerCase();
        if (role(me) === 'none' && !state.requests.some((r) => r.email === me)) state.requests.push({ email: me, requestedAt: new Date().toISOString() });
        return {};
      }
      case 'mods': need(body, 'owner'); return { mods: state.mods, requests: state.requests };
      case 'setMod': {
        const me = need(body, 'owner');
        const e = String(body.email).toLowerCase();
        if (body.decision === 'add' && !state.mods.some((m) => m.email === e)) state.mods.push({ email: e, addedBy: me, addedAt: new Date().toISOString() });
        if (body.decision === 'add' || body.decision === 'decline') state.requests = state.requests.filter((r) => r.email !== e);
        if (body.decision === 'remove') state.mods = state.mods.filter((m) => m.email !== e);
        log(me, 'mod-' + body.decision, e, '');
        return { mods: state.mods, requests: state.requests };
      }
      case 'upload': return { id: 'mock' + Date.now() };
      case 'zip': { // not a real zip: just enough to try the download flow
        const ids = body.ids || [];
        if (!ids.length) fail('Pick at least one file');
        if (ids.length > 30) fail('Pick at most 30 files per zip');
        const live = ids.filter((id) => state.items.some((x) => x.id === id && x.status === 'approved'));
        return { name: 'Indu Sem Vault - selection.zip', base64: btoa(`Mock zip of ${live.length} files: ${live.join(', ')}`), count: live.length, skipped: ids.length - live.length };
      }
      default: fail('Unknown action');
    }
  })();
  save();
  return { ok: true, ...out };
}
