import { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import Breadcrumbs from '../components/Breadcrumbs';
import Loader from '../components/Loader';
import { supabase } from '../utils/supabaseClient';
import { getClassAccess } from '../utils/classAccess';
import { useToast } from '../hooks/use-toast';
import { FileCheck2, RefreshCw, RotateCcw } from 'lucide-react';
import RecheckingPlanner from '../components/RecheckingPlanner';

const pktDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const field =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-950';
const card =
  'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950';
const statusStyle = {
  checking: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  awaiting_recheck: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  returned: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

export default function RecheckingPage() {
  const { toast } = useToast();
  const [catalogue, setCatalogue] = useState({
      classes: [],
      staff: [],
      subjects: [],
      lessons: [],
      batches: [],
      tests: [],
    }),
    [duties, setDuties] = useState([]),
    [reviews, setReviews] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [tab, setTab] = useState('work'),
    [selected, setSelected] = useState(null),
    [review, setReview] = useState({
      reviewed_on: pktDate(),
      very_poor_count: 0,
      poor_count: 0,
      slightly_poor_count: 0,
      satisfactory_count: 0,
      incomplete_or_absent_count: 0,
      week_ending: '',
      notes_to_teacher: '',
      outcome: 'completed',
    }),
    [checking, setChecking] = useState({
      total_items: '',
      completed_on: pktDate(),
      handed_over_at: new Date().toISOString().slice(0, 16),
      notes: '',
    });
  async function load() {
    setLoading(true);
    try {
      const role = await getClassAccess();
      if (!['admin', 'superadmin', 'teacher'].includes(role.role))
        throw Error('Staff access is required.');
      const [cat, dutyRows, reviewRows] = await Promise.all([
        supabase.rpc('rechecking_catalogue'),
        supabase.from('rechecking_duties').select('*').order('updated_at', { ascending: false }),
        supabase.from('rechecking_reviews').select('*').order('created_at', { ascending: false }),
      ]);
      for (const r of [cat, dutyRows, reviewRows]) if (r.error) throw r.error;
      setCatalogue(
        cat.data || { classes: [], staff: [], subjects: [], lessons: [], batches: [], tests: [] }
      );
      setDuties(dutyRows.data || []);
      setReviews(reviewRows.data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Unable to load rechecking', description: e.message });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const classes = new Map(catalogue.classes.map(c => [String(c.id), c.name]));
  const staff = new Map(catalogue.staff.map(s => [String(s.id), s.name]));
  async function saveDuty(candidate) {
    if (busy) return;
    const checkerId = String(candidate.checker_id || '').trim(),
      recheckerId = String(candidate.rechecker_id || '').trim();
    if (!candidate.class_id || !checkerId || !recheckerId)
      return toast({
        variant: 'destructive',
        title: 'Incomplete grid row',
        description: `${!checkerId ? 'Select a checker. ' : ''}${!recheckerId ? 'Select a rechecker. ' : ''}Pick both staff members in this row, then save it.`,
      });
    if (checkerId === recheckerId)
      return toast({
        variant: 'destructive',
        title: 'Choose two different staff members',
        description: 'The checker and rechecker cannot be the same person.',
      });
    setBusy('save');
    try {
      const { id, revision, ...duty } = candidate;
      const payload = {
        ...duty,
        checker_id: checkerId,
        rechecker_id: recheckerId,
        class_id: Number(candidate.class_id),
        batch_id: candidate.batch_id || null,
        test_id: candidate.test_id || null,
        materials: candidate.materials || [],
      };
      const { error } = await supabase.rpc('save_rechecking_duty', {
        p_duty: payload,
        p_id: id || null,
        p_revision: id ? revision : null,
      });
      if (error) throw error;
      toast({
        title: id ? 'Duty updated' : 'Duty assigned',
        description: id
          ? 'The assignment changes have been saved.'
          : 'Checker and rechecker notifications have been queued.',
      });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not save duty', description: e.message });
    } finally {
      setBusy('');
    }
  }
  async function handover(duty) {
    setBusy(duty.id);
    try {
      const { error } = await supabase.rpc('complete_rechecking_check', {
        p_id: duty.id,
        p_total_items: Number(checking.total_items),
        p_completed_on: checking.completed_on,
        p_handed_over_at: new Date(checking.handed_over_at).toISOString(),
        p_notes: checking.notes,
      });
      if (error) throw error;
      toast({ title: 'Bundle handed over', description: 'The rechecker has been notified.' });
      setSelected(null);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not record handover', description: e.message });
    } finally {
      setBusy('');
    }
  }
  async function submitReview(duty, outcome) {
    setBusy(duty.id);
    try {
      const payload = {
        ...review,
        outcome,
        ...Object.fromEntries(
          [
            'very_poor_count',
            'poor_count',
            'slightly_poor_count',
            'satisfactory_count',
            'incomplete_or_absent_count',
          ].map(k => [k, Number(review[k] || 0)])
        ),
      };
      const { error } = await supabase.rpc('submit_rechecking_review', {
        p_id: duty.id,
        p_review: payload,
      });
      if (error) throw error;
      toast({
        title: outcome === 'returned' ? 'Bundle returned' : 'Rechecking completed',
        description: 'The checker has been notified.',
      });
      setSelected(null);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not save review', description: e.message });
    } finally {
      setBusy('');
    }
  }
  const aggregates = useMemo(() => {
    const result = new Map();
    reviews.forEach(r => {
      const d = duties.find(x => x.id === r.duty_id);
      if (!d) return;
      const key = d.checker_id;
      const item = result.get(key) || {
        id: key,
        name: staff.get(key) || 'Staff',
        reviews: 0,
        very: 0,
        poor: 0,
        slight: 0,
        returned: 0,
      };
      item.reviews++;
      item.very += r.very_poor_count;
      item.poor += r.poor_count;
      item.slight += r.slightly_poor_count;
      if (r.outcome === 'returned') item.returned++;
      result.set(key, item);
    });
    return [...result.values()].sort((a, b) => b.very + b.poor - (a.very + a.poor));
  }, [reviews, duties, catalogue.staff]);
  const heatmap = useMemo(() => {
    const m = new Map();
    reviews.forEach(r => {
      const d = duties.find(x => x.id === r.duty_id);
      if (!d) return;
      const key = `${d.class_id}|${d.subject}`;
      const x = m.get(key) || {
        className: classes.get(String(d.class_id)) || d.class_id,
        subject: d.subject,
        very: 0,
        poor: 0,
        reviews: 0,
      };
      x.very += r.very_poor_count;
      x.poor += r.poor_count;
      x.reviews++;
      m.set(key, x);
    });
    return [...m.values()].sort((a, b) => b.very + b.poor - (a.very + a.poor));
  }, [reviews, duties, catalogue.classes]);
  if (loading)
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader />
        </div>
      </div>
    );
  const selectedDuty = selected && duties.find(d => d.id === selected);
  return (
    <div className="min-h-screen bg-slate-50 pb-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl space-y-5 px-4 pb-10 pt-24 sm:px-6">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Rechecking', href: '/rechecking' },
          ]}
        />
        <section className="rounded-2xl bg-gradient-to-br from-indigo-700 to-violet-700 p-6 text-white shadow-lg">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-200">
            Academic quality assurance
          </p>
          <h1 className="mt-2 text-3xl font-bold">Rechecking control centre</h1>
          <p className="mt-2 max-w-3xl text-sm text-indigo-100">
            Assign examination bundles and routine books, track handovers, return weak checking for
            correction, and identify patterns by checker, class and subject.
          </p>
        </section>
        <div className="flex flex-wrap gap-2">
          {[
            ['work', 'My work'],
            ['assign', 'Assign duty'],
            ['insights', 'Reports & heatmap'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {label}
            </button>
          ))}
          <button onClick={load} className="ml-auto rounded-full border px-3 py-2 text-sm">
            <RefreshCw className="inline h-4 w-4" /> Refresh
          </button>
        </div>
        {tab === 'assign' && (
          <RecheckingPlanner
            catalogue={catalogue}
            duties={duties}
            reviews={reviews}
            classNames={classes}
            staffNames={staff}
            onAssign={saveDuty}
            busy={busy === 'save'}
          />
        )}
        {tab === 'work' && (
          <section className={card}>
            <div className="mb-4 flex justify-between">
              <div>
                <h2 className="font-bold">Duties and handovers</h2>
                <p className="text-sm text-muted-foreground">
                  Open a duty to submit the next action.
                </p>
              </div>
              <span className="text-sm text-muted-foreground">{duties.length} duties</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {duties.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d.id)}
                  className="rounded-xl border p-4 text-left hover:border-indigo-400"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold">{d.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {classes.get(String(d.class_id))} · {d.subject} · Checker:{' '}
                        {staff.get(String(d.checker_id))}
                      </p>
                    </div>
                    <span
                      className={`h-fit rounded-full px-2 py-1 text-xs font-bold ${statusStyle[d.status] || ''}`}
                    >
                      {d.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Round {d.checking_round} · Rechecker: {staff.get(String(d.rechecker_id))} ·{' '}
                    {d.duty_type}
                  </p>
                </button>
              ))}
              {!duties.length && (
                <p className="py-10 text-center text-sm text-muted-foreground lg:col-span-2">
                  No rechecking duties are visible to you.
                </p>
              )}
            </div>
          </section>
        )}
        {tab === 'insights' && (
          <section className="grid gap-5 lg:grid-cols-2">
            <div className={card}>
              <div className="flex justify-between">
                <h2 className="font-bold">Checker quality report</h2>
                <button onClick={() => window.print()} className="text-sm text-indigo-600">
                  Print report
                </button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Checker</th>
                      <th>Reviews</th>
                      <th>Very poor</th>
                      <th>Poor</th>
                      <th>Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregates.map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="p-2 font-medium">{r.name}</td>
                        <td>{r.reviews}</td>
                        <td className="text-rose-600">{r.very}</td>
                        <td className="text-amber-600">{r.poor}</td>
                        <td>{r.returned}</td>
                      </tr>
                    ))}
                    {!aggregates.length && (
                      <tr>
                        <td className="p-4 text-muted-foreground" colSpan="5">
                          No completed rechecks yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={card}>
              <h2 className="font-bold">Class / subject heatmap</h2>
              <p className="text-sm text-muted-foreground">
                Only subjects with completed rechecking are shown.
              </p>
              <div className="mt-3 space-y-2">
                {heatmap.map(r => {
                  const score = r.very * 3 + r.poor;
                  return (
                    <div key={`${r.className}${r.subject}`} className="rounded-lg border p-3">
                      <div className="flex justify-between text-sm">
                        <b>
                          {r.className} · {r.subject}
                        </b>
                        <span className={score ? 'text-rose-600' : 'text-emerald-600'}>
                          {score} concern score
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.reviews} review{r.reviews === 1 ? '' : 's'} · {r.very} very poor ·{' '}
                        {r.poor} poor
                      </p>
                    </div>
                  );
                })}
                {!heatmap.length && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No reviewed subjects yet.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
        {selectedDuty && (
          <div className="fixed inset-0 z-[120] flex items-end bg-black/40 p-3 sm:items-center sm:justify-center">
            <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-950">
              <button
                onClick={() => setSelected(null)}
                className="float-right text-sm text-muted-foreground"
              >
                Close
              </button>
              <h2 className="text-xl font-bold">{selectedDuty.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {classes.get(String(selectedDuty.class_id))} · {selectedDuty.subject} · Round{' '}
                {selectedDuty.checking_round}
              </p>
              {selectedDuty.status === 'checking' || selectedDuty.status === 'returned' ? (
                <div className="mt-5 space-y-3">
                  <h3 className="font-semibold">Checker handover</h3>
                  <label>
                    Total scripts / items
                    <input
                      className={field}
                      type="number"
                      min="0"
                      value={checking.total_items}
                      onChange={e => setChecking(x => ({ ...x, total_items: e.target.value }))}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      Checking date
                      <input
                        className={field}
                        type="date"
                        value={checking.completed_on}
                        onChange={e => setChecking(x => ({ ...x, completed_on: e.target.value }))}
                      />
                    </label>
                    <label>
                      Handed over at
                      <input
                        className={field}
                        type="datetime-local"
                        value={checking.handed_over_at}
                        onChange={e => setChecking(x => ({ ...x, handed_over_at: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label>
                    Checker notes
                    <textarea
                      className={field}
                      value={checking.notes}
                      onChange={e => setChecking(x => ({ ...x, notes: e.target.value }))}
                    />
                  </label>
                  <button
                    onClick={() => handover(selectedDuty)}
                    disabled={busy === selectedDuty.id}
                    className="w-full rounded-lg bg-indigo-600 p-2 font-semibold text-white"
                  >
                    Mark checking complete & notify rechecker
                  </button>
                </div>
              ) : selectedDuty.status === 'awaiting_recheck' ? (
                <div className="mt-5 space-y-3">
                  <h3 className="font-semibold">Rechecker assessment</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['very_poor_count', 'Very poor checking'],
                      ['poor_count', 'Poor checking'],
                      ['slightly_poor_count', 'Slightly poor'],
                      ['satisfactory_count', 'Satisfactory'],
                      ['incomplete_or_absent_count', 'Incomplete / absent work'],
                    ].map(([k, label]) => (
                      <label key={k} className="text-sm">
                        {label}
                        <input
                          className={field}
                          type="number"
                          min="0"
                          value={review[k]}
                          onChange={e => setReview(x => ({ ...x, [k]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    Week ending (routine)
                    <input
                      className={field}
                      type="date"
                      value={review.week_ending}
                      onChange={e => setReview(x => ({ ...x, week_ending: e.target.value }))}
                    />
                  </label>
                  <label>
                    Notes to checker
                    <textarea
                      className={field}
                      value={review.notes_to_teacher}
                      onChange={e => setReview(x => ({ ...x, notes_to_teacher: e.target.value }))}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        submitReview(selectedDuty, 'completed');
                      }}
                      className="rounded-lg bg-emerald-600 p-2 font-semibold text-white"
                    >
                      Complete rechecking
                    </button>
                    <button
                      onClick={() => {
                        submitReview(selectedDuty, 'returned');
                      }}
                      className="rounded-lg bg-rose-600 p-2 font-semibold text-white"
                    >
                      <RotateCcw className="mr-1 inline h-4 w-4" />
                      Return bundle
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  <FileCheck2 className="mr-1 inline h-4 w-4" />
                  This duty is complete. Its rechecking evidence remains in the report.
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
