export const roundGroups = [
  {
    title: 'Classroom environment',
    items: [
      ['class_cleanliness', 'Classroom cleanliness'],
      ['discipline', 'Classroom discipline and routines'],
      ['student_behaviour', 'Respectful behaviour and participation'],
    ],
  },
  {
    title: 'Student hygiene and uniform',
    items: [
      ['student_cleanliness', 'Student cleanliness and grooming'],
      ['uniform', 'Proper uniform'],
      ['nails', 'Clean and trimmed nails'],
    ],
  },
  {
    title: 'Teaching and learning',
    items: [
      ['syllabus_planning', 'Syllabus plan followed'],
      ['timetable', 'Timetable followed'],
      ['student_response', 'Student responses and engagement'],
      ['student_learning', 'Evidence of student learning'],
    ],
  },
  {
    title: 'Notebooks and workbooks',
    items: [
      ['books_condition', 'Condition and completeness'],
      ['book_checking', 'Work checked and feedback given'],
      ['book_rechecking', 'Corrections rechecked'],
    ],
  },
  {
    title: 'Registers and records',
    items: [
      ['attendance_register', 'Attendance register maintained'],
      ['cms_updates', 'CMS class records up to date'],
    ],
  },
];

export const roundCriteria = roundGroups.flatMap(group => group.items);
export const roundRatings = [
  ['1', '1 · Unsatisfactory'],
  ['2', '2 · Needs improvement'],
  ['3', '3 · Satisfactory'],
  ['4', '4 · Good'],
  ['5', '5 · Excellent'],
  ['na', 'Not observed'],
];

export function average(values) {
  const scored = values.filter(value => value != null && Number.isFinite(Number(value)));
  return scored.length
    ? scored.reduce((sum, value) => sum + Number(value), 0) / scored.length
    : null;
}

export function formatScore(value, suffix = '') {
  return value == null ? '—' : Number(value).toFixed(1) + suffix;
}

export function summarizeRounds(items) {
  return {
    visits: items.length,
    score: average(items.map(item => item.score)),
    latest: items.reduce((date, item) => (item.visit_date > date ? item.visit_date : date), ''),
    actions: items.reduce((count, item) => count + item.actionables.length, 0),
  };
}
