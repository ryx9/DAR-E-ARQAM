import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  CalendarCheck,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  House,
  ListChecks,
  Settings2,
  Wallet,
} from 'lucide-react';
import PayrollPage, { PayrollHeading } from './PayrollPage';
import { field, panel, secondary } from './payrollStyles';
import { supabase } from '../../utils/supabaseClient';

export const sections = [
  ['', 'Overview', House, 'Payroll'],
  ['attendance', 'Attendance import', FileSpreadsheet, 'Payroll'],
  ['drafts', 'Prepare drafts', ListChecks, 'Payroll'],
  ['approval', 'Pre-approval', ClipboardCheck, 'Payroll'],
  ['finalise', 'Finalise salaries', CalendarCheck, 'Payroll'],
  ['payments', 'Payments & reports', Wallet, 'Payroll'],
  ['shifts', 'Shifts & assignments', Clock3, 'Setup'],
  ['settings', 'Salaries & holidays', Settings2, 'Setup'],
  ['advances', 'Advance & loan requests', Banknote, 'Setup'],
];
export function payrollUrl(section, month) {
  return { pathname: '/admin/payroll' + (section ? '/' + section : ''), query: { month } };
}
export default function PayrollModule({ section, children, needsProfiles = false }) {
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(router.query.month)
    ? router.query.month
    : new Date().toLocaleDateString('sv-SE').slice(0, 7);
  useEffect(() => setRole(localStorage.getItem('UserRole') || ''), []);
  useEffect(() => {
    if (role !== 'superadmin' || !needsProfiles) return;
    let active = true;
    supabase
      .from('profiles')
      .select('id,name,is_active')
      .order('name')
      .then(({ data, error }) => {
        if (active) {
          setError(error?.message || '');
          setProfiles(error ? null : data);
        }
      });
    return () => {
      active = false;
    };
  }, [role, needsProfiles, retry]);
  if (role === null || !router.isReady) return <p className="p-6">Loading payroll…</p>;
  if (role !== 'superadmin') return <p className="p-6">Superadmin access required.</p>;
  const active = sections.find(([id]) => id === (section || '')) || sections[0];
  const title = section ? active[1] : 'Payroll';
  return (
    <PayrollPage>
      <PayrollHeading
        icon={active[2]}
        title={title}
        description={
          !section ? 'Manage attendance, monthly salaries and staff repayments.' : undefined
        }
        actions={
          section !== 'advances' && (
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <CalendarDays size={16} aria-hidden="true" />
              Payroll month
              <input
                type="month"
                value={month}
                className={field}
                onChange={e => e.target.value && router.push(payrollUrl(section, e.target.value))}
              />
            </label>
          )
        }
      />
      <nav aria-label="Payroll sections" className={panel + ' p-3'}>
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold lg:hidden">
          Payroll section
          <select
            value={section || ''}
            className={field + ' max-w-full'}
            onChange={e => router.push(payrollUrl(e.target.value, month))}
          >
            {['Payroll', 'Setup'].map(group => (
              <optgroup key={group} label={group}>
                {sections
                  .filter(item => item[3] === group)
                  .map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="hidden divide-y divide-slate-100 dark:divide-slate-800 lg:block">
          {['Payroll', 'Setup'].map(group => (
            <div key={group} className="flex items-center gap-3 py-1.5">
              <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {group}
              </span>
              <ul className="flex flex-wrap gap-1">
                {sections
                  .filter(item => item[3] === group)
                  .map(([id, label, Icon]) => {
                    const current = (section || '') === id;
                    return (
                      <li key={id}>
                        <Link
                          href={payrollUrl(id, month)}
                          aria-current={current ? 'page' : undefined}
                          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-indigo-500 ${current ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                        >
                          <Icon size={16} aria-hidden="true" />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button className={secondary} onClick={() => setRetry(n => n + 1)}>
            Retry
          </button>
        </p>
      ) : needsProfiles && !profiles ? (
        <p>Loading employees…</p>
      ) : (
        <div key={month}>{children({ period: month, profiles: profiles || [] })}</div>
      )}
    </PayrollPage>
  );
}
