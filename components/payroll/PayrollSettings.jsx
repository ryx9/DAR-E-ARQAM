import { CalendarDays, Search, Wallet } from 'lucide-react';
import { field as control, card, primary as button } from './payrollStyles';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

const field = control + ' w-full';
const label = 'block space-y-2 text-xs font-semibold text-slate-500';
export default function PayrollSettings({ profiles }) {
  const [search, setSearch] = useState('');
  const [salaries, setSalaries] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [salary, setSalary] = useState({ profile_id: '', monthly_salary: '', effective_from: '' });
  const [holiday, setHoliday] = useState({ holiday_date: '', description: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const [s, h] = await Promise.all([
      supabase
        .from('payroll_salary_rates')
        .select('*')
        .order('effective_from', { ascending: false }),
      supabase.from('payroll_holidays').select('*').order('holiday_date', { ascending: false }),
    ]);
    if (s.error || h.error) {
      setStatus(
        `Could not load payroll settings: ${(s.error || h.error).message}. Apply the payroll settings migrations first.`
      );
      return;
    }
    setSalaries(s.data || []);
    setHolidays(h.data || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function save(event, kind) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const values =
      kind === 'salary'
        ? { ...salary, monthly_salary: Number(salary.monthly_salary) }
        : { ...holiday, description: holiday.description.trim() };
    const { error } = await supabase
      .from(kind === 'salary' ? 'payroll_salary_rates' : 'payroll_holidays')
      .insert({ ...values, created_by: user?.id });
    if (error)
      setStatus(error.code === '23505' ? 'A record already exists for that date.' : error.message);
    else {
      setStatus(kind === 'salary' ? 'Salary saved with its effective date.' : 'Holiday added.');
      if (kind === 'salary') setSalary({ profile_id: '', monthly_salary: '', effective_from: '' });
      else setHoliday({ holiday_date: '', description: '' });
      await load();
    }
    setBusy(false);
  }
  async function removeHoliday(id) {
    setBusy(true);
    setStatus('');
    const { error } = await supabase.from('payroll_holidays').delete().eq('id', id);
    if (error) setStatus(error.message);
    else {
      setStatus('Holiday removed.');
      await load();
    }
    setBusy(false);
  }
  const employeeName = id => profiles.find(p => p.id === id)?.name || id;
  const visibleSalaries = salaries.filter(rate =>
    employeeName(rate.profile_id).toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <div className="space-y-5">
      {status && (
        <p
          role="status"
          className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
        >
          {status}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <form className={`${card} space-y-4`} onSubmit={e => save(e, 'salary')}>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Wallet size={18} className="text-indigo-600 dark:text-indigo-400" />
            Employee salary
          </h2>
          <p className="text-sm text-slate-500">
            Add a new effective date when a salary changes. Earlier amounts remain in the history.
          </p>
          <label className={label}>
            Employee
            <select
              required
              className={field}
              value={salary.profile_id}
              onChange={e => setSalary({ ...salary, profile_id: e.target.value })}
            >
              <option value="">Select employee</option>
              {profiles
                .filter(p => p.is_active === true)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))}
            </select>
          </label>
          <label className={label}>
            Monthly salary
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className={field}
              value={salary.monthly_salary}
              onChange={e => setSalary({ ...salary, monthly_salary: e.target.value })}
            />
          </label>
          <label className={label}>
            Effective from
            <input
              required
              type="date"
              className={field}
              value={salary.effective_from}
              onChange={e => setSalary({ ...salary, effective_from: e.target.value })}
            />
          </label>
          <button className={button} disabled={busy}>
            Save salary
          </button>
        </form>
        <form className={`${card} space-y-4`} onSubmit={e => save(e, 'holiday')}>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarDays size={18} className="text-indigo-600 dark:text-indigo-400" />
            School holiday
          </h2>
          <p className="text-sm text-slate-500">
            Holidays are excluded from scheduled attendance days.
          </p>
          <label className={label}>
            Date
            <input
              required
              type="date"
              className={field}
              value={holiday.holiday_date}
              onChange={e => setHoliday({ ...holiday, holiday_date: e.target.value })}
            />
          </label>
          <label className={label}>
            Holiday name
            <input
              required
              className={field}
              value={holiday.description}
              onChange={e => setHoliday({ ...holiday, description: e.target.value })}
            />
          </label>
          <label className={label}>
            Applies to employees (empty means everyone)
            <select
              multiple
              className={field}
              value={holiday.employee_ids || []}
              onChange={e =>
                setHoliday({
                  ...holiday,
                  employee_ids: Array.from(e.target.selectedOptions, o => o.value),
                })
              }
            >
              {profiles
                .filter(p => p.is_active)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <button className={button} disabled={busy}>
            Add holiday
          </button>
        </form>
      </div>
      <section className={card}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">Salary history</h2>
          <label className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              aria-label="Find salary records by employee"
              className={field + ' pl-9'}
              placeholder="Find employee"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
        </header>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th>Employee</th>
                <th>Effective from</th>
                <th>Monthly salary</th>
              </tr>
            </thead>
            <tbody>
              {visibleSalaries.map(s => (
                <tr key={s.id} className="border-t dark:border-slate-800">
                  <td className="py-3">{employeeName(s.profile_id)}</td>
                  <td>{s.effective_from}</td>
                  <td>
                    {Number(s.monthly_salary).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleSalaries.length && (
            <p className="py-3 text-sm text-slate-500">
              {salaries.length ? 'No salary records match your search.' : 'No salaries configured.'}
            </p>
          )}
        </div>
      </section>
      <section className={card}>
        <h2 className="font-bold">Holidays</h2>
        <div className="mt-4 space-y-2">
          {holidays.map(h => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-3 border-t py-3 text-sm dark:border-slate-800"
            >
              <span>
                {h.holiday_date} · {h.description} ·{' '}
                {h.employee_ids?.length
                  ? h.employee_ids.map(id => profiles.find(p => p.id === id)?.name || id).join(', ')
                  : 'Everyone'}
              </span>
              <button
                type="button"
                disabled={busy}
                className="text-red-600 disabled:opacity-50"
                onClick={() => removeHoliday(h.id)}
              >
                Remove
              </button>
            </div>
          ))}
          {!holidays.length && <p className="text-sm text-slate-500">No holidays configured.</p>}
        </div>
      </section>
    </div>
  );
}
