import { useState } from 'react';
import Head from 'next/head';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

const fmt = value =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const day = value =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
  });

export default function Datesheets() {
  const [das, setDas] = useState(''),
    [student, setStudent] = useState(null),
    [batches, setBatches] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  async function search() {
    if (!das.trim()) return setError('Enter your DAS number to view published datesheets.');
    setLoading(true);
    setError('');
    setStudent(null);
    setBatches([]);
    try {
      const { data: profile, error: studentError } = await supabase
        .from('active_students')
        .select('studentid,name,fathername,class_id,classes(name)')
        .eq('studentid', das.trim())
        .maybeSingle();
      if (studentError) throw studentError;
      if (!profile) throw new Error('No active student was found with this DAS number.');
      const { data: active, error: batchError } = await supabase
        .from('datesheet_batches')
        .select(
          'id,title,exam_start_date,exam_end_date,invoice_start_date,invoice_end_date,datesheet_batch_classes!inner(class_id),datesheet_batch_tests(tests(id,class_id,subject,test_name,date))'
        )
        .eq('is_active', true)
        .eq('datesheet_batch_classes.class_id', profile.class_id)
        .order('exam_start_date');
      if (batchError) throw batchError;
      setStudent(profile);
      setBatches(
        (active || []).map(batch => ({
          ...batch,
          tests: (batch.datesheet_batch_tests || [])
            .map(row => row.tests)
            .filter(test => test && String(test.class_id) === String(profile.class_id))
            .sort((a, b) => a.date.localeCompare(b.date)),
        }))
      );
    } catch (caught) {
      setError(caught.message || 'Unable to load datesheets.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Head>
        <title>Datesheets | DAR-E-ARQAM</title>
      </Head>
      <main className="min-h-screen overflow-hidden bg-[#f7f8ff] px-4 py-8 text-slate-900 sm:py-12">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(199,210,254,.72),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(204,251,241,.62),transparent_25%),linear-gradient(180deg,#fbfcff,#f4f6ff_55%,#eef2ff)]" />
        <div className="relative mx-auto max-w-5xl">
          <header className="mb-7 text-center sm:mb-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-indigo-600 text-white shadow-xl shadow-indigo-200">
              <CalendarDays className="h-8 w-8" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[.28em] text-indigo-600">
              DAR-E-ARQAM School
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Exam datesheets</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              Your child’s verified examination timetable, available as soon as the school publishes
              it.
            </p>
          </header>
          <section className="overflow-hidden rounded-[2rem] border border-indigo-100/80 bg-white/95 shadow-xl shadow-indigo-950/10 backdrop-blur">
            <div className="bg-gradient-to-r from-indigo-50 via-white to-teal-50 p-5 sm:p-7">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-indigo-700">
                <ShieldCheck className="h-4 w-4" /> Secure student lookup
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    value={das}
                    onChange={e => setDas(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()}
                    placeholder="Enter student DAS number"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium outline-none transition placeholder:font-normal focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
                <button
                  onClick={search}
                  disabled={loading}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:translate-y-0 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'View timetable'}
                </button>
              </div>
              {error && (
                <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </p>
              )}
            </div>
            {student && (
              <div className="p-5 sm:p-7">
                <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50 p-5 shadow-sm sm:p-6">
                  <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-indigo-200/60 blur-2xl" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-200">
                        {student.name?.slice(0, 1)?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[.18em] text-indigo-600">
                          Verified student
                        </p>
                        <h2 className="mt-1 text-xl font-semibold">{student.name}</h2>
                        <p className="mt-1 text-sm text-slate-600">
                          {student.classes?.name || 'Class'}{' '}
                          <span className="mx-1.5 text-slate-400">•</span> DAS {student.studentid}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active record
                    </span>
                  </div>
                </div>
                {batches.length ? (
                  <div className="mt-7 space-y-6">
                    {batches.map(batch => (
                      <article
                        key={batch.id}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-5 py-5 text-white sm:px-6">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-200">
                                Published examination
                              </p>
                              <h3 className="mt-1 text-xl font-semibold">{batch.title}</h3>
                            </div>
                            <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm">
                              <div className="flex items-center gap-1.5 font-semibold">
                                <CalendarRange className="h-4 w-4" /> {fmt(batch.exam_start_date)} –{' '}
                                {fmt(batch.exam_end_date)}
                              </div>
                              <p className="mt-0.5 text-xs text-indigo-100">
                                {batch.tests.length} paper{batch.tests.length === 1 ? '' : 's'}{' '}
                                scheduled
                              </p>
                            </div>
                          </div>
                        </div>
                        {batch.tests.length ? (
                          <ol className="divide-y divide-slate-100">
                            {batch.tests.map((test, index) => (
                              <li
                                key={test.id}
                                className="flex items-center gap-3 px-5 py-4 transition hover:bg-indigo-50/50 sm:gap-5 sm:px-6"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold text-slate-800">
                                    {test.test_name || test.subject}
                                  </p>
                                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                                    {test.subject}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-slate-800">
                                    {fmt(test.date)}
                                  </p>
                                  <p className="mt-0.5 text-xs font-medium text-indigo-600">
                                    {day(test.date)}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="p-7 text-center text-sm text-slate-500">
                            The timetable is being finalised. Please check again shortly.
                          </div>
                        )}
                        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500 sm:px-6">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Please arrive before
                          the reporting time with required stationery.
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                    <LockKeyhole className="mx-auto h-8 w-8 text-slate-400" />
                    <h3 className="mt-4 font-semibold text-slate-800">
                      No published datesheets yet
                    </h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                      The school has not activated an examination timetable for this class. It will
                      appear here as soon as it is published.
                    </p>
                  </div>
                )}
              </div>
            )}
            {!student && !loading && !error && (
              <div className="p-10 text-center text-slate-400">
                <FileText className="mx-auto h-9 w-9" />
                <p className="mt-3 text-sm">Enter a DAS number to view a published timetable.</p>
              </div>
            )}
          </section>
          <p className="mt-5 text-center text-xs text-slate-500">
            For examination queries, please contact the school office.
          </p>
        </div>
      </main>
    </>
  );
}
