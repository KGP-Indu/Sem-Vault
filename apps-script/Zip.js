// Pure logic for "download a selection as a zip". The handler (Api.js handleZip) does the Drive work.

var MAX_ZIP_FILES = 30;
var MAX_ZIP_BYTES = 25 * 1024 * 1024; // the zip goes back base64-encoded; stay well under Apps Script's response limit

function validateZipIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return { ok: false, errors: ['Pick at least one file'], ids: [] };
  if (!ids.every(function (x) { return typeof x === 'string' && x; })) return { ok: false, errors: ['Bad selection'], ids: [] };
  var unique = ids.filter(function (x, i) { return ids.indexOf(x) === i; });
  if (unique.length > MAX_ZIP_FILES) {
    return { ok: false, errors: ['Pick at most ' + MAX_ZIP_FILES + ' files per zip'], ids: [] };
  }
  return { ok: true, errors: [], ids: unique };
}

// File names inside the zip: each title, and "(2)", "(3)" for repeats (zips can't hold two of one name).
function zipEntryNames(entries) {
  var seen = {};
  return entries.map(function (e) {
    var base = downloadName(e.title, e.ext);
    var key = base.toLowerCase();
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] === 1) return base;
    var dot = base.lastIndexOf('.');
    return base.slice(0, dot) + ' (' + seen[key] + ')' + base.slice(dot);
  });
}

function zipName(courses, items) {
  var codes = items.map(function (it) { return it.course; }).filter(function (c, i, all) { return all.indexOf(c) === i; });
  var course = codes.length === 1 ? courses.filter(function (c) { return c.code === codes[0]; })[0] : null;
  return 'Indu Sem Vault - ' + (course ? course.short || course.code : 'selection') + '.zip';
}

function zipSizeError(totalBytes) {
  if (totalBytes <= MAX_ZIP_BYTES) return null;
  return 'That selection is ' + Math.ceil(totalBytes / (1024 * 1024)) + ' MB. A zip can be up to ' +
    MAX_ZIP_BYTES / (1024 * 1024) + ' MB, so download it in smaller parts.';
}
