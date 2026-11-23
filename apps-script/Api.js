// Web app entry points. The site POSTs JSON as text/plain (no CORS preflight).

var UPLOADS_PER_HOUR = 120; // shared by uploads and tips; batch uploads send one request per file
var ROLE_RANK = { none: 0, mod: 1, owner: 2 };

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  return respond(function () {
    if (action === 'catalog') return handleCatalog();
    fail('Unknown action');
  });
}

function doPost(e) {
  return respond(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var handler = {
      upload: handleUpload,
      zip: handleZip,
      me: handleMe,
      pending: handlePending,
      library: handleLibrary,
      submitTip: handleSubmitTip,
      reviewTip: handleReviewTip,
      updateTip: handleUpdateTip,
      saveProf: handleSaveProf,
      review: handleReview,
      update: handleUpdate,
      saveCourse: handleSaveCourse,
      activity: handleActivity,
      requestMod: handleRequestMod,
      mods: handleMods,
      setMod: handleSetMod,
    }[body.action];
    if (!handler) fail('Unknown action');
    return handler(body);
  });
}

function respond(fn) {
  var out;
  try {
    out = fn();
    if (typeof out === 'string') {
      return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
    }
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: err && err.message ? err.message : String(err), code: (err && err.code) || 400 };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function fail(message, code) {
  var err = new Error(message);
  err.code = code || 400;
  throw err;
}

function nowIso() {
  return new Date().toISOString();
}

// Verifies the token and re-reads the mod list on every call, so removing a mod takes effect at once.
function requireRole(body, minRole) {
  var email = verifyIdToken(body.idToken);
  if (!email) fail('Please sign in again', 401);
  var role = roleOf(email, props().OWNER_EMAIL, modEmails());
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) fail('Not authorised', 403);
  return { email: email, role: role };
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function log(actor, action, target, detail) {
  appendLog(logRow(actor, action, target, detail, nowIso()));
}

// ---- Public ----

function handleCatalog() {
  var cached = cacheGetCatalog();
  if (cached) return cached;
  var s = JSON.stringify({
    ok: true, courses: readCourses(), items: publicView(readItems()),
    profs: publicProfs(readProfs()), tips: publicTips(readTips()), updatedAt: nowIso(),
  });
  cachePutCatalog(s);
  return s;
}

// Uploads and tips share one hourly budget to slow down spam. Call check first, count after validation.
function checkHourlyLimit() {
  var key = 'uploads:' + new Date().toISOString().slice(0, 13);
  var count = Number(CacheService.getScriptCache().get(key) || 0);
  if (count >= UPLOADS_PER_HOUR) fail('Too many submissions right now. Please try again in an hour.', 429);
  return function () { CacheService.getScriptCache().put(key, String(count + 1), 3700); };
}

// Anyone: zips the chosen live files (never pending or removed ones), named by title, and sends the zip back
// base64-encoded. Browsers won't fetch Drive files across sites, so the zip has to be built here.
function handleZip(body) {
  var v = validateZipIds(body.ids);
  if (!v.ok) fail(v.errors.join('. '));
  var cache = CacheService.getScriptCache();
  var key = 'zips:' + new Date().toISOString().slice(0, 13);
  var count = Number(cache.get(key) || 0);
  if (count >= 300) fail('Lots of people are downloading right now. Please try again in a little while.', 429);
  cache.put(key, String(count + 1), 3700);

  var byId = {};
  readItems().forEach(function (it) { byId[it.id] = it; });
  var items = v.ids.map(function (id) { return byId[id]; }).filter(function (it) { return it && it.status === 'approved'; });
  if (!items.length) fail('Those files are no longer on the site. Reload the page.');
  var files = items.map(function (it) { return DriveApp.getFileById(it.fileId); });
  var total = files.reduce(function (n, f) { return n + f.getSize(); }, 0);
  var tooBig = zipSizeError(total);
  if (tooBig) fail(tooBig);
  var names = zipEntryNames(items.map(function (it, i) { return { title: it.title, ext: extOf(files[i].getName(), 'pdf') }; }));
  var name = zipName(readCourses(), items);
  var zip = Utilities.zip(files.map(function (f, i) { return f.getBlob().setName(names[i]); }), name);
  return { name: name, base64: Utilities.base64Encode(zip.getBytes()), count: items.length, skipped: v.ids.length - items.length };
}

function handleUpload(body) {
  if (body.hp) fail('Rejected');
  var countIt = checkHourlyLimit();

  var meta = body.meta || {};
  var check = validateUpload(meta, body.file, body.source);
  if (!check.ok) fail(check.errors.join('. '));
  countIt();

  var id = 'it_' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var folder = pendingFolder();
  var title = String(meta.title).trim();
  // Drive names are what people's downloads are called, so they follow the title.
  var fileId = saveBase64(folder, downloadName(title, extOf(body.file.name, 'pdf')), body.file.mimeType, body.file.base64);
  var sourceFileId = '';
  var sourceName = '';
  if (body.source) {
    sourceName = String(body.source.name);
    sourceFileId = saveBase64(folder, downloadName(title, extOf(sourceName, 'tex')), body.source.mimeType, body.source.base64);
  }
  var isPyq = meta.type === 'pyq';
  var item = {
    id: id, course: String(meta.course).trim(), type: meta.type, title: String(meta.title).trim(),
    description: String(meta.description || '').trim(), fileId: fileId, sourceFileId: sourceFileId,
    sourceName: sourceName, year: isPyq ? (Number(meta.year) || '') : '', term: isPyq ? (meta.term || '') : '',
    exam: isPyq ? (meta.exam || '') : '', uploaderName: String(meta.uploaderName || '').trim(),
    uploaderEmail: String(meta.uploaderEmail || '').trim(), uploadedAt: nowIso(), status: 'pending',
    startHere: false, startOrder: '', reviewedBy: '', reviewedAt: '', rejectReason: '',
  };
  writeItem(item);
  log(item.uploaderEmail || item.uploaderName || 'anonymous', 'upload', id, item.title);
  return { id: id };
}

// ---- Signed in ----

function handleMe(body) {
  var email = verifyIdToken(body.idToken);
  if (!email) fail('Please sign in again', 401);
  return { email: email, role: roleOf(email, props().OWNER_EMAIL, modEmails()) };
}

function handleRequestMod(body) {
  var me = requireRole(body, 'none');
  if (me.role !== 'none') return {};
  if (findRow('Requests', me.email) === -1) {
    appendSafe('Requests', [me.email, nowIso()]);
    log(me.email, 'request-mod', '', '');
  }
  return {};
}

// ---- Mods ----

function driveView(id) {
  return id ? 'https://drive.google.com/file/d/' + id + '/view' : '';
}

function handlePending(body) {
  requireRole(body, 'mod');
  var items = readItems().filter(function (it) { return it.status === 'pending'; });
  items.forEach(function (it) { it.fileUrl = driveView(it.fileId); it.sourceUrl = driveView(it.sourceFileId); });
  var profs = readProfs().filter(function (p) { return p.status !== 'removed'; });
  var tips = readTips().filter(function (t) { return t.status === 'pending'; });
  return { items: items, tips: tips, profs: profs };
}

// Live items and tips with who approved them. Not public: reviewer emails stay inside the mod panel.
function handleLibrary(body) {
  requireRole(body, 'mod');
  return {
    items: readItems().filter(function (it) { return it.status === 'approved'; }),
    tips: readTips().filter(function (t) { return t.status === 'approved'; }),
    profs: readProfs().filter(function (p) { return p.status !== 'removed'; }),
  };
}

// ---- Professor tips ----

function newId(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

// Anyone can submit. A new prof name that matches an existing prof reuses it, so near-duplicates
// like "Dr A K Sharma" and "Prof. A.K. Sharma" don't split one prof into two pages.
function handleSubmitTip(body) {
  if (body.hp) fail('Rejected');
  var countIt = checkHourlyLimit();
  var meta = body.tip || {};
  var check = validateTip(meta);
  if (!check.ok) fail(check.errors.join('. '));
  return withLock(function () {
    var profs = readProfs();
    var profId = String(meta.profId || '');
    if (profId) {
      var known = profs.filter(function (p) { return p.id === profId && p.status !== 'removed'; })[0];
      if (!known) fail('That professor is no longer listed. Pick again.');
    } else {
      var match = findProfByName(profs, meta.newProfName);
      if (match) {
        profId = match.id;
      } else {
        var prof = { id: newId('pf_'), name: String(meta.newProfName).trim(), dept: 'IM', status: 'pending',
          addedBy: 'student', addedAt: nowIso() };
        writeProf(prof);
        profId = prof.id;
      }
    }
    var tip = {
      id: newId('tp_'), profId: profId, course: String(meta.course).trim(), year: toNumberOrBlank(meta.year),
      text: String(meta.text).trim(), authorName: String(meta.authorName || '').trim(), submittedAt: nowIso(),
      status: 'pending', reviewedBy: '', reviewedAt: '', rejectReason: '',
    };
    writeTip(tip);
    countIt();
    log(tip.authorName || 'anonymous', 'tip', tip.id, 'about ' + profId);
    return { id: tip.id };
  });
}

// Approving a tip about a new prof also confirms the prof (with the mod's spelling, if they fixed it).
function handleReviewTip(body) {
  var me = requireRole(body, 'mod');
  return withLock(function () {
    var tip = findTip(body.id);
    if (!tip) fail('Tip not found', 404);
    if (tip.status !== 'pending') fail('Already reviewed by ' + (tip.reviewedBy || 'someone'), 409);
    var edits = body.edits || {};
    var originalProfId = tip.profId;
    tip = applyTipEdits(tip, edits);
    var profs = readProfs();
    var tips = readTips();
    if (body.decision === 'approve') {
      if (String(tip.course).indexOf('OTHER:') === 0) fail('Pick an existing course (or add one) before approving');
      var check = validateTip({ profId: tip.profId, course: tip.course, year: tip.year, text: tip.text });
      if (!check.ok) fail(check.errors.join('. '));
      var prof = profs.filter(function (p) { return p.id === tip.profId; })[0];
      if (!prof || prof.status === 'removed') fail('Pick a professor for this tip');
      var name = String(edits.profName || '').trim();
      var renamed = false;
      if (name && name !== prof.name) {
        var clash = profNameClash(profs, name, prof.id);
        if (clash) {
          tip.profId = clash.id; // the corrected spelling is someone already listed: file the tip there
          prof = clash;
        } else {
          prof.name = name;
          renamed = true;
        }
      }
      if (prof.status !== 'approved' || renamed) {
        prof.status = 'approved';
        writeProf(prof);
      }
    }
    var r = applyReview(tip, { decision: body.decision, reviewer: me.email, at: nowIso(), reason: body.reason });
    if (!r.ok) fail(r.error, 409);
    writeTip(r.item);
    // A name a student typed in that no live tip points to any more (tip rejected or moved) is dropped,
    // so it doesn't linger in mod lists or collect later tips.
    if ((body.decision === 'reject' || originalProfId !== r.item.profId) && isOrphanPendingProf(profs, tips, originalProfId, r.item.id)) {
      var orphan = profs.filter(function (p) { return p.id === originalProfId; })[0];
      orphan.status = 'removed';
      writeProf(orphan);
    }
    log(me.email, body.decision + '-tip', r.item.id, r.item.text.slice(0, 60) + (body.reason ? ' — ' + body.reason : ''));
    bustCache();
    return { tip: r.item };
  });
}

function handleUpdateTip(body) {
  var me = requireRole(body, 'mod');
  return withLock(function () {
    var tip = findTip(body.id);
    if (!tip) fail('Tip not found', 404);
    if (tip.status !== 'approved') fail('Only live tips can be changed here');
    var edits = body.edits || {};
    var out = applyTipEdits(tip, edits);
    if (edits.status === 'removed') out.status = 'removed';
    writeTip(out);
    log(me.email, out.status === 'removed' ? 'remove-tip' : 'edit-tip', out.id, out.text.slice(0, 60));
    bustCache();
    return { tip: out };
  });
}

// Add a professor, fix a name, or remove one (its tips stop showing).
function handleSaveProf(body) {
  var me = requireRole(body, 'mod');
  var p = body.prof || {};
  var name = String(p.name || '').trim();
  if (!p.remove && (name.length < 2 || name.length > 80)) fail('Professor name should be 2 to 80 characters');
  return withLock(function () {
    var profs = readProfs();
    var prof = p.id ? profs.filter(function (x) { return x.id === p.id; })[0] : null;
    if (p.id && !prof) fail('Professor not found', 404);
    var action = 'prof';
    if (p.remove) {
      if (!prof) fail('Professor not found', 404);
      prof.status = 'removed';
      action = 'remove-prof';
    } else {
      var dup = profNameClash(profs, name, prof ? prof.id : '');
      if (dup) fail(dup.name + ' is already listed');
      if (!prof) {
        prof = { id: newId('pf_'), name: name, dept: String(p.dept || 'IM').trim(), status: 'approved', addedBy: me.email, addedAt: nowIso() };
      } else {
        prof.name = name; // keeps its status: a typed-in name goes public only with its first approved tip
        if (p.dept !== undefined) prof.dept = String(p.dept).trim();
      }
    }
    writeProf(prof);
    log(me.email, action, prof.id, prof.name);
    bustCache();
    return { prof: prof, profs: readProfs().filter(function (x) { return x.status !== 'removed'; }) };
  });
}

function handleReview(body) {
  var me = requireRole(body, 'mod');
  return withLock(function () {
    var item = findItem(body.id);
    if (!item) fail('Item not found', 404);
    if (item.status !== 'pending') fail('Already reviewed by ' + (item.reviewedBy || 'someone'), 409);
    if (body.edits) item = applyEdits(item, body.edits);
    if (body.decision === 'approve' && String(item.course).indexOf('OTHER:') === 0) {
      fail('Pick an existing course (or add one) before approving');
    }
    var r = applyReview(item, { decision: body.decision, reviewer: me.email, at: nowIso(), reason: body.reason });
    if (!r.ok) fail(r.error, 409);
    if (r.item.status === 'approved') {
      moveFiles(r.item, liveFolder(r.item.course), true);
      renameFiles(r.item); // the mod may have fixed the title
    } else {
      moveFiles(r.item, rejectedFolder(), false);
    }
    writeItem(r.item);
    log(me.email, body.decision, r.item.id, r.item.title + (body.reason ? ' — ' + body.reason : ''));
    bustCache();
    return { item: r.item };
  });
}

function handleUpdate(body) {
  var me = requireRole(body, 'mod');
  return withLock(function () {
    var item = findItem(body.id);
    if (!item) fail('Item not found', 404);
    if (item.status !== 'approved') fail('Only live items can be edited here');
    var out = applyEdits(item, body.edits);
    if (out.course !== item.course) {
      if (String(out.course).indexOf('OTHER:') === 0) fail('Pick an existing course');
      moveFiles(out, liveFolder(out.course), true);
    }
    if (out.status === 'removed') moveFiles(out, rejectedFolder(), false);
    else if (out.title !== item.title) renameFiles(out);
    writeItem(out);
    var keys = Object.keys(body.edits || {});
    var action = out.status === 'removed' ? 'remove' : 'edit';
    log(me.email, action, out.id, out.title + (action === 'edit' ? ' (' + keys.join(', ') + ')' : ''));
    bustCache();
    return { item: out };
  });
}

// Add a course; edit one (body.oldCode: if the code changes, its files, tips and Drive folder follow);
// or remove an empty one (body.remove + body.code).
function handleSaveCourse(body) {
  var me = requireRole(body, 'mod');
  return withLock(function () {
    var courses = readCourses();
    var exists = function (code) { return courses.some(function (c) { return c.code === code; }); };

    if (body.remove) {
      var gone = String(body.code || '').trim().toUpperCase();
      if (!exists(gone)) fail('Course not found', 404);
      var n = courseUse(readItems(), readTips(), gone);
      if (n) fail('This course still has ' + n + ' file' + (n === 1 ? '' : 's') + ' or tips on it. Move or remove those first.');
      deleteRowByKey('Courses', gone);
      log(me.email, 'remove-course', gone, '');
      bustCache();
      return { courses: readCourses() };
    }

    var v = validateCourse(body.course);
    if (!v.ok) fail(v.errors.join('. '));
    var course = v.course;
    var oldCode = String(body.oldCode || '').trim().toUpperCase();
    if (oldCode && !exists(oldCode)) fail('Course not found', 404);
    if (oldCode !== course.code && exists(course.code)) fail(course.code + ' is already a course');
    if (oldCode && oldCode !== course.code) {
      var moved = moveCourseCode(readItems(), readTips(), oldCode, course.code);
      moved.items.forEach(writeItem);
      moved.tips.forEach(writeTip);
      renameLiveFolder(oldCode, course.code);
      deleteRowByKey('Courses', oldCode);
    }
    saveCourse(course);
    log(me.email, 'course', course.code, course.name + (oldCode && oldCode !== course.code ? ' (was ' + oldCode + ')' : ''));
    bustCache();
    return { courses: readCourses() };
  });
}

function handleActivity(body) {
  requireRole(body, 'mod');
  return { rows: readLog(Math.min(Number(body.limit) || 200, 1000)) };
}

// ---- Owner ----

function handleMods(body) {
  requireRole(body, 'owner');
  return { mods: readMods(), requests: readRequests() };
}

function handleSetMod(body) {
  var me = requireRole(body, 'owner');
  var email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That does not look like an email');
  if (body.decision === 'add') {
    if (findRow('Mods', email) === -1) appendSafe('Mods', [email, me.email, nowIso()]);
    deleteRowByKey('Requests', email);
  } else if (body.decision === 'remove') {
    deleteRowByKey('Mods', email);
  } else if (body.decision === 'decline') {
    deleteRowByKey('Requests', email);
  } else {
    fail('Unknown decision');
  }
  log(me.email, 'mod-' + body.decision, email, '');
  return { mods: readMods(), requests: readRequests() };
}
