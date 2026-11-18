import { field, card, primary as button, secondary } from './payrollStyles';
import { useEffect, useState } from 'react';
import { CalendarClock, Clock3, Plus, Search, UserRoundCheck } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const input = field + ' w-full';
const label = 'space-y-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400';
const blankShift = {
  name: '',
  working_days: [1, 2, 3, 4, 5, 6],
  start_time: '08:00',
  end_time: '14:00',
  friday_start_time: '',
  friday_end_time: '',
  grace_minutes: 0,
};

export default function ShiftManagement({ profiles }) {
  const [historySearch, setHistorySearch] = useState('');
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [shift, setShift] = useState(blankShift);
  const [editingShift, setEditingShift] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [assignment, setAssignment] = useState({
    profile_id: '',
    shift_id: '',
    effective_from: '',
  });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const [s, a] = await Promise.all([
      supabase.from('payroll_shifts').select('*').order('created_at', { ascending: false }),
      supabase
        .from('payroll_shift_assignments')
        .select('*')
        .order('effective_from', { ascending: false }),
    ]);
    if (s.error || a.error) {
      setStatus(
        `Could not load shifts: ${(s.error || a.error).message}. Apply the shift migration first.`
      );
      return;
    }
    setShifts(s.data || []);
    setAssignments(a.data || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function createShift(event) {
    event.preventDefault();
    setStatus('');
    if (
      !shift.name.trim() ||
      !shift.working_days.length ||
      shift.start_time === shift.end_time ||
      Number(shift.grace_minutes) < 0 ||
      Number(shift.grace_minutes) > 720
    ) {
      setStatus(
        'Enter a name, working days, different start and end times, and a grace period from 0 to 720 minutes.'
      );
      return;
    }
    const fridayStart = shift.friday_start_time;
    const fridayEnd = shift.friday_end_time;
    if ((fridayStart || fridayEnd) && (!fridayStart || !fridayEnd || fridayStart === fridayEnd)) {
      setStatus('Enter different Friday start and end times, or leave both blank.');
      return;
    }
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const values = {
      ...shift,
      name: shift.name.trim(),
      friday_start_time: fridayStart || null,
      friday_end_time: fridayEnd || null,
      grace_minutes: Number(shift.grace_minutes),
    };
    const table = supabase.from('payroll_shifts');
    const { error } = editingShift
      ? await table
          .update(values)
          .eq('id', editingShift.id)
          .eq('revision', editingShift.revision)
          .select('id')
          .single()
      : await table.insert({ ...values, created_by: user?.id });
    if (error)
      setStatus(
        `Could not save shift: ${error.code === 'PGRST116' ? 'This shift changed. Reload and edit the latest version.' : error.message}`
      );
    else {
      setEditingShift(null);
      setShift({ ...blankShift, working_days: [...blankShift.working_days] });
      setStatus(
        editingShift
          ? 'Shift updated. Recalculate any affected salary drafts.'
          : 'Shift saved. You can now assign it to employees.'
      );
      await load();
    }
    setBusy(false);
  }
  async function assignShift(event) {
    event.preventDefault();
    setStatus('');
    if (
      (!editingAssignment && !employees.length) ||
      !assignment.shift_id ||
      !assignment.effective_from
    ) {
      setStatus('Select employees, a shift and a start date.');
      return;
    }
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const values = {
      shift_id: Number(assignment.shift_id),
      effective_from: assignment.effective_from,
    };
    const table = supabase.from('payroll_shift_assignments');
    const { error } = editingAssignment
      ? await table
          .update(values)
          .eq('id', editingAssignment.id)
          .eq('revision', editingAssignment.revision)
          .select('id')
          .single()
      : await table.insert(
          employees.map(profile_id => ({ ...values, profile_id, created_by: user?.id }))
        );
    if (error)
      setStatus(
        error.code === '23505'
          ? 'An employee already has an assignment on that date. Use Edit in assignment history. No assignments were saved.'
          : error.code === 'PGRST116'
            ? 'The assignment changed. Reload and edit its latest version.'
            : error.message
      );
    else {
      setStatus(
        editingAssignment
          ? 'Assignment updated. Recalculate affected drafts in pre-approval.'
          : employees.length + ' employee assignment(s) saved.'
      );
      setEditingAssignment(null);
      setEmployees([]);
      setAssignment({ shift_id: '', effective_from: '' });
      await load();
    }
    setBusy(false);
  }
  const name = id => profiles.find(p => p.id === id)?.name || id;
  const shiftName = id => shifts.find(s => s.id === id)?.name || `Shift ${id}`;
  const visibleAssignments = assignments.filter(a =>
    `${name(a.profile_id)} ${shiftName(a.shift_id)}`
      .toLowerCase()
      .includes(historySearch.trim().toLowerCase())
  );
  return (
    <div className="space-y-5">
      {status && (
        <div
          role="status"
          className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
        >
          {status}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <form id="shift-form" onSubmit={createShift} className={`${card} space-y-5`}>
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950">
              <Clock3 size={20} />
            </span>
            <div>
              <h2 className="font-bold">{editingShift ? 'Edit shift' : 'Create a shift'}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Define the working week and expected hours.
              </p>
            </div>
          </div>
          <label className={`block ${label}`}>
            Shift name
            <input
              required
              className={input}
              placeholder="e.g. Morning shift"
              value={shift.name}
              onChange={e => setShift({ ...shift, name: e.target.value })}
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-slate-500">Working days</legend>
            <div className="flex flex-wrap gap-2">
              {days.map((day, i) => (
                <button
                  type="button"
                  key={day}
                  aria-pressed={shift.working_days.includes(i)}
                  onClick={() =>
                    setShift({
                      ...shift,
                      working_days: shift.working_days.includes(i)
                        ? shift.working_days.filter(d => d !== i)
                        : [...shift.working_days, i].sort(),
                    })
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${shift.working_days.includes(i) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}
                >
                  {day}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Start time
              <input
                required
                type="time"
                className={input}
                value={shift.start_time}
                onChange={e => setShift({ ...shift, start_time: e.target.value })}
              />
            </label>
            <label className={label}>
              End time
              <input
                required
                type="time"
                className={input}
                value={shift.end_time}
                onChange={e => setShift({ ...shift, end_time: e.target.value })}
              />
            </label>
          </div>
          <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <legend className="px-1 text-sm font-semibold">Friday hours</legend>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Leave both blank to use regular hours. These times apply when Friday is a working day.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Friday start
                <input
                  type="time"
                  required={!!shift.friday_end_time}
                  className={input}
                  value={shift.friday_start_time}
                  onChange={e => setShift({ ...shift, friday_start_time: e.target.value })}
                />
              </label>
              <label className={label}>
                Friday end
                <input
                  type="time"
                  required={!!shift.friday_start_time}
                  className={input}
                  value={shift.friday_end_time}
                  onChange={e => setShift({ ...shift, friday_end_time: e.target.value })}
                />
              </label>
            </div>
          </fieldset>
          <label className={`block ${label}`}>
            Late arrival grace (minutes)
            <input
              type="number"
              min="0"
              max="720"
              required
              className={input}
              value={shift.grace_minutes}
              onChange={e => setShift({ ...shift, grace_minutes: e.target.value })}
            />
          </label>
          <p className="text-xs text-slate-500">
            An end time earlier than the start time means the shift ends the next day.
          </p>
          <button disabled={busy} className={button}>
            <Plus size={16} /> {editingShift ? 'Update shift' : 'Save shift'}
          </button>
          {editingShift && (
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setEditingShift(null);
                setShift(blankShift);
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
        <form id="assignment-form" onSubmit={assignShift} className={`${card} space-y-5`}>
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950">
              <UserRoundCheck size={20} />
            </span>
            <div>
              <h2 className="font-bold">
                {editingAssignment ? 'Edit assignment' : 'Assign a shift'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose when the employee’s schedule starts.
              </p>
            </div>
          </div>
          {editingAssignment ? (
            <p>{name(editingAssignment.profile_id)}</p>
          ) : (
            <fieldset>
              <legend>Employees ({employees.length} selected)</legend>
              <label>
                <input
                  type="checkbox"
                  checked={
                    employees.length > 0 &&
                    employees.length === profiles.filter(p => p.is_active).length
                  }
                  onChange={e =>
                    setEmployees(
                      e.target.checked ? profiles.filter(p => p.is_active).map(p => p.id) : []
                    )
                  }
                />{' '}
                Select all active employees
              </label>
              <div className="mt-2 max-h-40 overflow-auto">
                {profiles
                  .filter(p => p.is_active)
                  .map(p => (
                    <label className="block" key={p.id}>
                      <input
                        type="checkbox"
                        checked={employees.includes(p.id)}
                        onChange={e =>
                          setEmployees(
                            e.target.checked
                              ? [...employees, p.id]
                              : employees.filter(id => id !== p.id)
                          )
                        }
                      />{' '}
                      {p.name || p.id}
                    </label>
                  ))}
              </div>
            </fieldset>
          )}
          <label className={`block ${label}`}>
            Shift
            <select
              required
              className={input}
              value={assignment.shift_id}
              onChange={e => setAssignment({ ...assignment, shift_id: e.target.value })}
            >
              <option value="">Select a shift</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                </option>
              ))}
            </select>
          </label>
          <label className={`block ${label}`}>
            Effective from
            <input
              required
              type="date"
              className={input}
              value={assignment.effective_from}
              onChange={e => setAssignment({ ...assignment, effective_from: e.target.value })}
            />
          </label>
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-800">
            An assignment applies until the next effective date for that employee. To change hours,
            create a new shift and assign it from the date the change starts.
          </p>
          <button disabled={busy || !shifts.length} className={button}>
            <CalendarClock size={16} /> {editingAssignment ? 'Update assignment' : 'Assign shift'}
          </button>
          {editingAssignment && (
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setEditingAssignment(null);
                setAssignment({ shift_id: '', effective_from: '' });
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
      </div>
      <div className={card}>
        <h2 className="font-bold">Saved shifts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Edit a shift to correct its definition for all assigned employees. For a new schedule
          starting later, create a shift and assign an effective date.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shifts.map(s => (
            <div
              key={s.id}
              className="rounded-xl border border-slate-100 p-4 dark:border-slate-800"
            >
              <div className="font-semibold">{s.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                {s.end_time < s.start_time ? ' (+1 day)' : ''} · {s.grace_minutes} min grace
              </div>
              <div className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {s.working_days.map(d => days[d]).join(' · ')}
              </div>
              {s.working_days.includes(5) && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {s.friday_start_time && s.friday_end_time
                    ? `Friday ${s.friday_start_time.slice(0, 5)}–${s.friday_end_time.slice(0, 5)}${s.friday_end_time < s.friday_start_time ? ' (+1 day)' : ''}`
                    : 'Friday uses regular hours'}
                </p>
              )}
              <button
                type="button"
                className="mt-2 text-indigo-600 underline"
                onClick={() => {
                  setEditingShift(s);
                  setShift({
                    name: s.name,
                    working_days: s.working_days,
                    start_time: s.start_time.slice(0, 5),
                    end_time: s.end_time.slice(0, 5),
                    friday_start_time: s.friday_start_time?.slice(0, 5) || '',
                    friday_end_time: s.friday_end_time?.slice(0, 5) || '',
                    grace_minutes: s.grace_minutes,
                  });
                  document.getElementById('shift-form')?.scrollIntoView();
                }}
              >
                Edit shift
              </button>
            </div>
          ))}
          {!shifts.length && <p className="text-sm text-slate-500">No shifts created yet.</p>}
        </div>
      </div>
      <div className={card}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">Assignment history</h2>
          <label className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              aria-label="Find assignments"
              className={input + ' pl-9'}
              placeholder="Employee or shift"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
            />
          </label>
        </header>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-3">Employee</th>
                <th className="pb-3">Shift</th>
                <th className="pb-3">Effective from</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssignments.map(a => (
                <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-3">{name(a.profile_id)}</td>
                  <td>{shiftName(a.shift_id)}</td>
                  <td>{a.effective_from}</td>
                  <td>
                    <button
                      type="button"
                      className="text-indigo-600 underline"
                      onClick={() => {
                        setEditingAssignment(a);
                        setAssignment({
                          shift_id: String(a.shift_id),
                          effective_from: a.effective_from,
                        });
                        document.getElementById('assignment-form')?.scrollIntoView();
                      }}
                    >
                      Edit assignment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleAssignments.length && (
            <p className="text-sm text-slate-500">
              {assignments.length ? 'No assignments match your search.' : 'No shifts assigned yet.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
