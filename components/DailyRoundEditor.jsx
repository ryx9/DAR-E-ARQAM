import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { formatScore, roundGroups, roundRatings } from '../utils/dailyRounds';

const field = 'w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground';

export default function DailyRoundEditor({
  visit,
  today,
  classes,
  staff,
  lessons,
  subjects,
  onCancel,
  onSaved,
}) {
  const [form, setForm] = useState(() =>
    visit
      ? { ...visit, actionsText: visit.actionables.join('\n') }
      : {
          class_id: '',
          visit_date: today,
          lecture: '',
          subject: '',
          teacher_id: '',
          ratings: {},
          follow_up: '',
          notes: '',
          actionsText: '',
        }
  );
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const changeClass = value =>
    setForm(current => ({
      ...current,
      class_id: value,
      lecture: '',
      subject: '',
      teacher_id: '',
      follow_up: '',
    }));

  useEffect(() => {
    let active = true;
    setContext(null);
    setContextError('');
    if (!form.class_id || !form.visit_date) return;
    if (
      visit &&
      String(form.class_id) === String(visit.class_id) &&
      form.visit_date === visit.visit_date
    ) {
      setContext(visit);
      return;
    }
    void (async () => {
      const { data, error: issue } = await supabase.rpc('daily_round_context', {
        p_class_id: form.class_id,
        p_visit_date: form.visit_date,
        p_round_id: visit?.id ?? null,
      });
      if (!active) return;
      if (issue) setContextError(issue.message);
      else setContext(data);
    })();
    return () => {
      active = false;
    };
  }, [form.class_id, form.visit_date, visit]);

  const weekday = form.visit_date
    ? new Date(form.visit_date + 'T12:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'long',
        timeZone: 'Asia/Karachi',
      })
    : '';
  const options = lessons.filter(
    row => row.classId === String(form.class_id) && row.day === weekday
  );
  const subjectName = id => subjects.find(item => String(item.id) === String(id))?.name;
  function fillLecture(slotId) {
    const row = options.find(item => item.slotId === slotId);
    if (!row) return;
    const assigned = row.teacherIds.filter(id => staff.some(person => person.id === id));
    setForm(current => ({
      ...current,
      lecture: `${row.label || 'Lecture'} (${row.start}–${row.end})`,
      subject: subjectName(row.subjectId) || '',
      teacher_id: assigned.length === 1 ? assigned[0] : '',
    }));
  }
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const { data, error: issue } = await supabase.rpc('save_daily_round', {
        p_id: visit?.id ?? null,
        p_revision: visit?.revision ?? null,
        p_report: {
          class_id: form.class_id,
          visit_date: form.visit_date,
          lecture: form.lecture,
          subject: form.subject,
          teacher_id: form.teacher_id,
          ratings: form.ratings,
          follow_up: form.follow_up,
          notes: form.notes,
          actionables: form.actionsText
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean),
        },
      });
      if (issue) throw issue;
      await onSaved(data);
    } catch (issue) {
      setError(issue.message || 'Could not save visit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{visit ? 'Edit visit' : 'Record a visit'}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Class
            <select
              className={field}
              value={form.class_id}
              onChange={e => changeClass(e.target.value)}
              required
            >
              <option value="">Select class</option>
              {classes.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Visit date
            <input
              type="date"
              className={field}
              value={form.visit_date}
              max={today}
              onChange={e => set('visit_date', e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Fill from timetable
            <select
              key={form.class_id + ':' + form.visit_date}
              className={field}
              defaultValue=""
              onChange={e => fillLecture(e.target.value)}
              disabled={!options.length}
            >
              <option value="">
                {options.length ? 'Choose scheduled lecture' : 'No scheduled lectures available'}
              </option>
              {options.map(row => (
                <option key={row.slotId} value={row.slotId}>
                  {row.label || 'Lecture'} · {row.start}–{row.end} ·{' '}
                  {subjectName(row.subjectId) || 'Subject'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Lecture
            <input
              className={field}
              placeholder="e.g. Lecture 2"
              maxLength={100}
              value={form.lecture}
              onChange={e => set('lecture', e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Subject
            <input
              className={field}
              maxLength={120}
              list="round-subjects"
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
              required
            />
            <datalist id="round-subjects">
              {subjects.map(item => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </label>
          <label className="text-sm font-medium">
            Observed teacher
            <select
              className={field}
              value={form.teacher_id}
              onChange={e => set('teacher_id', e.target.value)}
              required
            >
              <option value="">Select teacher</option>
              {visit && !staff.some(person => person.id === visit.teacher_id) && (
                <option value={visit.teacher_id}>{visit.teacher_name} (previously recorded)</option>
              )}
              {staff.map(person => (
                <option key={person.id} value={person.id}>
                  {person.name || 'Staff member'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {form.class_id && form.visit_date && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Class context</h2>
          {contextError ? (
            <p role="alert" className="text-sm text-destructive">
              {contextError}
            </p>
          ) : context ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">
                    Average attendance · last 7 marked days
                  </p>
                  <strong>{formatScore(context.attendance_average, '%')}</strong>{' '}
                  <span className="text-sm text-muted-foreground">
                    ({context.attendance_days} marked days)
                  </span>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">
                    Diaries marked sent · last 5 calendar days
                  </p>
                  <strong>{context.diary_count}</strong>
                </div>
              </div>
              <div className="rounded-lg border border-l-4 border-l-[hsl(var(--brand))] p-3">
                <h3 className="font-semibold">
                  Previous visit actionables{' '}
                  {context.prior_round_date && (
                    <span className="text-sm text-muted-foreground">
                      · {context.prior_round_date}
                    </span>
                  )}
                </h3>
                {context.prior_actionables.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {context.prior_actionables.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No previous actionables recorded.</p>
                )}
                {context.prior_round_date && (
                  <label className="mt-3 block text-sm">
                    Follow-up on previous actionables
                    <textarea
                      maxLength={4000}
                      rows={2}
                      className={field}
                      value={form.follow_up}
                      onChange={e => set('follow_up', e.target.value)}
                    />
                  </label>
                )}
              </div>
            </>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Loading class context…
            </p>
          )}
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {roundGroups.map(group => (
          <fieldset key={group.title} className="space-y-2 rounded-xl border bg-card p-4">
            <legend className="px-2 font-semibold">{group.title}</legend>
            {group.items.map(([id, label]) => (
              <label
                key={id}
                className="grid items-center gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_160px]"
              >
                <span>{label}</span>
                <select
                  className={field}
                  value={form.ratings[id] || ''}
                  onChange={e => set('ratings', { ...form.ratings, [id]: e.target.value })}
                  required
                >
                  <option value="">Select rating</option>
                  {roundRatings.map(([value, description]) => (
                    <option key={value} value={value}>
                      {description}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          New actionables <span className="font-normal text-muted-foreground">· one per line</span>
          <textarea
            className={field}
            rows={5}
            value={form.actionsText}
            onChange={e => set('actionsText', e.target.value)}
            placeholder="What should be completed before the next visit?"
          />
        </label>
        <label className="text-sm font-semibold">
          Observations
          <textarea
            className={field}
            rows={5}
            value={form.notes}
            maxLength={4000}
            onChange={e => set('notes', e.target.value)}
          />
        </label>
      </section>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          disabled={saving || (Boolean(form.class_id && form.visit_date) && !context)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save visit and queue alerts'}
        </button>
      </div>
    </form>
  );
}
