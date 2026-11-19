import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTimetable,
  timetableRows,
  warnings,
  validateTimetable,
  slotIncludes,
  applicableLessons,
} from './timetable.mjs';
test('legacy slots apply to all classes, and copying to a restricted slot keeps only eligible lessons', () => {
  const restricted = { classIds: ['2', '3'] };
  assert.ok(slotIncludes({}, 1));
  assert.ok(slotIncludes(restricted, 2));
  assert.equal(slotIncludes(restricted, 1), false);
  assert.deepEqual(
    applicableLessons(restricted, { 1: { subjectId: 'A' }, 2: { subjectId: 'B' } }),
    { 2: { subjectId: 'B' } }
  );
});
const slot = (id, start, end, lessons) => ({ id, start, end, kind: 'lecture', label: id, lessons });
const lesson = (...teacherIds) => ({ subjectId: '1', teacherIds });
test('detect shared teachers, time overlaps and team teaching, but allow adjacent lessons', () => {
  const p = emptyTimetable();
  p.days.Monday = [
    slot('a', '08:00', '08:40', { 1: lesson('t'), 2: lesson('t', 'u') }),
    slot('b', '08:40', '09:20', { 1: lesson('t') }),
  ];
  assert.equal(warnings(p).length, 2);
  assert.equal(timetableRows(p).length, 3);
  p.days.Tuesday = [slot('c', '08:00', '08:40', { 1: lesson('t') })];
  assert.equal(warnings(p).length, 2);
});
test('require assigned class subjects, staff and valid slots', () => {
  const p = emptyTimetable();
  p.days.Friday = [slot('a', '08:00', '08:30', { 1: lesson('t') })];
  assert.deepEqual(validateTimetable(p, { 1: [{ id: 1 }] }, [{ id: 't' }]), []);
  assert.equal(validateTimetable(p, {}, []).length, 2);
  p.days.Friday[0].end = '07:00';
  p.days.Friday[0].kind = 'break';
  assert.equal(validateTimetable(p, { 1: [{ id: 1 }] }, [{ id: 't' }]).length, 2);
});
