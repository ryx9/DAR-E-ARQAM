import test from 'node:test';
import assert from 'node:assert/strict';
import { canAssignRechecking } from './recheckingAccess.mjs';

test('only admins, superadmins and teachers authorized by the database can assign', () => {
  assert.equal(canAssignRechecking('admin', false), true);
  assert.equal(canAssignRechecking('superadmin', false), true);
  assert.equal(canAssignRechecking('teacher', true), true);
  assert.equal(canAssignRechecking('teacher', false), false);
  assert.equal(canAssignRechecking('teacher', null), false);
  assert.equal(canAssignRechecking('teacher', 'true'), false);
  assert.equal(canAssignRechecking('user', true), false);
  assert.equal(canAssignRechecking(null, true), false);
});
