// Pure logic for the course list that mods edit (Courses tab in the mod panel).

function validateCourse(c) {
  c = c || {};
  var errors = [];
  var code = String(c.code || '').trim().toUpperCase();
  var name = String(c.name || '').trim();
  var semester = Number(c.semester);
  if (!/^[A-Z]{2}\d{5}$/.test(code)) errors.push('Course code looks like IM31005');
  if (!name) errors.push('Course name is required');
  if (!(semester >= 1 && semester <= 10 && Math.floor(semester) === semester)) errors.push('Semester must be 1 to 10');
  return {
    ok: errors.length === 0,
    errors: errors,
    course: { code: code, name: name, short: String(c.short || '').trim() || code, semester: semester },
  };
}

// Copies of every file and tip on oldCode, moved to newCode (all statuses, so nothing is left behind).
function moveCourseCode(items, tips, oldCode, newCode) {
  var move = function (x) { var o = copy(x); o.course = newCode; return o; };
  return {
    items: items.filter(function (x) { return x.course === oldCode; }).map(move),
    tips: tips.filter(function (t) { return t.course === oldCode; }).map(move),
  };
}

// Files and tips that still show (or are waiting) under this course.
function courseUse(items, tips, code) {
  var live = function (x) { return x.course === code && (x.status === 'approved' || x.status === 'pending'); };
  return items.filter(live).length + tips.filter(live).length;
}
