import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReports, reportOptions } from './timetableReports.mjs';

test('missing catalogues produce an empty report during workspace initialization', () => {
  assert.deepEqual(reportOptions({ days: {} }), { classes: [], teachers: [] });
  assert.deepEqual(buildReports({ days: {} }, { mode: 'overall' }), []);
});

const classes = [1, 2, 3].map(id => ({ id, name: 'Class ' + id }));
const teachers = ['a', 'b', 'unused'].map(id => ({ id, name: id }));
const slot = (start, end, lessons, classIds) => ({
  start,
  end,
  label: 'Lecture',
  kind: 'lecture',
  classIds,
  lessons,
});
const lesson = t => ({ subjectId: 's', teacherIds: [t] });
const plan = {
  days: {
    Monday: [
      slot('08:00', '08:40', { 1: lesson('a') }),
      slot('08:40', '09:20', { 2: lesson('b') }, ['2']),
    ],
    Friday: [slot('09:00', '09:30', { 1: lesson('a') })],
  },
};
const reports = (mode, filters = {}) =>
  buildReports(plan, {
    classes,
    teachers,
    subjects: [{ id: 's', name: 'Math' }],
    mode,
    ...filters,
  });
test('weekly class reports align period positions and retain day-specific timings', () => {
  const [first, second] = reports('class');
  assert.deepEqual(first.head, ['Day', 'Period 1']);
  assert.deepEqual(
    first.body.map(row => row[0].text),
    ['Monday', 'Friday']
  );
  assert.match(first.body[1][1].text, /09:00–09:30/);
  assert.equal(second.head.length, 3);
  assert.equal(second.body[1][2].text, '—');
  assert.equal(reports('class').length, 2);
});
test('overall and teacher reports exclude empty columns and respect both selections', () => {
  assert.deepEqual(reports('overall')[1].head, ['Slot / time', 'Class 1']);
  const selected = reports('teacher', { classIds: ['2'], teacherIds: ['a', 'b'] });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].title, 'b');
  assert.deepEqual(selected[0].head, ['Day', 'Lecture 1', 'Lecture 2']);
  assert.deepEqual(
    selected[0].body[0].map(cell => cell.text),
    ['Monday', '—', 'Math / Class 2\n08:40–09:20']
  );
  const [weekly] = reports('teacher', { teacherIds: ['a'] });
  assert.deepEqual(
    weekly.body.map(row => row[0].text),
    ['Monday', 'Friday']
  );
  assert.equal(weekly.body[1][1].text, 'Math / Class 1\n09:00–09:30');
  assert.equal(reports('teacher', { classIds: [] }).length, 0);
});
