import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import DailyRoundEditor from '../components/DailyRoundEditor';
import { getClassAccess } from '../utils/classAccess';
import { supabase } from '../utils/supabaseClient';
import { timetableRows } from '../utils/timetable.mjs';
import { formatScore, roundGroups, roundRatings, summarizeRounds } from '../utils/dailyRounds';
import { downloadRound, downloadRoundPeriod } from '../utils/dailyRoundsPDF';

const panel = 'rounded-xl border bg-card p-4 sm:p-5';
const field = 'rounded-lg border bg-background px-3 py-2 text-sm';
const primary =
  'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const secondary = field + ' disabled:opacity-50';
const dateInKarachi = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const ratingLabels = Object.fromEntries(roundRatings);

function ActionList({ title, items }) {
  return (
    <div className="rounded-lg border border-l-4 border-l-blue-500 p-3">
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ol className="mt-2 list-decimal space-y-1 whitespace-pre-wrap pl-5 text-sm">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">None recorded.</p>
      )}
    </div>
  );
}

function VisitDetail({ visit, canEdit, onEdit, onBack, onPDF, busy }) {
  return (
    <div className="space-y-4">
      <section className={panel}>
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <button onClick={onBack} className="mb-2 text-sm text-blue-600 dark:text-blue-300">
              ← Back to visits
            </button>
            <h2 className="text-xl font-bold">
              {visit.class_name} · {visit.visit_date}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {visit.lecture} · {visit.subject} · {visit.teacher_name}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {canEdit && (
              <button className={secondary} onClick={onEdit}>
                Edit visit
              </button>
            )}
            <button className={primary} disabled={busy} onClick={onPDF}>
              Download visit PDF
            </button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Overall', formatScore(visit.score, '/5')],
            ['Avg. attendance', formatScore(visit.attendance_average, '%')],
            ['Diaries marked sent · 5 days', visit.diary_count],
          ].map(([label, value]) => (
            <div className="rounded-lg bg-muted p-2 sm:p-3" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={panel + ' grid gap-3 md:grid-cols-2'}>
        <ActionList title="New actionables" items={visit.actionables} />
        <ActionList
          title={
            visit.prior_round_date
              ? `Previous actionables · ${visit.prior_round_date}`
              : 'Previous actionables'
          }
          items={visit.prior_actionables}
        />
        {visit.follow_up && (
          <div>
            <h3 className="font-semibold">Follow-up notes</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm">{visit.follow_up}</p>
          </div>
        )}
        {visit.notes && (
          <div>
            <h3 className="font-semibold">Observations</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm">{visit.notes}</p>
          </div>
        )}
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {roundGroups.map(group => (
          <div key={group.title} className={panel}>
            <h3 className="mb-2 font-semibold">{group.title}</h3>
            <dl className="divide-y">
              {group.items.map(([id, label]) => (
                <div className="flex justify-between gap-3 py-2 text-sm" key={id}>
                  <dt>{label}</dt>
                  <dd className="shrink-0 text-muted-foreground">
                    {ratingLabels[visit.ratings[id]]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function DailyRounds() {
  const today = dateInKarachi();
  const [access, setAccess] = useState(null);
  const [catalogue, setCatalogue] = useState({ classes: [], staff: [], subjects: [], lessons: [] });
  const [filters, setFilters] = useState({
    start: today.slice(0, 7) + '-01',
    end: today,
    classId: '',
    teacherId: '',
  });
  const [visits, setVisits] = useState([]);
  const [panelMode, setPanelMode] = useState('history');
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [limit, setLimit] = useState(20);
  const canEdit = ['admin', 'superadmin'].includes(access?.role);
  const allowed = canEdit || access?.role === 'teacher';
  const updateFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }));
    setLimit(20);
  };

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const roleAccess = await getClassAccess();
        if (!['admin', 'superadmin', 'teacher'].includes(roleAccess.role)) return;
        const editor = roleAccess.role !== 'teacher';
        let classesQuery = supabase.from('classes').select('id,name').order('id');
        if (!editor && roleAccess.classIds.length)
          classesQuery = classesQuery.in('id', roleAccess.classIds);
        const queries = [editor || roleAccess.classIds.length ? classesQuery : { data: [] }];
        if (editor)
          queries.push(
            supabase
              .from('profiles')
              .select('id,name,role,is_active')
              .in('role', ['teacher', 'admin', 'superadmin'])
              .order('name'),
            supabase.from('subjects').select('id,name').order('name'),
            supabase.from('school_timetable').select('published').eq('id', 1).maybeSingle()
          );
        const results = await Promise.all(queries);
        for (const result of results) if (result.error) throw result.error;
        if (!current) return;
        setCatalogue({
          classes: results[0].data || [],
          staff: (results[1]?.data || []).filter(person => person.is_active !== false),
          subjects: results[2]?.data || [],
          lessons: timetableRows(results[3]?.data?.published),
        });
        setAccess(roleAccess);
      } catch (issue) {
        if (current) setError(issue.message);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    if (!filters.start || !filters.end || filters.start > filters.end) {
      setVisits([]);
      setListError('Choose a valid start and end date.');
      setRefreshing(false);
      return;
    }
    setListError('');
    setRefreshing(true);
    void (async () => {
      try {
        const result = [];
        const size = 500;
        for (let offset = 0; ; offset += size) {
          const { data, error: issue } = await supabase
            .from('daily_rounds')
            .select('*')
            .gte('visit_date', filters.start)
            .lte('visit_date', filters.end)
            .order('visit_date', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id')
            .range(offset, offset + size - 1);
          if (!current) return;
          if (issue) throw issue;
          result.push(...data);
          if (data.length < size) break;
        }
        if (current) setVisits(result);
      } catch (issue) {
        if (current) {
          setListError(issue.message);
          setVisits([]);
        }
      } finally {
        if (current) setRefreshing(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [allowed, filters.start, filters.end, version]);

  const classVisits = useMemo(
    () => visits.filter(visit => !filters.classId || String(visit.class_id) === filters.classId),
    [visits, filters.classId]
  );
  const teacherOptions = useMemo(
    () =>
      [...new Map(classVisits.map(visit => [visit.teacher_id, visit.teacher_name]))].sort((a, b) =>
        a[1].localeCompare(b[1])
      ),
    [classVisits]
  );
  const filtered = useMemo(
    () => classVisits.filter(visit => !filters.teacherId || visit.teacher_id === filters.teacherId),
    [classVisits, filters.teacherId]
  );
  const overview = useMemo(() => {
    const byClass = new Map();
    for (const visit of filtered) {
      const id = String(visit.class_id);
      if (!byClass.has(id)) byClass.set(id, []);
      byClass.get(id).push(visit);
    }
    return catalogue.classes
      .filter(item => !filters.classId || String(item.id) === filters.classId)
      .map(item => ({ ...item, ...summarizeRounds(byClass.get(String(item.id)) || []) }));
  }, [catalogue.classes, filtered, filters.classId]);
  const lowCoverage = useMemo(() => {
    const counts = new Map();
    for (const visit of visits)
      counts.set(String(visit.class_id), (counts.get(String(visit.class_id)) || 0) + 1);
    return catalogue.classes
      .map(item => ({ ...item, count: counts.get(String(item.id)) || 0 }))
      .filter(item => item.count < 2)
      .sort((a, b) => a.count - b.count);
  }, [catalogue.classes, visits]);
  const totals = summarizeRounds(filtered);
  const teacherOverview = useMemo(() => {
    if (!filters.classId) return [];
    const groups = new Map();
    for (const visit of classVisits) {
      if (!groups.has(visit.teacher_id)) groups.set(visit.teacher_id, []);
      groups.get(visit.teacher_id).push(visit);
    }
    return [...groups.entries()]
      .map(([id, rows]) => ({
        id,
        name: rows[0].teacher_name,
        ...summarizeRounds(rows),
      }))
      .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  }, [classVisits, filters.classId]);
  const className = catalogue.classes.find(item => String(item.id) === filters.classId)?.name;
  const teacherName = teacherOptions.find(([id]) => id === filters.teacherId)?.[1];

  function openVisit(visit) {
    setSelectedVisit(visit);
    setPanelMode('detail');
  }
  async function afterSave(result) {
    setPanelMode('history');
    setNotice(
      `Visit saved. ${result.queued} teacher alert${result.queued === 1 ? '' : 's'} queued.`
    );
    setVersion(value => value + 1);
    const { data, error: issue } = await supabase
      .from('daily_rounds')
      .select('*')
      .eq('id', result.id)
      .single();
    if (issue) setNotice('Visit saved. Refresh the visit list to open the report.');
    else openVisit(data);
  }
  async function exportPDF(action) {
    setPrinting(true);
    setError('');
    try {
      await action();
    } catch (issue) {
      setError(issue.message || 'Unable to download PDF.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Daily Rounds | DAR-E-ARQAM</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-foreground dark:from-slate-900 dark:to-slate-950">
        <Navbar />
        <main className="mx-auto max-w-7xl space-y-4 px-4 pb-10 pt-5 sm:px-6">
          <header className={panel + ' flex flex-wrap items-center justify-between gap-3'}>
            <div>
              <h1 className="text-2xl font-bold">Daily Rounds</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {canEdit
                  ? 'Record class visits and follow up on actionables.'
                  : 'Class visit reports and actionables.'}
              </p>
            </div>
            {canEdit && panelMode !== 'editor' && (
              <button
                className={primary}
                onClick={() => {
                  setNotice('');
                  setSelectedVisit(null);
                  setPanelMode('editor');
                }}
              >
                Record visit
              </button>
            )}
          </header>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg border bg-card p-3 text-sm">
              {notice}
            </p>
          )}
          {loading ? (
            <p role="status">Loading Daily Rounds…</p>
          ) : !allowed ? (
            <p>Daily Rounds is available to authorised school staff.</p>
          ) : (
            <>
              {panelMode === 'editor' && canEdit && (
                <DailyRoundEditor
                  key={selectedVisit?.id || 'new'}
                  visit={selectedVisit}
                  today={today}
                  {...catalogue}
                  onCancel={() => setPanelMode(selectedVisit ? 'detail' : 'history')}
                  onSaved={afterSave}
                />
              )}
              {panelMode === 'detail' && selectedVisit && (
                <VisitDetail
                  visit={selectedVisit}
                  canEdit={canEdit}
                  busy={printing}
                  onBack={() => setPanelMode('history')}
                  onEdit={() => setPanelMode('editor')}
                  onPDF={() => exportPDF(() => downloadRound(selectedVisit))}
                />
              )}
              {panelMode === 'history' && (
                <>
                  <section
                    className={panel + ' flex flex-wrap items-end gap-3'}
                    aria-label="Visit filters"
                  >
                    <label className="grid gap-1 text-xs font-semibold">
                      Class
                      <select
                        className={field}
                        value={filters.classId}
                        onChange={e => {
                          setFilters(current => ({
                            ...current,
                            classId: e.target.value,
                            teacherId: '',
                          }));
                          setLimit(20);
                        }}
                      >
                        <option value="">{canEdit ? 'All classes' : 'All my classes'}</option>
                        {catalogue.classes.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {canEdit && (
                      <label className="grid gap-1 text-xs font-semibold">
                        Observed teacher
                        <select
                          className={field}
                          value={filters.teacherId}
                          onChange={e => updateFilter('teacherId', e.target.value)}
                        >
                          <option value="">All observed teachers</option>
                          {teacherOptions.map(([id, name]) => (
                            <option key={id} value={id}>
                              {name}
                            </option>
                          ))}
                          {filters.teacherId && !teacherName && (
                            <option value={filters.teacherId}>Previously selected teacher</option>
                          )}
                        </select>
                      </label>
                    )}
                    <label className="grid gap-1 text-xs font-semibold">
                      From
                      <input
                        type="date"
                        className={field}
                        value={filters.start}
                        onChange={e => updateFilter('start', e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold">
                      To
                      <input
                        type="date"
                        className={field}
                        value={filters.end}
                        onChange={e => updateFilter('end', e.target.value)}
                      />
                    </label>
                    {canEdit && (
                      <button
                        className={secondary}
                        disabled={printing || refreshing || Boolean(listError) || !overview.length}
                        onClick={() =>
                          exportPDF(() =>
                            downloadRoundPeriod({
                              overview,
                              visits: filtered,
                              teacherOverview: teacherOverview.filter(
                                row => !filters.teacherId || row.id === filters.teacherId
                              ),
                              className,
                              teacherName,
                              start: filters.start,
                              end: filters.end,
                            })
                          )
                        }
                      >
                        {className ? 'Download class report PDF' : 'Download class comparison PDF'}
                      </button>
                    )}
                  </section>
                  {listError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {listError}
                    </p>
                  ) : refreshing ? (
                    <p role="status">Loading visits…</p>
                  ) : (
                    <>
                      {canEdit && (
                        <section className="grid gap-3 lg:grid-cols-3">
                          <div className={panel + ' lg:col-span-2'}>
                            <h2 className="font-semibold">Period overview</h2>
                            <p className="text-sm text-muted-foreground">
                              {totals.visits} visits · {formatScore(totals.score, '/5')} average ·{' '}
                              {totals.actions} actionables
                            </p>
                            <div className="mt-3 max-h-72 overflow-auto">
                              <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-card">
                                  <tr>
                                    {['Class', 'Visits', 'Average /5', 'Latest'].map(label => (
                                      <th key={label} className="border-b px-2 py-2">
                                        {label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {overview.map(item => (
                                    <tr key={item.id} className="border-b">
                                      <td className="px-2 py-2">{item.name}</td>
                                      <td className="px-2">{item.visits}</td>
                                      <td className="px-2">{formatScore(item.score)}</td>
                                      <td className="px-2">{item.latest || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className={panel}>
                            <h2 className="font-semibold">Low visit coverage</h2>
                            <p className="text-xs text-muted-foreground">
                              Fewer than 2 visits in the selected date range, across all classes.
                            </p>
                            {lowCoverage.length ? (
                              <ul className="mt-3 max-h-64 divide-y overflow-auto">
                                {lowCoverage.map(item => (
                                  <li key={item.id}>
                                    <button
                                      onClick={() => {
                                        setFilters(current => ({
                                          ...current,
                                          classId: String(item.id),
                                          teacherId: '',
                                        }));
                                        setLimit(20);
                                      }}
                                      className="flex w-full justify-between gap-2 py-2 text-left text-sm hover:underline"
                                    >
                                      <span>{item.name}</span>
                                      <span>
                                        {item.count} {item.count === 1 ? 'visit' : 'visits'}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-3 text-sm">Every class has at least 2 visits.</p>
                            )}
                          </div>
                        </section>
                      )}
                      {canEdit && teacherOverview.length > 0 && (
                        <section className={panel}>
                          <h2 className="font-semibold">Observed teachers in {className}</h2>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr>
                                  {['Observed teacher', 'Visits', 'Average /5', 'Actionables'].map(
                                    label => (
                                      <th key={label} className="border-b px-2 py-2">
                                        {label}
                                      </th>
                                    )
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {teacherOverview.map(row => (
                                  <tr key={row.id} className="border-b">
                                    <td className="px-2 py-2">
                                      <button
                                        className="text-blue-600 hover:underline dark:text-blue-300"
                                        onClick={() => updateFilter('teacherId', row.id)}
                                      >
                                        {row.name}
                                      </button>
                                    </td>
                                    <td className="px-2">{row.visits}</td>
                                    <td className="px-2">{formatScore(row.score)}</td>
                                    <td className="px-2">{row.actions}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      )}
                      <section className={panel + ' space-y-3'}>
                        <h2 className="font-semibold">
                          Visit history{' '}
                          <span className="text-sm font-normal text-muted-foreground">
                            · {filtered.length}
                          </span>
                        </h2>
                        {filtered.length ? (
                          <div className="divide-y">
                            {filtered.slice(0, limit).map(visit => (
                              <article
                                key={visit.id}
                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                              >
                                <div>
                                  <h3 className="font-semibold">
                                    {visit.class_name} · {visit.visit_date}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    {visit.lecture} · {visit.subject} · {visit.teacher_name}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span>{formatScore(visit.score, '/5')}</span>
                                  <span className="rounded bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                                    {visit.actionables.length} actionables
                                  </span>
                                  <button className={secondary} onClick={() => openVisit(visit)}>
                                    View report
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {!canEdit && !catalogue.classes.length
                              ? 'No classes are assigned to your account.'
                              : 'No visits match these filters.'}
                          </p>
                        )}
                        {limit < filtered.length && (
                          <button className={secondary} onClick={() => setLimit(limit + 20)}>
                            Show more visits
                          </button>
                        )}
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
