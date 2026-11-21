// Pure helpers for professor pages, built from the public catalog's profs and tips.

const yearsDesc = (ys) => [...new Set(ys.filter((y) => y !== '' && y != null).map(Number))].sort((a, b) => b - a);
const newestFirst = (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0)
  || String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));

// The profs with tips for this course, each once, with the years they taught it.
export function profsForCourse(tips, profs, code) {
  const byId = new Map(profs.map((p) => [p.id, p]));
  const years = new Map();
  for (const t of tips) {
    if (t.course !== code || !byId.has(t.profId)) continue;
    if (!years.has(t.profId)) years.set(t.profId, []);
    years.get(t.profId).push(t.year);
  }
  return [...years.entries()]
    .map(([id, ys]) => ({ id, name: byId.get(id).name, years: yearsDesc(ys) }))
    .sort((a, b) => (b.years[0] || 0) - (a.years[0] || 0) || a.name.localeCompare(b.name));
}

export function profPage(tips, profs, id) {
  const prof = profs.find((p) => p.id === id);
  if (!prof) return null;
  const mine = tips.filter((t) => t.profId === id);
  const byCourse = new Map();
  for (const t of mine) {
    if (!byCourse.has(t.course)) byCourse.set(t.course, []);
    byCourse.get(t.course).push(t.year);
  }
  const courses = [...byCourse.entries()]
    .map(([code, ys]) => ({ code, years: yearsDesc(ys) }))
    .sort((a, b) => (b.years[0] || 0) - (a.years[0] || 0) || a.code.localeCompare(b.code));
  return { prof, courses, tips: [...mine].sort(newestFirst) };
}

export function profList(profs, tips) {
  return profs
    .map((p) => {
      const mine = tips.filter((t) => t.profId === p.id);
      return { ...p, tipCount: mine.length, courses: [...new Set(mine.map((t) => t.course))].sort() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const TIP_MIN = 20;
export const TIP_MAX = 1500;

// Browser-side checks for the tip form; the server repeats them (validateTip).
export function tipErrors({ prof, newProf, course, text }) {
  const e = {};
  if (!prof) e.prof = 'Pick a professor';
  else if (prof === 'NEW' && !String(newProf || '').trim()) e.prof = "Type the professor's name";
  if (!course) e.course = 'Pick a course';
  const len = String(text || '').trim().length;
  if (len < TIP_MIN) e.text = `Write at least ${TIP_MIN} characters`;
  else if (len > TIP_MAX) e.text = `Keep it under ${TIP_MAX} characters`;
  return e;
}
