// Pure helpers for shaping the public catalog into pages.

// The six sections on every course page, in order (same as ITEM_TYPES in apps-script/Catalog.js).
export const TYPE_ORDER = ['book', 'slides', 'shortnotes', 'pyq', 'test', 'assignment'];
export const TYPE_LABELS = {
  book: 'Books', slides: 'PPTs & class notes', shortnotes: 'Short notes & formulas',
  pyq: 'PYQs', test: 'Tests', assignment: 'Assignments',
};
// One item of each kind, for labels like "Formula sheet" under a title.
export const TYPE_SINGULAR = {
  book: 'Book', slides: 'Slides / class notes', shortnotes: 'Short notes', pyq: 'Question paper',
  test: 'Test', assignment: 'Assignment',
};

export function semesters(courses) {
  const bySem = new Map();
  for (const c of courses) {
    if (!bySem.has(c.semester)) bySem.set(c.semester, []);
    bySem.get(c.semester).push(c);
  }
  return [...bySem.keys()].sort((a, b) => a - b).map((semester) => ({
    semester,
    courses: bySem.get(semester).sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

const byYearThenTitle = (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0)
  || String(a.title).localeCompare(String(b.title));

// Every course page shows all six sections, empty ones included, so people know where things go.
export function coursePage(items, code) {
  const mine = items.filter((x) => x.course === code);
  const sections = TYPE_ORDER.map((type) => ({
    type,
    items: mine.filter((x) => x.type === type).sort(byYearThenTitle),
  }));
  return { sections, total: mine.length };
}

export function filterPyqs(items, f) {
  const examRank = { endsem: 0, midsem: 1 };
  return items
    .filter((x) => x.type === 'pyq')
    .filter((x) => !f.course || x.course === f.course)
    .filter((x) => !f.year || String(x.year) === String(f.year))
    .filter((x) => !f.term || x.term === f.term)
    .filter((x) => !f.exam || x.exam === f.exam)
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0)
      || (examRank[a.exam] ?? 2) - (examRank[b.exam] ?? 2));
}

export function search(items, courses, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const byCode = new Map(courses.map((c) => [c.code, c]));
  return items.filter((x) => {
    const c = byCode.get(x.course) || {};
    return [x.title, x.description, x.course, c.name, c.short]
      .some((s) => String(s || '').toLowerCase().includes(needle));
  });
}

export function driveUrls(fileId) {
  return {
    view: `https://drive.google.com/file/d/${fileId}/view`,
    download: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}
