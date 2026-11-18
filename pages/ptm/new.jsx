import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Search, Send } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { getClassAccess, canAccessClass } from '../../utils/classAccess';
import { loadPTMClasses, matchesSearch, staffRoles } from '../../utils/ptm';
import PTMLayout, {
  control,
  Empty,
  muted,
  Notice,
  panel,
  primary,
  secondary,
} from '../../components/ptm/PTMLayout';

const initial = { title: '', starts_at: '', location: '', agenda: '', instructions: '' };
const label = 'grid gap-1.5 text-sm font-semibold';

export default function NewPTM() {
  const router = useRouter();
  const [setup, setSetup] = useState(null),
    [choice, setChoice] = useState(null);
  const [roster, setRoster] = useState(null),
    [search, setSearch] = useState('');
  const [selection, setSelection] = useState([]),
    [onlySelected, setOnlySelected] = useState(false);
  const [form, setForm] = useState(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const classId =
    choice ??
    (setup?.classes.some(c => String(c.id) === router.query.class)
      ? router.query.class
      : setup?.classes.length === 1
        ? String(setup.classes[0].id)
        : '');
  const students = roster?.classId === classId ? roster.students : [];
  const selected = new Set(selection);
  const visible = students.filter(
    s =>
      (!onlySelected || selected.has(s.studentid)) &&
      matchesSearch(search, s.name, s.studentid, s.fathername)
  );
  const allVisible = visible.length > 0 && visible.every(s => selected.has(s.studentid));
  const missing = students.filter(
    s => selected.has(s.studentid) && !String(s.mobilenumber ?? '').trim()
  ).length;
  const back = { pathname: '/ptm', query: classId ? { class: classId } : {} };
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
    if (!router.isReady || !classId) return;
    let active = true;
    supabase
      .from('students')
      .select('studentid,name,fathername,mobilenumber')
      .eq('status', 'active')
      .eq('class_id', classId)
      .order('name')
      .then(({ data, error }) => {
        if (active) setRoster({ classId, students: data || [], error: error?.message });
      });
    return () => {
      active = false;
    };
  }, [router.isReady, classId, retry]);

  function changeClass(id) {
    setChoice(id);
    setRoster(null);
    setSelection([]);
    setOnlySelected(false);
    setSearch('');
    setError('');
  }
  function toggleStudents(ids, checked) {
    setSelection(current => {
      const updated = new Set(current);
      ids.forEach(id => (checked ? updated.add(id) : updated.delete(id)));
      return [...updated];
    });
  }
  async function create(e) {
    e.preventDefault();
    if (busy || !selected.size) return;
    setBusy(true);
    setError('');
    try {
      const access = await getClassAccess();
      if (!staffRoles.includes(access.role) || !canAccessClass(access, classId))
        throw Error('You do not have access to this class.');
      if (!form.title.trim() || !form.location.trim() || !form.agenda.trim())
        throw Error('Enter a title, location and agenda.');
      const startsAt = new Date(form.starts_at + '+05:00');
      if (Number.isNaN(startsAt.valueOf())) throw Error('Enter a valid meeting date and time.');
      const { data, error } = await supabase.rpc('ptm_create_meeting', {
        p_meeting: { ...form, starts_at: startsAt.toISOString() },
        p_student_ids: selection,
      });
      if (error) throw error;
      await router.push(`/ptm/${data}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <PTMLayout
      title="Schedule a meeting"
      description="Set the meeting details and choose which students’ parents to invite."
      back={back}
    >
      {error && (
        <Notice error>
          {error}{' '}
          {!setup && (
            <button
              className="underline"
              onClick={() => {
                setError('');
                setRetry(n => n + 1);
              }}
            >
              Retry
            </button>
          )}
        </Notice>
      )}
      {!setup || !router.isReady ? (
        <Empty>Loading classes…</Empty>
      ) : !staffRoles.includes(setup.access.role) ? (
        <Notice error>Only school staff can manage meetings.</Notice>
      ) : !setup.classes.length ? (
        <Empty>No classes are assigned to you.</Empty>
      ) : (
        <form onSubmit={create} className="space-y-4">
          <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
            <section className={panel + ' min-w-0 space-y-4 p-4 md:p-5'}>
              <h2 className="text-lg font-bold">Meeting details</h2>
              <label className={label}>
                Class
                <select
                  required
                  className={control}
                  value={classId}
                  onChange={e => changeClass(e.target.value)}
                >
                  <option value="">Choose a class</option>
                  {setup.classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Meeting title
                <input
                  required
                  className={control}
                  placeholder="e.g. Term 1 progress review"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  Date and time <span className={muted}>Pakistan time</span>
                  <input
                    required
                    type="datetime-local"
                    className={control}
                    value={form.starts_at}
                    onChange={e => setForm({ ...form, starts_at: e.target.value })}
                  />
                </label>
                <label className={label + ' self-end'}>
                  Location
                  <input
                    required
                    className={control}
                    placeholder="e.g. Main campus, room 4"
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                  />
                </label>
              </div>
              <label className={label}>
                Agenda
                <textarea
                  required
                  className={control}
                  rows={3}
                  value={form.agenda}
                  onChange={e => setForm({ ...form, agenda: e.target.value })}
                />
              </label>
              <label className={label}>
                Parent instructions (optional)
                <textarea
                  className={control}
                  rows={2}
                  value={form.instructions}
                  onChange={e => setForm({ ...form, instructions: e.target.value })}
                />
              </label>
            </section>
            <section className={panel + ' min-w-0 overflow-hidden'}>
              <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">Invite parents</h2>
                  <span
                    className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    aria-live="polite"
                  >
                    {selected.size} selected
                  </span>
                </div>
                <label className={label}>
                  Find students
                  <span className="relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    <input
                      className={control + ' pl-9'}
                      placeholder="Name, student ID or parent"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      disabled={!students.length}
                    />
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={secondary}
                    disabled={!visible.length}
                    onClick={() =>
                      toggleStudents(
                        visible.map(s => s.studentid),
                        !allVisible
                      )
                    }
                  >
                    {allVisible ? 'Clear shown' : 'Select shown'} ({visible.length})
                  </button>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={onlySelected}
                      onChange={e => setOnlySelected(e.target.checked)}
                    />
                    Selected only
                  </label>
                </div>
              </div>
              {!classId ? (
                <Empty>Choose a class to load its students.</Empty>
              ) : roster?.classId !== classId ? (
                <Empty>Loading students…</Empty>
              ) : roster.error ? (
                <div className="p-4">
                  <Notice error>
                    {roster.error}{' '}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setRoster(null);
                        setRetry(n => n + 1);
                      }}
                    >
                      Retry
                    </button>
                  </Notice>
                </div>
              ) : !visible.length ? (
                <Empty>
                  {students.length
                    ? 'No students match these filters.'
                    : 'There are no active students in this class.'}
                </Empty>
              ) : (
                <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                  {visible.map(s => (
                    <li key={s.studentid}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-indigo-600"
                          checked={selected.has(s.studentid)}
                          onChange={e => toggleStudents([s.studentid], e.target.checked)}
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          <strong className="block break-words">{s.name}</strong>
                          <span className={muted}>
                            {s.studentid}
                            {s.fathername ? ' · ' + s.fathername : ''}
                          </span>
                        </span>
                        {!String(s.mobilenumber ?? '').trim() && (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                            No phone
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </fieldset>
          <div className={panel + ' flex flex-wrap items-center justify-between gap-3 p-4'}>
            <p className={muted}>
              {!selected.size
                ? 'Select at least one student to schedule the meeting.'
                : `Invitations will be queued for ${selected.size - missing} of ${selected.size} selected students.${missing ? ` ${missing} missing a parent phone number.` : ''}`}
            </p>
            <button type="submit" className={primary} disabled={busy || !selected.size}>
              <Send size={16} />
              {busy ? 'Scheduling…' : 'Schedule and queue invitations'}
            </button>
          </div>
        </form>
      )}
    </PTMLayout>
  );
}
