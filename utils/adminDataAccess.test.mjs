import assert from 'node:assert/strict';
import test from 'node:test';
import { adminCanOpen, canSeeStudentReportDetails, STUDENT_REPORT_DETAILS_ACCESS } from './adminDataAccess.ts';

const adminAccess = {
  role: 'admin',
  admin_operations_access: true,
  admin_fee_access: true,
  admin_student_access: true,
  admin_academics_access: true,
  admin_communication_access: true,
  admin_staff_access: true,
};

test('student report details can be hidden independently of student list access', () => {
  const access = { ...adminAccess, admin_page_access: { [STUDENT_REPORT_DETAILS_ACCESS]: false } };
  assert.equal(adminCanOpen('/admin/studentslist', access), true);
  assert.equal(canSeeStudentReportDetails(access), false);
  assert.equal(canSeeStudentReportDetails(adminAccess), true);
  assert.equal(canSeeStudentReportDetails({ ...access, role: 'superadmin' }), true);
  assert.equal(canSeeStudentReportDetails(null), false);
});

test('admin module permissions cover module routes without blocking other modules', () => {
  const access = { ...adminAccess, admin_academics_access: false };

  assert.equal(adminCanOpen('/timetable', access), false);
  assert.equal(adminCanOpen('/activities', access), false);
  assert.equal(adminCanOpen('/messages', access), true);
});

test('individual page permissions can restrict one page within an enabled module', () => {
  const access = {
    ...adminAccess,
    admin_page_access: { 'academics.timetable': false },
  };

  assert.equal(adminCanOpen('/timetable', access), false);
  assert.equal(adminCanOpen('/dashboard', access), true);
});

test('fee and admission routes require both fees and student access', () => {
  const withoutStudents = { ...adminAccess, admin_student_access: false };
  const withoutFees = { ...adminAccess, admin_fee_access: false };

  assert.equal(adminCanOpen('/admin/invoices', withoutStudents), false);
  assert.equal(adminCanOpen('/admin/managestudent', withoutFees), false);
  assert.equal(adminCanOpen('/admin/inquiries', withoutFees), true);
});

test('invoice printing and fee reports have independent page permissions', () => {
  const access = {
    ...adminAccess,
    admin_page_access: { 'fees.reports': true, 'fees.invoice-print': false },
  };
  assert.equal(adminCanOpen('/admin/report', access), true);
  assert.equal(adminCanOpen('/admin/invoice/print', access), false);
  assert.equal(adminCanOpen('/admin/invoice/print', { ...access, admin_page_access: { 'fees.invoice-print': true } }), true);
  assert.equal(adminCanOpen('/admin/invoice/print', { ...access, admin_student_access: false }), false);
});

test('only admins are restricted by admin module permissions', () => {
  assert.equal(
    adminCanOpen('/timetable', { ...adminAccess, role: 'teacher', admin_academics_access: false }),
    true
  );
});

test('the administration module permission applies to its landing page', () => {
  assert.equal(adminCanOpen('/admin', { ...adminAccess, admin_operations_access: false }), false);
});

test('list, create, and detail routes have independent page permissions', () => {
  const access = {
    ...adminAccess,
    admin_page_access: {
      'students.inquiries': false,
      'students.new-inquiry': false,
      'students.inquiry-detail': true,
    },
  };

  assert.equal(adminCanOpen('/admin/inquiries', access), false);
  assert.equal(adminCanOpen('/admin/inquiries/add', access), false);
  assert.equal(adminCanOpen('/admin/inquiries/123', access), true);
});

test('unknown admin pages are denied to admins', () => {
  assert.equal(adminCanOpen('/admin/payroll', adminAccess), false);
});

test('configured administration page denials reject their exact routes', () => {
  const access = {
    ...adminAccess,
    admin_page_access: {
      'operations.advances': false,
      'operations.complaints': false,
      'operations.datesheets': false,
    },
  };

  assert.equal(adminCanOpen('/admin/advances', access), false);
  assert.equal(adminCanOpen('/admin/complaint', access), false);
  assert.equal(adminCanOpen('/admin/datesheet-builder', access), false);
});
