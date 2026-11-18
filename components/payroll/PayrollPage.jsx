import Navbar from '../Navbar';
import styles from './PayrollAppearance.module.css';

export function PayrollHeading({ icon: Icon, title, description, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white md:text-3xl">
            {title}
          </h1>
        </div>
        {description && (
          <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

export default function PayrollPage({ children, printable = false }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100 print:min-h-0 print:bg-white print:text-slate-900">
      <div className="print:hidden">
        <Navbar />
      </div>
      <main
        className={`${styles.workspace} mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8 ${printable ? 'print:max-w-none print:p-0' : ''}`}
      >
        {children}
      </main>
    </div>
  );
}
