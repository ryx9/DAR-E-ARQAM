const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const hasPunch = value => value != null && String(value).trim() !== '';
export function hasAnyPunch(source) {
  return Array.from({ length: 5 }, (_, i) => i + 1).some(
    i => hasPunch(source?.[`Clock In ${i}`]) || hasPunch(source?.[`Clock Out ${i}`])
  );
}

function minutes(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number')
    return Number.isFinite(value) ? Math.round((value % 1) * 1440) : null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(String(value).trim());
  if (!match || +match[2] > 59 || +match[1] > (match[3] ? 12 : 23) || (match[3] && +match[1] < 1))
    return null;
  let hour = +match[1];
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + +match[2];
}
const time = value => minutes(String(value).slice(0, 5));
const applies = (items, date) =>
  items
    .filter(item => item.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
export function calculatePayroll({
  period,
  profiles,
  shifts,
  assignments,
  salaries,
  holidays,
  logs,
  corrections = [],
}) {
  const [year, month] = period.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${period}-01`,
    end = `${period}-${String(last).padStart(2, '0')}`;

  return profiles
    .filter(p => p.is_active === true)
    .map(profile => {
      const holidaySet = new Set(
        holidays
          .filter(h => !h.employee_ids?.length || h.employee_ids.includes(profile.id))
          .map(h => h.holiday_date)
      );
      const warnings = [],
        days = [],
        employeeAssignments = assignments.filter(a => a.profile_id === profile.id);
      const rates = salaries.filter(s => s.profile_id === profile.id);
      const salary = applies(rates, start);
      if (!salary) warnings.push('No salary is effective on the first day of the month.');
      if (rates.some(r => r.effective_from > start && r.effective_from <= end))
        warnings.push(
          'Salary changes during this month; review the monthly amount before posting.'
        );
      for (let day = 1; day <= last; day++) {
        const date = `${period}-${String(day).padStart(2, '0')}`;
        const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        if (holidaySet.has(date)) {
          days.push({ date, status: 'holiday' });
          continue;
        }
        const assignment = applies(employeeAssignments, date);
        const shift = shifts.find(s => s.id === assignment?.shift_id);
        if (!shift) {
          warnings.push(`Missing shift on ${date}.`);
          days.push({ date, status: 'missing_shift' });
          continue;
        }
        if (!shift.working_days.includes(weekday)) {
          days.push({ date, status: 'off' });
          continue;
        }
        const fridayOverride = weekday === 5 && shift.friday_start_time && shift.friday_end_time;
        const schedule = {
          start_time: fridayOverride ? shift.friday_start_time : shift.start_time,
          end_time: fridayOverride ? shift.friday_end_time : shift.end_time,
        };
        const log = logs.find(l => l.profile_id === profile.id && l.attendance_date === date);
        const correction = corrections
          .filter(c => c.profile_id === profile.id && c.attendance_date === date)
          .sort((a, b) => b.id - a.id)[0];
        if (correction) {
          days.push({
            date,
            status: correction.status === 'absent' ? 'absent' : 'present',
            late: ['late', 'late_early'].includes(correction.status),
            early: ['early', 'late_early'].includes(correction.status),
            correction,
            log_id: log?.id,
            source: log?.source_row,
            shift_id: shift.id,
            schedule,
          });
          continue;
        }
        const source = log?.source_row;
        if (!hasAnyPunch(source)) {
          days.push({
            date,
            status: 'absent',
            log_id: log?.id,
            source,
            shift_id: shift.id,
            schedule,
          });
          continue;
        }
        const ins = [],
          outs = [];
        let unpaired = false;
        for (let i = 1; i <= 5; i++) {
          const a = source[`Clock In ${i}`],
            b = source[`Clock Out ${i}`];
          const hasIn = hasPunch(a);
          const hasOut = hasPunch(b);
          if (hasIn !== hasOut) unpaired = true;
          if (hasIn) ins.push(minutes(a));
          if (hasOut) outs.push(minutes(b));
        }
        if (
          !ins.length ||
          !outs.length ||
          unpaired ||
          ins.includes(null) ||
          outs.includes(null) ||
          ins.length !== outs.length
        ) {
          warnings.push(`Missing or invalid punches on ${date}.`);
          days.push({
            date,
            status: 'missing_punch',
            log_id: log.id,
            source,
            shift_id: shift.id,
            schedule,
          });
          continue;
        }
        const expectedStart = time(schedule.start_time),
          expectedEnd = time(schedule.end_time);
        const overnight = expectedEnd < expectedStart;
        let arrival = ins[0],
          departure = outs[outs.length - 1];
        if (overnight && arrival < expectedStart - 720) arrival += 1440;
        if (overnight && departure < expectedStart) departure += 1440;
        const late = arrival > expectedStart + shift.grace_minutes;
        const early = departure < expectedEnd + (overnight ? 1440 : 0);
        if (!overnight && departure < arrival) {
          warnings.push(`Punch order needs review on ${date}.`);
          days.push({
            date,
            status: 'missing_punch',
            log_id: log.id,
            source,
            shift_id: shift.id,
            schedule,
          });
          continue;
        }
        days.push({
          date,
          status: 'present',
          late,
          early,
          log_id: log.id,
          source,
          shift_id: shift.id,
          schedule,
        });
      }
      const absences = days.filter(d => d.status === 'absent').length;
      const lates = days.filter(d => d.late).length;
      const early = days.filter(d => d.early).length;
      const calculated_days = absences + Math.floor(lates / 3) + Math.floor(early / 2);
      return {
        profile_id: profile.id,
        name: profile.name || profile.id,
        salary: salary ? Number(salary.monthly_salary) : 0,
        salary_rate: salary || null,
        absences,
        lates,
        early,
        calculated_days,
        waived_days: 0,
        advance_deductions: [],
        loan_deductions: [],
        warnings,
        days,
        scheduled_days: days.filter(d => ['present', 'absent', 'missing_punch'].includes(d.status))
          .length,
      };
    });
}
export function payrollTotals(row) {
  const deductible_days = Math.max(0, row.calculated_days - Number(row.waived_days || 0));
  const attendance_deduction = money((row.salary / 30) * deductible_days);
  const advance_deduction = money(
    (row.advance_deductions || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  );
  const loan_deduction = money(
    (row.loan_deductions || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  );
  return {
    deductible_days,
    attendance_deduction,
    advance_deduction,
    loan_deduction,
    net: money(row.salary - attendance_deduction - advance_deduction - loan_deduction),
  };
}
