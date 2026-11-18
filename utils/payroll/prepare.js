import { supabase } from '../supabaseClient';
import { calculatePayroll } from './calculate';

async function read(table, filter = query => query) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await filter(supabase.from(table).select('*'))
      .order('id')
      .range(offset, offset + 999);
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) return result;
  }
}

export async function prepareMonth(period, profiles) {
  const begin = period + '-01';
  const end = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5), 1))
    .toISOString()
    .slice(0, 10);
  const within = key => query => query.gte(key, begin).lt(key, end);
  const [shifts, assignments, salaries, holidays, logs, corrections] = await Promise.all([
    read('payroll_shifts'),
    read('payroll_shift_assignments'),
    read('payroll_salary_rates'),
    read('payroll_holidays', within('holiday_date')),
    read('payroll_attendance_logs', within('attendance_date')),
    read('payroll_attendance_corrections', within('attendance_date')),
  ]);
  return calculatePayroll({
    period,
    profiles,
    shifts,
    assignments,
    salaries,
    holidays,
    logs,
    corrections,
  });
}
