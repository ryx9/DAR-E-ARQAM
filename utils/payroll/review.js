// Salary configuration warnings are kept separate from issues that can be
// acknowledged without treating an unknown attendance day as an absence.
export function reviewWarnings(row) {
  const attendance = (row.warnings || []).filter(warning => /^(No attendance log|Missing or invalid punches|Punch order needs review|Missing shift)/.test(warning))
  return { attendance, setup: (row.warnings || []).filter(warning => !attendance.includes(warning)) }
}
