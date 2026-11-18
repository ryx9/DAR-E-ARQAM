import Link from 'next/link';
import Navbar from '../components/Navbar';
import { BookOpen, CalendarDays, ChevronRight, MessageSquare } from 'lucide-react';

const tools = [
  {
    href: '/ptm',
    title: 'Parent-teacher meetings',
    text: 'Schedule meetings, invite parents and record attendance.',
    icon: CalendarDays,
    tone: 'from-violet-600 to-indigo-600',
  },
  {
    href: '/messages',
    title: 'Messages',
    text: 'Review, organise and manage the parent message queue.',
    icon: MessageSquare,
    tone: 'from-sky-600 to-cyan-600',
  },
  {
    href: '/diary',
    title: 'Class diary',
    text: 'Prepare daily class work and parent-facing diary updates.',
    icon: BookOpen,
    tone: 'from-emerald-600 to-teal-600',
  },
];

export default function ParentCommunication() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-indigo-50/40 to-white text-slate-900 dark:from-slate-950 dark:via-indigo-950/10 dark:to-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-slate-900 p-7 text-white shadow-xl shadow-indigo-900/20 md:p-10">
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.22em] text-indigo-200">
              Family engagement
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Parent communication
            </h1>
            <p className="mt-3 text-sm leading-6 text-indigo-100 md:text-base">
              One calm place for meeting follow-up, messages and daily class updates.
            </p>
          </div>
          <MessageSquare className="pointer-events-none absolute -right-6 -bottom-8 h-48 w-48 text-white/10" />
        </header>
        <section className="mt-7 grid gap-4 md:grid-cols-3">
          {tools.map(({ href, title, text, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-950/10 dark:border-white/10 dark:bg-white/[.03]"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-lg`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-indigo-600 dark:text-indigo-300">
                Open workspace{' '}
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
