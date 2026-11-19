import { DAYS, colorFor, slotIncludes, timetableRows } from './timetable.mjs';

export function reportOptions(plan, classes = [], teachers = []) {
  const rows = timetableRows(plan);
  const classIds = new Set(rows.map(r => r.classId));
  const teacherIds = new Set(rows.flatMap(r => r.teacherIds.map(String)));
  return {
    classes: classes.filter(c => classIds.has(String(c.id))),
    teachers: teachers.filter(t => teacherIds.has(String(t.id))),
  };
}

export function buildReports(
  plan,
  { classes = [], teachers = [], subjects = [], mode, classIds, teacherIds, colorMode } = {}
) {
  const options = reportOptions(plan, classes, teachers);
  const chosen = options.classes.filter(c => classIds == null || classIds.includes(String(c.id)));
  const subjectNames = new Map(subjects.map(s => [String(s.id), s.name]));
  const staffNames = new Map(teachers.map(t => [String(t.id), t.name]));
  const cell = (slot, c) => {
    const lesson = slot.lessons?.[c.id];
    if (!slotIncludes(slot, c.id)) return { text: '—' };
    if (!lesson) return { text: slot.kind === 'break' ? 'Break' : 'Free' };
    return {
      text: [
        subjectNames.get(String(lesson.subjectId)) || 'Subject',
        lesson.teacherIds.map(id => staffNames.get(String(id)) || 'Former staff').join(', '),
      ].join('\n'),
      color:
        colorMode === 'teachers'
          ? colorFor(lesson.teacherIds[0], plan.colors?.teachers)
          : colorFor(c.id, plan.colors?.classes),
    };
  };
  const reports = [];
  if (mode === 'class') {
    for (const c of chosen) {
      const days = DAYS.map(day => ({
        day,
        slots: (plan.days[day] || []).filter(s => slotIncludes(s, c.id)),
      })).filter(d => d.slots.length);
      const count = Math.max(0, ...days.map(d => d.slots.length));
      reports.push({
        title: c.name,
        head: ['Day', ...Array.from({ length: count }, (_, i) => 'Period ' + (i + 1))],
        body: days.map(({ day, slots }) => [
          { text: day },
          ...Array.from({ length: count }, (_, i) => {
            const slot = slots[i];
            if (!slot) return { text: '—' };
            const result = cell(slot, c);
            return {
              ...result,
              text: [slot.label, slot.start + '–' + slot.end, result.text]
                .filter(Boolean)
                .join('\n'),
            };
          }),
        ]),
      });
    }
    return reports;
  }
  if (mode === 'teacher') {
    for (const teacher of options.teachers) {
      const id = String(teacher.id);
      if (teacherIds != null && !teacherIds.includes(id)) continue;
      let hasAssignment = false;
      const days = DAYS.map(day => {
        const periods = [];
        for (const c of chosen) {
          const lectures = (plan.days[day] || []).filter(
            slot => slot.kind !== 'break' && slotIncludes(slot, c.id)
          );
          lectures.forEach((slot, index) => {
            const entries = (periods[index] ||= []);
            const lesson = slot.lessons?.[c.id];
            if (!lesson?.teacherIds.map(String).includes(id)) return;
            hasAssignment = true;
            entries.push({
              text:
                (subjectNames.get(String(lesson.subjectId)) || 'Subject') +
                ' / ' +
                c.name +
                '\n' +
                slot.start +
                '–' +
                slot.end,
              color:
                colorMode === 'teachers'
                  ? colorFor(id, plan.colors?.teachers)
                  : colorFor(c.id, plan.colors?.classes),
            });
          });
        }
        return { day, periods };
      }).filter(row => row.periods.length);
      if (!hasAssignment) continue;
      const count = Math.max(...days.map(row => row.periods.length));
      reports.push({
        title: teacher.name,
        head: ['Day', ...Array.from({ length: count }, (_, i) => 'Lecture ' + (i + 1))],
        body: days.map(({ day, periods }) => [
          { text: day },
          ...Array.from({ length: count }, (_, i) => {
            const entries = periods[i];
            if (!entries?.length) return { text: '—' };
            return {
              text: entries.map(entry => entry.text).join('\n\n'),
              color:
                entries.length === 1 || colorMode === 'teachers' ? entries[0].color : undefined,
            };
          }),
        ]),
      });
    }
    return reports;
  }
  for (const day of DAYS) {
    const slots = plan.days[day] || [];
    const matches = (s, c) => {
      const lesson = s.lessons?.[c.id];
      return Boolean(lesson);
    };
    const columns = chosen.filter(c => slots.some(s => matches(s, c)));
    if (!columns.length) continue;
    const visible = slots.filter(s => columns.some(c => slotIncludes(s, c.id)));
    reports.push({
      day,
      title: 'Overall timetable · ' + day,
      head: ['Slot / time', ...columns.map(c => c.name)],
      body: visible.map(s => [
        { text: (s.label || 'Lecture') + '\n' + s.start + '–' + s.end },
        ...columns.map(c => cell(s, c)),
      ]),
    });
  }
  return reports;
}
