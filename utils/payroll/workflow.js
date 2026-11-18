import { hasAnyPunch, payrollTotals } from './calculate.js';
import { reviewWarnings } from './review.js';

export function needsAttendanceRecalculation(row) {
  return (
    row.days?.some(
      day =>
        day.status === 'missing_log' || (day.status === 'missing_punch' && !hasAnyPunch(day.source))
    ) ?? false
  );
}

export function approvalIssues(row) {
  const { attendance, setup } = reviewWarnings(row);
  const issues = [];
  if (needsAttendanceRecalculation(row)) issues.push('Recalculate using the current absence rule');
  if (attendance.length && !row.issue_acknowledgement?.trim())
    issues.push('Acknowledge or correct attendance');
  if (
    setup.length &&
    !(
      row.salary_override_reason?.trim() &&
      row.salary_override_amount != null &&
      row.salary_override_amount !== '' &&
      Number(row.salary_override_amount) >= 0
    )
  )
    issues.push('Set salary and enter a reason');
  const waived = Number(row.waived_days || 0);
  if (!Number.isInteger(waived) || waived < 0 || waived > row.calculated_days)
    issues.push('Check waived days');
  if (waived && !row.waiver_reason?.trim()) issues.push('Enter a waiver reason');
  if (payrollTotals(row).net < 0) issues.push('Deductions exceed salary');
  return issues;
}

export function persistedRow(review) {
  return {
    ...review.snapshot,
    review_version: review.version,
    review_stage: review.stage,
    review_visible: review.visible,
  };
}

// Recalculation changes attendance and rates. Keep explicit decisions wherever
// they still apply, and require review of any changed attendance warnings.
export function refreshDraft(previous, calculated) {
  const sameIssues =
    JSON.stringify(reviewWarnings(previous).attendance) ===
    JSON.stringify(reviewWarnings(calculated).attendance);
  const useOverride =
    reviewWarnings(calculated).setup.length &&
    previous.salary_override_reason?.trim() &&
    previous.salary_override_amount !== '' &&
    previous.salary_override_amount != null;
  return {
    ...previous,
    ...calculated,
    waived_days: previous.waived_days || 0,
    issue_acknowledgement: sameIssues ? previous.issue_acknowledgement || '' : '',
    salary: useOverride ? Number(previous.salary_override_amount) : calculated.salary,
    salary_override_amount: useOverride ? previous.salary_override_amount : '',
    salary_override_reason: useOverride ? previous.salary_override_reason : '',
  };
}
