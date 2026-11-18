import { field, card, secondary, primary } from './payrollStyles';
import { refreshDraft } from '../../utils/payroll/workflow';
import { useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { reviewWarnings } from '../../utils/payroll/review';
import { prepareMonth } from '../../utils/payroll/prepare';
import { payrollUrl } from './PayrollModule';
import Link from 'next/link';

export default function EmployeeReview({ row, period, update, close }) {
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { attendance, setup } = reviewWarnings(row);
  async function recalculate(correction) {
    setBusy(true);
    setMessage('');
    try {
      if (correction) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const saved = await supabase.from('payroll_attendance_corrections').insert({
          ...correction,
          profile_id: row.profile_id,
          attendance_date: day,
          created_by: data.user.id,
        });
        if (saved.error) throw saved.error;
      }
      const [fresh] = await prepareMonth(period, [
        { id: row.profile_id, name: row.name, is_active: true },
      ]);
      update(refreshDraft(row, fresh));
      setDay('');
      setMessage('Recalculated. Review the figures before saving or pre-approving.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="employee-review" className={card + ' scroll-mt-24 space-y-4'}>
      <header className="flex justify-between">
        <h2 className="text-xl font-bold">{row.name}</h2>
        <button className={secondary} onClick={close}>
          Close review
        </button>
      </header>
      {message && <p role="status">{message}</p>}
      <p>
        {row.absences} absences · {row.lates} late arrivals · {row.early} early departures ·{' '}
        {row.calculated_days} deduction days
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="grid">
          Waived days
          <input
            className={field}
            type="number"
            min="0"
            max={row.calculated_days}
            value={row.waived_days}
            onChange={e =>
              update({ waived_days: e.target.value === '' ? 0 : Number(e.target.value) })
            }
          />
        </label>
        <label className="grid">
          Waiver reason
          <input
            className={field}
            value={row.waiver_reason || ''}
            onChange={e => update({ waiver_reason: e.target.value })}
          />
        </label>
      </div>
      {setup.length > 0 && (
        <div className="space-y-2">
          <p>{setup.join(' ')}</p>
          <label className="grid">
            Salary for this month
            <input
              className={field}
              type="number"
              min="0"
              step=".01"
              value={row.salary_override_amount ?? ''}
              onChange={e =>
                update({
                  salary_override_amount: e.target.value,
                  salary:
                    e.target.value === ''
                      ? Number(row.salary_rate?.monthly_salary || 0)
                      : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="grid">
            Salary decision reason
            <input
              className={field}
              value={row.salary_override_reason || ''}
              onChange={e => update({ salary_override_reason: e.target.value })}
            />
          </label>
        </div>
      )}
      {attendance.length > 0 && (
        <div className="space-y-2">
          <details>
            <summary>{attendance.length} attendance warnings</summary>
            {attendance.map(w => (
              <p key={w}>{w}</p>
            ))}
          </details>
          <label className="grid">
            Reason for accepting unresolved attendance
            <input
              className={field}
              value={row.issue_acknowledgement || ''}
              onChange={e => update({ issue_acknowledgement: e.target.value })}
            />
          </label>
          <p className="text-xs">
            Scheduled days with neither punch count as absent. Correct or review one-sided and
            invalid punches.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Link className="underline" href={payrollUrl('shifts', period)}>
          Manage shift assignments
        </Link>
        <button disabled={busy} onClick={() => recalculate()} className="underline">
          Recalculate from latest attendance and shifts
        </button>
      </div>
      <details>
        <summary>Daily attendance and corrections</summary>
        {row.days.map(d => (
          <div className="flex justify-between border-b py-1" key={d.date}>
            <span>
              {d.date} · {d.status.replaceAll('_', ' ')} {d.late && ' · late'}{' '}
              {d.early && ' · early'} {d.correction?.reason}
              {d.schedule && (
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Scheduled {d.schedule.start_time.slice(0, 5)}–{d.schedule.end_time.slice(0, 5)}
                </span>
              )}
            </span>
            {!['off', 'holiday', 'missing_shift'].includes(d.status) && (
              <button onClick={() => setDay(d.date)}>Correct</button>
            )}
          </div>
        ))}
      </details>
      {day && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={e => {
            e.preventDefault();
            const values = new FormData(e.currentTarget);
            const reason = values.get('reason').trim();
            if (reason) recalculate({ status: values.get('status'), reason });
          }}
        >
          <strong>{day}</strong>
          <select name="status" className={field}>
            {['present', 'absent', 'late', 'early', 'late_early'].map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input className={field} name="reason" placeholder="Correction reason" required />
          <button className={primary} disabled={busy}>
            Save correction
          </button>
        </form>
      )}
    </section>
  );
}
