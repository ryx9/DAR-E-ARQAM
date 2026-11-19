import assert from 'node:assert/strict';
import test from 'node:test';
import { subjectSelection } from './subjectSelection.mjs';

test('selection reflects persisted subjects for the active classes', () => {
  const mapping = { 1: [{ id: 7 }], 2: [{ id: 8 }] };
  assert.equal(subjectSelection([], mapping, 7).checked, false);
  assert.equal(subjectSelection([1], mapping, 7).checked, true);
  assert.deepEqual(subjectSelection([1, 2], mapping, 7), {
    checked: false,
    mixed: true,
    assigned: 1,
    additions: [{ class_id: 2, subject_id: 7 }],
  });
  assert.equal(subjectSelection([2], mapping, 7).mixed, false);
  mapping[2].push({ id: 7 });
  assert.deepEqual(subjectSelection([1, 2], mapping, 7), {
    checked: true,
    mixed: false,
    assigned: 2,
    additions: [],
  });
});
