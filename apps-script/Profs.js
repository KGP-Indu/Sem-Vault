// Pure logic for professor pages and student tips. No Google services here.

var PROF_COLUMNS = ['id', 'name', 'dept', 'status', 'addedBy', 'addedAt'];
var TIP_COLUMNS = ['id', 'profId', 'course', 'year', 'text', 'authorName', 'submittedAt', 'status',
  'reviewedBy', 'reviewedAt', 'rejectReason'];
var TIP_MIN = 20;
var TIP_MAX = 1500;
var TIP_EDITABLE = ['text', 'course', 'year', 'profId'];

function rowToObject(cols, row) {
  var o = {};
  cols.forEach(function (c, i) {
    var v = sheetUnsafe(row[i]);
    o[c] = v === undefined || v === null ? '' : (v instanceof Date ? v.toISOString() : v);
  });
  return o;
}

function objectToRow(cols, o) {
  return cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; });
}

function rowToProf(row) { return rowToObject(PROF_COLUMNS, row); }
function profToRow(prof) { return objectToRow(PROF_COLUMNS, prof); }

function rowToTip(row) {
  var t = rowToObject(TIP_COLUMNS, row);
  t.year = toNumberOrBlank(t.year);
  return t;
}
function tipToRow(tip) { return objectToRow(TIP_COLUMNS, tip); }

function validateTip(meta) {
  var errors = [];
  meta = meta || {};
  var newName = String(meta.newProfName || '').trim();
  if (!meta.profId && !newName) errors.push('Pick a professor or type a new name');
  if (newName && (newName.length < 2 || newName.length > 80)) errors.push('Professor name should be 2 to 80 characters');
  if (!String(meta.course || '').replace(/^OTHER:/, '').trim()) errors.push('Course is required');
  var year = String(meta.year || '').trim();
  if (year && !(Number(year) >= 2000 && Number(year) <= 2100)) errors.push('Year looks wrong');
  var text = String(meta.text || '').trim();
  if (text.length < TIP_MIN) errors.push('Write at least ' + TIP_MIN + ' characters');
  if (text.length > TIP_MAX) errors.push('Keep it under ' + TIP_MAX + ' characters');
  if (String(meta.authorName || '').length > 60) errors.push('Name is too long');
  return { ok: errors.length === 0, errors: errors };
}

// "Prof. A. K. Sharma", "Dr A K Sharma" and "a.k. sharma" are the same person.
function normProfName(name) {
  return String(name || '').toLowerCase()
    .replace(/\b(prof|professor|dr)\b\.?/g, ' ')
    .replace(/[^a-z]/g, '');
}

function findProfByName(profs, name) {
  var n = normProfName(name);
  if (!n) return null;
  for (var i = 0; i < profs.length; i++) {
    if (profs[i].status !== 'removed' && normProfName(profs[i].name) === n) return profs[i];
  }
  return null;
}

function publicTips(tips) {
  return tips.filter(function (t) { return t.status === 'approved'; }).map(function (t) {
    return { id: t.id, profId: t.profId, course: t.course, year: t.year, text: t.text,
      authorName: t.authorName, submittedAt: t.submittedAt };
  });
}

function publicProfs(profs) {
  return profs.filter(function (p) { return p.status === 'approved'; }).map(function (p) {
    return { id: p.id, name: p.name, dept: p.dept };
  });
}

function applyTipEdits(tip, edits) {
  var out = copy(tip);
  Object.keys(edits || {}).forEach(function (k) {
    if (TIP_EDITABLE.indexOf(k) === -1) return;
    out[k] = k === 'year' ? toNumberOrBlank(edits[k]) : (k === 'text' ? String(edits[k]).trim() : edits[k]);
  });
  return out;
}

// Another prof (not selfId, not removed) whose name means the same person, or null.
function profNameClash(profs, name, selfId) {
  var others = profs.filter(function (p) { return p.id !== selfId; });
  return findProfByName(others, name);
}

// A prof a student typed in ("pending") that no other live tip points to: safe to drop.
function isOrphanPendingProf(profs, tips, profId, exceptTipId) {
  var prof = profs.filter(function (p) { return p.id === profId; })[0];
  if (!prof || prof.status !== 'pending') return false;
  return !tips.some(function (t) {
    return t.profId === profId && t.id !== exceptTipId && (t.status === 'pending' || t.status === 'approved');
  });
}
