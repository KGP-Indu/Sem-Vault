import { parsePyqFilename } from './pyq.js';

// Browser-side checks before any bytes are sent. The server repeats them (validateUpload).
export const MAX_BYTES = 25 * 1024 * 1024;

export function uploadErrors({ title, course, file }) {
  const e = {};
  if (!String(title || '').trim()) e.title = 'Give it a title';
  if (!course) e.course = 'Pick a course';
  else if (course.startsWith('OTHER:') && !course.slice(6).trim()) e.course = 'Type the course name';
  if (!file) e.file = 'Choose a file';
  else if (file.size > MAX_BYTES) e.file = 'Max 25 MB per file';
  return e;
}

export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ---- batch upload ----

// Starting values for one row: from the file name when it is a question paper, else the shared choices.
export function rowDefaults(fileName, courses, shared) {
  const p = parsePyqFilename(fileName);
  const course = courses.find((c) => c.code === p.course);
  const isPyq = Boolean(p.exam);
  return {
    title: isPyq && course
      ? `${course.short} ${p.exam} ${p.year || ''}`.trim()
      : String(fileName).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
    course: course ? course.code : shared.course,
    type: isPyq ? 'pyq' : shared.type,
    year: p.year ? String(p.year) : '',
    term: p.term || '',
    exam: p.exam || '',
  };
}
