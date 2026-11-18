import { field, card } from './payrollStyles';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

export default function AttendanceSummary({ rows, period }) {
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [group, setGroup] = useState('');
  const [employee, setEmployee] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      supabase.from('classes').select('id,name'),
      supabase.from('teacher_class').select('teacher_profile,class'),
    ]).then(([c, a]) => {
      if (c.error || a.error) setError((c.error || a.error).message);
      else {
        setClasses(c.data);
        setAssignments(a.data);
      }
    });
  }, []);
  const filtered = rows.filter(
    r =>
      (!employee || employee === r.profile_id) &&
      (!group ||
        assignments.some(a => String(a.class) === group && a.teacher_profile === r.profile_id))
  );
  return (
    <details className={card}>
      <summary className="cursor-pointer font-bold">Attendance analysis · {period}</summary>
      <p className="my-3 text-sm">
        Counts cover the calendar month. Saturday and Monday counts include confirmed absences on
        scheduled days. Holidays, days off and unknown attendance are excluded.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          className={field}
          aria-label="Class filter"
          value={group}
          onChange={e => setGroup(e.target.value)}
        >
          <option value="">All classes</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={field}
          aria-label="Employee filter"
          value={employee}
          onChange={e => setEmployee(e.target.value)}
        >
          <option value="">All employees in review</option>
          {rows.map(r => (
            <option key={r.profile_id} value={r.profile_id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p>{error}</p>}
      <div className="mt-4 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Employee', 'Late', 'Absent', 'Saturday', 'Monday', 'Daily attendance'].map(
                label => (
                  <th key={label}>{label}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const count = weekday =>
                r.days.filter(
                  d =>
                    d.status === 'absent' && new Date(d.date + 'T00:00:00Z').getUTCDay() === weekday
                ).length;
              return (
                <tr key={r.profile_id}>
                  <td>{r.name}</td>
                  <td>{r.lates}</td>
                  <td>{r.absences}</td>
                  <td>{count(6)}</td>
                  <td>{count(1)}</td>
                  <td className="whitespace-nowrap">
                    {r.days.map(d => (
                      <span
                        key={d.date}
                        title={d.date + ' ' + d.status + (d.late ? ' late' : '')}
                        className={
                          'inline-block h-3 w-2 border-r border-white ' +
                          (d.status === 'absent'
                            ? 'bg-red-600'
                            : d.late
                              ? 'bg-amber-500'
                              : d.status === 'present'
                                ? 'bg-green-600'
                                : 'bg-slate-300')
                        }
                      />
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <small>Red absent · Amber late · Green present · Grey other</small>
    </details>
  );
}
