import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import Navbar from '../Navbar';

export const panel =
  'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';
export const control =
  'min-h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-indigo-900/30';
const button =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
export const primary = button + ' bg-blue-600 text-white hover:bg-blue-700';
export const secondary =
  button +
  ' border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
export const muted = 'text-sm text-slate-500 dark:text-slate-400';

export function Notice({ children, error = false }) {
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={
        'rounded-xl border p-3 text-sm ' +
        (error
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          : 'border-indigo-100 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100')
      }
    >
      {children}
    </p>
  );
}

export function Empty({ children }) {
  return <p className={muted + ' px-4 py-10 text-center'}>{children}</p>;
}

export default function PTMLayout({ title, description, back, action, children }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl space-y-5 p-4 pb-12 md:p-8">
        {back && (
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            href={back}
          >
            <ArrowLeft size={16} />
            All meetings
          </Link>
        )}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-start gap-3 text-2xl font-bold tracking-tight md:text-3xl">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
                <CalendarDays size={19} />
              </span>
              {title}
            </h1>
            {description && <p className={muted + ' mt-2'}>{description}</p>}
          </div>
          {action}
        </header>
        {children}
      </main>
    </div>
  );
}
