import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowRight, MapPin, Plus, Search } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { loadPTMClasses, matchesSearch, meetingDate, staffRoles } from '../../utils/ptm';
import PTMLayout, {
  control,
  Empty,
  muted,
  Notice,
  panel,
  primary,
  secondary,
} from '../../components/ptm/PTMLayout';

export default function PTMList() {
  const router = useRouter();
  const [setup, setSetup] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('all');
  const selected =
    setup?.classes.find(c => String(c.id) === router.query.class) || setup?.classes[0];
  const classId = selected?.id;
  useEffect(() => {
    let active = true;
    loadPTMClasses()
      .then(data => {
        if (active) setSetup(data);
      })
      .catch(e => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    if (!router.isReady || classId == null) return;
    let active = true;
    setResult(null);
    async function load() {
      const [direct, participants] = await Promise.all([
        supabase
          .from('ptm_meetings')
          .select('*')
          .eq('class_id', classId)
          .order('starts_at', { ascending: false }),
        supabase
          .from('ptm_participants')
          .select('meeting_id, students!inner(class_id)')
          .eq('students.class_id', classId),
      ]);
      if (direct.error || participants.error) throw direct.error || participants.error;
      const directIds = new Set(direct.data.map(m => m.id));
      const ids = [...new Set(participants.data.map(p => p.meeting_id))].filter(
        id => !directIds.has(id)
      );
      const older = ids.length
        ? await supabase.from('ptm_meetings').select('*').in('id', ids).is('class_id', null)
        : { data: [] };
      if (older.error) throw older.error;
      return [...direct.data, ...older.data];
    }
    load()
      .then(rows => {
        if (active) setResult({ classId, rows });
      })
      .catch(e => {
        if (active) setResult({ classId, error: e.message, rows: [] });
      });
    return () => {
      active = false;
    };
  }, [router.isReady, classId, retry]);
  const now = Date.now();
  const meetings = result?.classId === classId ? result?.rows || [] : [];
  const filtered = meetings
    .filter(
      m =>
        matchesSearch(search, m.title, m.location, m.agenda) &&
        (range === 'all' ||
          (Date.parse(m.starts_at) >= now ? range === 'upcoming' : range === 'past'))
    )
    .sort((a, b) => {
      const aTime = Date.parse(a.starts_at),
        bTime = Date.parse(b.starts_at);
      const aFuture = aTime >= now,
        bFuture = bTime >= now;
      return aFuture !== bFuture
        ? Number(bFuture) - Number(aFuture)
        : aFuture
          ? aTime - bTime
          : bTime - aTime;
    });
  const allowed = staffRoles.includes(setup?.access.role);
  const createHref = { pathname: '/ptm/new', query: classId == null ? {} : { class: classId } };
  return (
    <PTMLayout
      title="Parent-teacher meetings"
      description="Find class meetings, track attendance and review parent messages."
      action={
        allowed &&
        selected && (
          <Link className={primary} href={createHref}>
            <Plus size={17} />
            Schedule meeting
          </Link>
        )
      }
    >
      {error ? (
        <Notice error>
          {error}{' '}
          <button
            className="underline"
            onClick={() => {
              setError('');
              setRetry(n => n + 1);
            }}
          >
            Retry
          </button>
        </Notice>
      ) : !setup || !router.isReady ? (
        <Empty>Loading classes…</Empty>
      ) : !allowed ? (
        <Notice error>Only school staff can manage meetings.</Notice>
      ) : !selected ? (
        <section className={panel}>
          <Empty>No classes are assigned to you.</Empty>
        </section>
      ) : (
        <section className={panel}>
          <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-[1fr_2fr_1fr]">
            <label className="grid gap-1.5 text-sm font-semibold">
              Class
              <select
                className={control}
                value={classId}
                onChange={e => {
                  setSearch('');
                  router.replace(
                    { pathname: '/ptm', query: { class: e.target.value } },
                    undefined,
                    { shallow: true }
                  );
                }}
              >
                {setup.classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              Search meetings
              <span className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                <input
                  className={control + ' pl-9'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Title, agenda or location"
                />
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              When
              <select className={control} value={range} onChange={e => setRange(e.target.value)}>
                <option value="all">All meetings</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </label>
          </div>
          {result?.classId !== classId ? (
            <Empty>Loading meetings…</Empty>
          ) : result.error ? (
            <div className="p-4">
              <Notice error>
                {result.error}{' '}
                <button className="underline" onClick={() => setRetry(n => n + 1)}>
                  Retry
                </button>
              </Notice>
            </div>
          ) : !meetings.length ? (
            <div className="flex flex-col items-center pb-6">
              <Empty>No meetings have been scheduled for {selected.name}.</Empty>
              <Link href={createHref} className={secondary}>
                Schedule a meeting
              </Link>
            </div>
          ) : !filtered.length ? (
            <Empty>No meetings match your filters.</Empty>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map(m => (
                <li key={m.id}>
                  <Link
                    href={`/ptm/${m.id}`}
                    className="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-50 focus-visible:outline-indigo-500 dark:hover:bg-slate-800/60 md:p-5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">{m.title}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${Date.parse(m.starts_at) >= now ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                        >
                          {Date.parse(m.starts_at) >= now ? 'Upcoming' : 'Past'}
                        </span>
                        {m.class_id == null && <span className={muted}>Multi-class</span>}
                      </div>
                      <p className={muted + ' flex flex-wrap gap-x-3 gap-y-1'}>
                        <span>{meetingDate(m.starts_at)}</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={14} />
                          {m.location}
                        </span>
                      </p>
                      <p className={muted + ' line-clamp-2'}>{m.agenda}</p>
                    </div>
                    <ArrowRight size={18} className="shrink-0 text-indigo-500" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </PTMLayout>
  );
}
