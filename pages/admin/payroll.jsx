import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  ListChecks,
  Wallet,
} from 'lucide-react';
import { panel, primary, secondary } from '../../components/payroll/payrollStyles';
import PayrollModule, { payrollUrl } from '../../components/payroll/PayrollModule';
import { supabase } from '../../utils/supabaseClient';

const stages = [
  ['attendance', 'Attendance', 'Import and match biometric attendance.', FileSpreadsheet],
  ['drafts', 'Prepare drafts', 'Calculate salaries and check deductions.', ListChecks],
  ['approval', 'Pre-approval', 'Review and approve saved salary drafts.', ClipboardCheck],
  ['finalise', 'Finalise salaries', 'Finalize approved salaries for payment.', CalendarDays],
  ['payments', 'Payments & reports', 'Record payments and download reports.', Wallet],
];
const stageLabels = [
  ['draft', 'approval', 'Review drafts'],
  ['approved', 'finalise', 'Finalise salaries'],
  ['payments', 'payments', 'Payments & reports'],
];
const monthLabel = month =>
  new Intl.DateTimeFormat('en-PK', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(month + '-01T00:00:00Z')
  );

function Months({ period }) {
  const [months, setMonths] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('payroll_current_reviews').select('period,stage'),
      supabase
        .from('payroll_runs')
        .select('period,visible_to_employees,employee_access_opened_at,employee_access_closed_at'),
    ]).then(([reviews, runs]) => {
      if (!active) return;
      if (reviews.error || runs.error) {
        setError((reviews.error || runs.error).message);
        return;
      }
      const periods = new Map();
      for (const row of [...reviews.data, ...runs.data.map(r => ({ ...r, stage: 'payments' }))]) {
        const month = row.period.slice(0, 7);
        const state = periods.get(month) || { stages: new Set(), access: null };
        state.stages.add(row.stage);
        if (row.stage === 'payments') state.access = Boolean(row.visible_to_employees);
        periods.set(month, state);
      }
      setMonths(periods);
    });
    return () => {
      active = false;
    };
  }, []);
  const current = months?.get(period);
  const next = stageLabels.find(([stage]) => current?.stages.has(stage));
  const previous = months
    ? [...months]
        .filter(
          ([month, state]) =>
            month !== period && stageLabels.some(([stage]) => state.stages.has(stage))
        )
        .sort(([a], [b]) => b.localeCompare(a))
    : [];
  return (
    <div className="space-y-5">
      <section className={panel + ' overflow-hidden'}>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-950 dark:bg-indigo-950/40 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Selected month
            </p>
            <h2 className="mt-1 text-xl font-bold">{monthLabel(period)}</h2>
            {current?.stages.has('payments') && (
              <p
                className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${current.access ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                Staff portal: {current.access ? 'Open' : 'Closed'}
              </p>
            )}
          </div>
          <Link className={primary} href={payrollUrl(next?.[1] || 'attendance', period)}>
            {next?.[2] || 'Import attendance'}
            <ArrowRight size={16} />
          </Link>
        </header>
        <ul className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-5">
          {stages.map(([route, title, description, Icon]) => (
            <li key={route} className="bg-white dark:bg-slate-900">
              <Link
                href={payrollUrl(route, period)}
                className="flex h-full gap-3 p-4 transition hover:bg-slate-50 focus-visible:outline-indigo-500 dark:hover:bg-slate-800/70 xl:flex-col"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                  <Icon size={18} />
                </span>
                <span>
                  <strong className="block text-sm">{title}</strong>
                  <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                    {description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {error && <p role="alert">{error}</p>}
      <section className={panel + ' overflow-hidden'}>
        <h2 className="border-b border-slate-200 px-4 py-3 font-bold dark:border-slate-800 sm:px-5">
          Other months
        </h2>
        {!months && !error ? (
          <p className="p-4 text-sm text-slate-500">Loading payroll records…</p>
        ) : previous.length ? (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {previous.map(([month, state]) => (
              <li
                key={month}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <strong>{monthLabel(month)}</strong>
                <div className="flex flex-wrap gap-2">
                  {stageLabels
                    .filter(([stage]) => state.stages.has(stage))
                    .map(([stage, id, label]) => (
                      <Link key={stage} className={secondary} href={payrollUrl(id, month)}>
                        {label}
                      </Link>
                    ))}
                  {state.stages.has('payments') && (
                    <span
                      className={`inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold ${state.access ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                    >
                      Staff: {state.access ? 'Open' : 'Closed'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          months && (
            <p className="p-4 text-sm text-slate-500">
              Saved payroll from other months will appear here.
            </p>
          )
        )}
      </section>
    </div>
  );
}

export default function PayrollHome() {
  return <PayrollModule>{props => <Months {...props} />}</PayrollModule>;
}
