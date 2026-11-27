import { useMemo, useState } from 'react';

const statusLabel = status =>
  ({
    checking: 'Assigned',
    awaiting_recheck: 'Awaiting recheck',
    returned: 'Returned',
    completed: 'Completed',
  })[status] || 'Not assigned';
const statusTone = status =>
  ({
    checking: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200',
    awaiting_recheck: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200',
    returned: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200',
    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200',
  })[status] || 'bg-slate-100 text-slate-500 dark:bg-slate-800';
const materialLabels = { book: 'Book', notebook: 'Notebook', workbook: 'Workbook' };

export default function RecheckingPlanner({
  catalogue,
  duties,
  reviews,
  classNames,
  onAssign,
  onRemove,
  busy,
}) {
  const [batchId, setBatchId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [routineChoices, setRoutineChoices] = useState({});
  const [workspace, setWorkspace] = useState('exam');
  const batch = catalogue.batches.find(item => String(item.id) === batchId);
  const examRows = useMemo(
    () =>
      !batch
        ? []
        : catalogue.tests.filter(test => test.date >= batch.start && test.date <= batch.end),
    [catalogue.tests, batch]
  );
  const latest = (classId, subject) => {
    const matching = duties
      .filter(
        d =>
          String(d.class_id) === String(classId) &&
          d.subject === subject &&
          d.duty_type === 'routine' &&
          d.status !== 'cancelled'
      )
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const key = `routine-${classId}-${subject}`;
    const active = matching.filter(d =>
      ['checking', 'returned', 'awaiting_recheck'].includes(d.status)
    );
    const duty = active.find(d => d.id === routineChoices[key]) || active[0] || matching[0];
    if (!duty) return null;
    const review = reviews.find(r => r.duty_id === duty.id);
    return { duty, review, active };
  };
  const staffIds = useMemo(
    () => new Set(catalogue.staff.map(person => String(person.id))),
    [catalogue.staff]
  );
  const checker = (classId, subject) => {
    const teacherIds = catalogue.lessons
      .filter(l => String(l.class_id) === String(classId) && l.subject === subject)
      .flatMap(l => l.teacher_ids || []);
    return teacherIds.find(id => staffIds.has(String(id))) || '';
  };
  const edit = (key, values) =>
    setDrafts(current => ({ ...current, [key]: { ...current[key], ...values } }));
  const saveRow = async (key, candidate) => {
    const savedDraft = drafts[key];
    if (!(await onAssign(candidate))) return;
    setDrafts(current => {
      if (current[key] !== savedDraft) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const removeRow = async (key, duty) => {
    if (!(await onRemove(duty))) return;
    setDrafts(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setRoutineChoices(current => ({ ...current, [key]: '' }));
  };
  const groupedExams = useMemo(
    () =>
      examRows.reduce(
        (out, row) => ({ ...out, [row.class_id]: [...(out[row.class_id] || []), row] }),
        {}
      ),
    [examRows]
  );
  const routineGroups = useMemo(
    () =>
      catalogue.subjects.reduce(
        (groups, row) => ({ ...groups, [row.class_id]: [...(groups[row.class_id] || []), row] }),
        {}
      ),
    [catalogue.subjects]
  );
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border bg-card p-1 shadow-sm">
        <button
          onClick={() => setWorkspace('exam')}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${workspace === 'exam' ? 'bg-indigo-600 text-white shadow' : 'text-muted-foreground hover:bg-muted'}`}
        >
          Exam bundles
        </button>
        <button
          onClick={() => setWorkspace('routine')}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${workspace === 'routine' ? 'bg-indigo-600 text-white shadow' : 'text-muted-foreground hover:bg-muted'}`}
        >
          Routine books
        </button>
      </div>
      {workspace === 'exam' && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-300">
                  Batch workspace
                </p>
                <h2 className="mt-1 text-xl font-bold">Exam duty planner</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assign a checker, rechecker and deadlines in one row. A save immediately notifies
                  staff.
                </p>
              </div>
              <select
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm shadow-sm sm:w-96"
                value={batchId}
                onChange={e => setBatchId(e.target.value)}
              >
                <option value="">Choose examination period</option>
                {catalogue.batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title} · {b.start} — {b.end}
                  </option>
                ))}
              </select>
            </div>
            {batch && (
              <div className="mt-5 space-y-5">
                {Object.entries(groupedExams).map(([classId, rows]) => (
                  <div
                    className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"
                    key={classId}
                  >
                    <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3 dark:bg-slate-900/70">
                      <div>
                        <h3 className="font-bold">{classNames.get(String(classId))}</h3>
                        <p className="text-xs text-muted-foreground">
                          {rows.length} examination paper{rows.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                        Editable grid
                      </span>
                    </div>
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/40">
                        <tr>
                          <th className="sticky left-0 bg-inherit p-3">Subject</th>
                          <th>Date</th>
                          <th>Checker</th>
                          <th>Rechecker</th>
                          <th>Check due</th>
                          <th>Recheck due</th>
                          <th>Status</th>
                          <th className="pr-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(test => {
                          const duty = duties.find(
                            d => String(d.test_id) === String(test.id) && d.status !== 'cancelled'
                          );
                          const id = checker(test.class_id, test.subject);
                          const draft = drafts[test.id] || {};
                          const editable = ['checking', 'returned', 'awaiting_recheck'].includes(
                            duty?.status
                          );
                          const value = (key, fallback = '') => draft[key] ?? fallback;
                          return (
                            <tr
                              className="border-b last:border-0 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10"
                              key={test.id}
                            >
                              <td className="sticky left-0 bg-card p-3 font-semibold">
                                {test.subject}
                              </td>
                              <td>{test.date}</td>
                              <td>
                                <select
                                  className="w-40 rounded-md border-0 bg-transparent p-1.5 hover:bg-slate-100 focus:bg-background focus:ring-2 focus:ring-indigo-300 dark:hover:bg-slate-800"
                                  disabled={busy || (!!duty && !editable)}
                                  value={value('checker_id', duty?.checker_id || id)}
                                  onChange={e => edit(test.id, { checker_id: e.target.value })}
                                >
                                  <option value="">Choose checker</option>
                                  {catalogue.staff.map(s => (
                                    <option value={s.id} key={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="w-40 rounded-md border-0 bg-transparent p-1.5 hover:bg-slate-100 focus:bg-background focus:ring-2 focus:ring-indigo-300 dark:hover:bg-slate-800"
                                  disabled={busy || (!!duty && !editable)}
                                  value={value('rechecker_id', duty?.rechecker_id || '')}
                                  onChange={e => edit(test.id, { rechecker_id: e.target.value })}
                                >
                                  <option value="">Choose rechecker</option>
                                  {catalogue.staff.map(s => (
                                    <option value={s.id} key={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  className="w-32 rounded-md border-0 bg-transparent p-1.5 hover:bg-slate-100 focus:bg-background focus:ring-2 focus:ring-indigo-300 dark:hover:bg-slate-800"
                                  type="date"
                                  disabled={busy || (!!duty && !editable)}
                                  value={value(
                                    'checking_deadline',
                                    duty?.checking_deadline || test.date
                                  )}
                                  onChange={e =>
                                    edit(test.id, { checking_deadline: e.target.value })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  className="w-32 rounded-md border-0 bg-transparent p-1.5 hover:bg-slate-100 focus:bg-background focus:ring-2 focus:ring-indigo-300 dark:hover:bg-slate-800"
                                  type="date"
                                  disabled={busy || (!!duty && !editable)}
                                  value={value(
                                    'rechecking_deadline',
                                    duty?.rechecking_deadline || ''
                                  )}
                                  onChange={e =>
                                    edit(test.id, { rechecking_deadline: e.target.value })
                                  }
                                />
                              </td>
                              <td>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(duty?.status)}`}
                                >
                                  {statusLabel(duty?.status)}
                                </span>
                              </td>
                              <td className="pr-3">
                                <button
                                  disabled={busy || (!!duty && !editable)}
                                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                  onClick={() =>
                                    saveRow(test.id, {
                                      duty_type: 'exam',
                                      batch_id: batch.id,
                                      test_id: test.id,
                                      class_id: test.class_id,
                                      subject: test.subject,
                                      title: test.test_name || `${test.subject} examination bundle`,
                                      checker_id: value('checker_id', duty?.checker_id || id),
                                      rechecker_id: value('rechecker_id', duty?.rechecker_id || ''),
                                      checking_deadline: value(
                                        'checking_deadline',
                                        duty?.checking_deadline || test.date
                                      ),
                                      rechecking_deadline: value(
                                        'rechecking_deadline',
                                        duty?.rechecking_deadline || ''
                                      ),
                                      id: editable ? duty?.id : undefined,
                                      revision: editable ? duty?.revision : undefined,
                                    })
                                  }
                                >
                                  {editable ? 'Save' : duty ? 'Completed' : 'Assign'}
                                </button>
                                {editable && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="ml-2 text-xs font-bold text-rose-600 disabled:opacity-50"
                                    onClick={() => removeRow(test.id, duty)}
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {workspace === 'routine' && (
        <section className="rounded-2xl border border-slate-200 bg-card shadow-sm dark:border-slate-800">
          <div className="border-b p-4 sm:flex sm:items-end sm:justify-between sm:p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-300">
                Routine planner
              </p>
              <h2 className="mt-1 text-xl font-bold">Books, notebooks & workbooks</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Choose only the material you want sampled. The subject teacher is filled from the
                timetable when available; every cell can still be changed.
              </p>
            </div>
            <div className="mt-3 flex gap-2 text-xs sm:mt-0">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                1. Pick material
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                2. Assign staff
              </span>
              <span className="rounded-full bg-indigo-100 px-3 py-1.5 font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                3. Schedule
              </span>
            </div>
          </div>
          <div className="space-y-5 p-4 sm:p-5">
            {Object.entries(routineGroups).map(([classId, rows]) => (
              <section className="overflow-hidden rounded-xl border" key={classId}>
                <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3 dark:bg-slate-900/70">
                  <div>
                    <h3 className="font-bold">{classNames.get(String(classId))}</h3>
                    <p className="text-xs text-muted-foreground">
                      {rows.length} subject{rows.length === 1 ? '' : 's'} ready to plan
                    </p>
                  </div>
                  <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    Editable grid
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-sm">
                    <thead className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/40">
                      <tr>
                        <th className="sticky left-0 z-10 bg-inherit p-3">Subject & history</th>
                        <th>Sample</th>
                        <th>Checker</th>
                        <th>Rechecker</th>
                        <th>Recheck due</th>
                        <th>Status</th>
                        <th className="pr-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const item = latest(row.class_id, row.name);
                        const id = checker(row.class_id, row.name);
                        const key = `routine-${row.class_id}-${row.name}`;
                        const draft = drafts[key] || {};
                        const value = (name, fallback = '') => draft[name] ?? fallback;
                        const editable = ['checking', 'returned', 'awaiting_recheck'].includes(
                          item?.duty?.status
                        );
                        const materials = value(
                          'materials',
                          editable ? item?.duty?.materials || [] : []
                        );
                        const latestResult = item?.review
                          ? `${item.review.very_poor_count} very poor · ${item.review.poor_count} poor`
                          : 'No completed sample yet';
                        return (
                          <tr
                            className="border-b last:border-0 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10"
                            key={key}
                          >
                            <td className="sticky left-0 z-10 bg-card p-3">
                              <p className="font-semibold">{row.name}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{latestResult}</p>
                              {item?.active?.length > 1 && (
                                <select
                                  aria-label={`Active ${row.name} duties`}
                                  className="mt-1 max-w-36 rounded border bg-background p-1 text-xs"
                                  value={item.duty.id}
                                  onChange={e => {
                                    setRoutineChoices(current => ({
                                      ...current,
                                      [key]: e.target.value,
                                    }));
                                    setDrafts(current => {
                                      const next = { ...current };
                                      delete next[key];
                                      return next;
                                    });
                                  }}
                                >
                                  {item.active.map(d => (
                                    <option key={d.id} value={d.id}>
                                      {d.rechecking_deadline || 'No due date'} · {d.id.slice(0, 6)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>
                              <div className="flex gap-1.5">
                                {Object.entries(materialLabels).map(([material, label]) => {
                                  const selected = materials.includes(material);
                                  return (
                                    <button
                                      key={material}
                                      type="button"
                                      disabled={busy}
                                      aria-pressed={selected}
                                      onClick={() =>
                                        edit(key, {
                                          materials: selected
                                            ? materials.filter(x => x !== material)
                                            : [...materials, material],
                                        })
                                      }
                                      className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td>
                              <select
                                className="w-40 rounded-md border-0 bg-transparent p-1.5 hover:bg-slate-100 focus:bg-background focus:ring-2 focus:ring-indigo-300 dark:hover:bg-slate-800"
                                disabled={busy}
                                value={value('checker_id', item?.duty?.checker_id || id)}
                                onChange={e => edit(key, { checker_id: e.target.value })}
                              >
                                <option value="">Choose checker</option>
                                {catalogue.staff.map(s => (
                                  <option value={s.id} key={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                className="w-40 rounded-md border-0 bg-transparent p-1.5 hover:bg-slate-100 focus:bg-background focus:ring-2 focus:ring-indigo-300 dark:hover:bg-slate-800"
                                disabled={busy}
                                value={value('rechecker_id', item?.duty?.rechecker_id || '')}
                                onChange={e => edit(key, { rechecker_id: e.target.value })}
                              >
                                <option value="">Choose rechecker</option>
                                {catalogue.staff.map(s => (
                                  <option value={s.id} key={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className="w-32 rounded-md border-0 bg-transparent p-1.5 hover:bg-slate-100 focus:bg-background focus:ring-2 focus:ring-indigo-300 dark:hover:bg-slate-800"
                                type="date"
                                disabled={busy}
                                value={value(
                                  'rechecking_deadline',
                                  editable ? item?.duty?.rechecking_deadline || '' : ''
                                )}
                                onChange={e => edit(key, { rechecking_deadline: e.target.value })}
                              />
                            </td>
                            <td>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(item?.duty?.status)}`}
                              >
                                {statusLabel(item?.duty?.status)}
                              </span>
                            </td>
                            <td className="pr-3">
                              <button
                                disabled={busy}
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() =>
                                  saveRow(key, {
                                    duty_type: 'routine',
                                    class_id: row.class_id,
                                    subject: row.name,
                                    title: `${row.name} routine rechecking`,
                                    checker_id: value('checker_id', item?.duty?.checker_id || id),
                                    rechecker_id: value(
                                      'rechecker_id',
                                      item?.duty?.rechecker_id || ''
                                    ),
                                    materials,
                                    checking_deadline: '',
                                    rechecking_deadline: value(
                                      'rechecking_deadline',
                                      editable ? item?.duty?.rechecking_deadline || '' : ''
                                    ),
                                    id: editable ? item?.duty?.id : undefined,
                                    revision: editable ? item?.duty?.revision : undefined,
                                  })
                                }
                              >
                                {editable ? 'Save' : 'Assign'}
                              </button>
                              {editable && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="ml-2 text-xs font-bold text-rose-600 disabled:opacity-50"
                                  onClick={() => removeRow(key, item.duty)}
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
