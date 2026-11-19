export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const slotIncludes = (slot, id) => !slot.classIds || slot.classIds.includes(String(id));
export function applicableLessons(slot, lessons) {
  return Object.fromEntries(Object.entries(lessons || {}).filter(([id]) => slotIncludes(slot, id)));
}
export const emptyTimetable = () => ({
  title: 'Weekly timetable',
  days: Object.fromEntries(DAYS.map(day => [day, []])),
  colors: { classes: {}, teachers: {} },
});
export const colorFor = (id, overrides = {}) =>
  overrides[id] ||
  ['#dbeafe', '#ede9fe', '#dcfce7', '#ffedd5', '#fce7f3', '#cffafe'][
    String(id)
      .split('')
      .reduce((n, c) => n + c.charCodeAt(0), 0) % 6
  ];
export function timetableRows(plan) {
  return DAYS.flatMap(day =>
    (plan?.days?.[day] || []).flatMap(slot =>
      Object.entries(slot.lessons || {}).map(([classId, lesson]) => ({
        day,
        slotId: slot.id,
        label: slot.label,
        start: slot.start,
        end: slot.end,
        classId,
        ...lesson,
      }))
    )
  );
}
export function warnings(plan, labels = {}) {
  const className = id => labels.classes?.[id] || id;
  const teacherName = id => labels.teachers?.[id] || id;
  const result = [];
  const rows = timetableRows(plan);
  for (const row of rows) {
    if (row.teacherIds.length > 1)
      result.push(
        `${row.day} ${row.start}: ${row.teacherIds.length} teachers assigned to class ${className(row.classId)}.`
      );
  }
  rows.forEach((a, i) =>
    rows.slice(i + 1).forEach(b => {
      if (a.day !== b.day || a.start >= b.end || b.start >= a.end) return;
      const shared = a.teacherIds.filter(id => b.teacherIds.includes(id));
      if (shared.length)
        result.push(
          `${a.day} ${a.start}–${a.end}: teacher(s) ${shared.map(teacherName).join(', ')} overlap between classes ${className(a.classId)} and ${className(b.classId)}.`
        );
    })
  );
  return result;
}
export function validateTimetable(plan, classSubjects, staff) {
  const errors = [];
  for (const day of DAYS) {
    const ids = new Set();
    for (const slot of plan.days[day] || []) {
      if (!slot.id || ids.has(slot.id)) errors.push(`${day}: duplicate or missing slot ID.`);
      ids.add(slot.id);
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) ||
        slot.start >= slot.end ||
        slot.end > '23:59'
      )
        errors.push(`${day}: enter a valid start and end time.`);
      if (slot.kind === 'break' && Object.keys(slot.lessons || {}).length)
        errors.push(`${day}: breaks cannot contain lessons.`);
      for (const [classId, lesson] of Object.entries(slot.lessons || {})) {
        if (!(classSubjects[classId] || []).some(s => String(s.id) === String(lesson.subjectId)))
          errors.push(`${day}: choose an assigned subject for class ${classId}.`);
        if (
          !lesson.teacherIds?.length ||
          lesson.teacherIds.some(id => !staff.some(p => String(p.id) === String(id)))
        )
          errors.push(`${day}: choose active staff for class ${classId}.`);
      }
    }
  }
  return errors;
}
