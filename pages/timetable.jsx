import { useEffect, useState } from 'react';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import SubjectManager from '../components/SubjectManager';
import TimetableReportSelection from '../components/TimetableReportSelection';
import { buildReports, reportOptions } from '../utils/timetableReports.mjs';
import { slotIncludes, applicableLessons } from '../utils/timetable.mjs';
import styles from '../styles/TimetableWorkspace.module.css';
import { CalendarDays, Layers3, BookOpen, Users, Clock3 } from 'lucide-react';
import AssignedSubjects from '../components/AssignedSubjects';
import { supabase } from '../utils/supabaseClient';
import { loadClassSubjects } from '../utils/subjects';
import {
  DAYS,
  emptyTimetable,
  timetableRows,
  colorFor,
  warnings as assignmentWarnings,
  validateTimetable,
} from '../utils/timetable.mjs';
import { downloadTimetablePDF } from '../utils/timetablePDF';

const field = 'rounded border border-slate-300 bg-white p-2 text-sm text-slate-900';
const button =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const clone = value => JSON.parse(JSON.stringify(value));
export default function Timetable() {
  const [profile, setProfile] = useState(null),
    [classes, setClasses] = useState([]),
    [teachers, setTeachers] = useState([]),
    [subjects, setSubjects] = useState([]),
    [classSubjects, setClassSubjects] = useState({});
  const [record, setRecord] = useState(null),
    [plan, setPlan] = useState(emptyTimetable),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false);
  const [day, setDay] = useState('Monday'),
    [mode, setMode] = useState('overall'),
    [selected, setSelected] = useState(''),
    [colorMode, setColorMode] = useState('classes');
  const [busy, setBusy] = useState(true),
    [notice, setNotice] = useState(''),
    [copyDays, setCopyDays] = useState([]),
    [copyMode, setCopyMode] = useState('all');
  const canEdit = ['admin', 'superadmin'].includes(profile?.role?.toLowerCase());
  const superadmin = profile?.role?.toLowerCase() === 'superadmin';
  const isTeacher = profile?.role?.toLowerCase() === 'teacher';
  async function reloadSubjects() {
    const [mapping, { data, error }] = await Promise.all([
      loadClassSubjects(),
      supabase.from('subjects').select('id,name').order('name'),
    ]);
    if (error) throw error;
    setSubjects(data || []);
    setClassSubjects(mapping);
  }
  async function load() {
    setBusy(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const { data: currentProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id,name,role')
        .eq('id', auth.user?.id)
        .single();
      if (profileError) throw profileError;
      const role = currentProfile.role?.toLowerCase();
      const teacher = role === 'teacher';
      const editor = ['admin', 'superadmin'].includes(role);
      let classQuery = supabase.from('classes').select('id,name').order('id');
      let hasClasses = true;
      if (teacher) {
        const { data: access, error } = await supabase
          .from('teacher_class_access')
          .select('class')
          .eq('teacher_profile', currentProfile.id);
        if (error) throw error;
        const assigned = [...new Set((access || []).map(item => item.class))];
        hasClasses = assigned.length > 0;
        if (hasClasses) classQuery = classQuery.in('id', assigned);
      }
      const results = await Promise.all([
        hasClasses ? classQuery : Promise.resolve({ data: [], error: null }),
        supabase
          .from('profiles')
          .select('id,name,role,is_active')
          .in('role', ['teacher', 'admin', 'superadmin'])
          .order('name'),
        supabase
          .from('school_timetable')
          .select(editor ? '*' : 'published,published_at')
          .eq('id', 1)
          .single(),
        editor
          ? reloadSubjects()
          : supabase
              .from('subjects')
              .select('id,name')
              .order('name')
              .then(({ data, error }) => {
                if (error) throw error;
                setSubjects(data || []);
              }),
      ]);
      const [classResult, staffResult, timetableResult] = results;
      for (const result of [classResult, staffResult, timetableResult]) {
        if (result.error) throw result.error;
      }
      setMode(teacher ? 'teacher' : 'overall');
      setProfile(currentProfile);
      setClasses(classResult.data || []);
      setTeachers(staffResult.data || []);
      setRecord(timetableResult.data);
      setPlan(timetableResult.data.published || emptyTimetable());
      setEditing(false);
      setDirty(false);
    } catch (e) {
      setNotice(
        `${e.message} If the module is not installed, apply supabase/migrations/202611190001_timetable_subjects.sql.`
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const handler = e => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const activeStaff = teachers.filter(t => t.is_active !== false);
  const warnings = value =>
    assignmentWarnings(value, {
      classes: Object.fromEntries(classes.map(c => [c.id, c.name])),
      teachers: Object.fromEntries(teachers.map(t => [t.id, t.name])),
    });
  function update(fn, check = false) {
    const next = clone(plan);
    fn(next);
    if (check) {
      const previous = new Set(warnings(plan));
      const added = warnings(next).filter(w => !previous.has(w));
      if (
        added.length &&
        !window.confirm(`Assignment warning:\n${added.join('\n')}\n\nKeep these assignments?`)
      )
        return;
    }
    setPlan(next);
    setDirty(true);
  }
  function slotChange(day, id, key, value) {
    update(p => {
      const slot = p.days[day].find(s => s.id === id);
      slot[key] = value;
      if (key === 'kind' && value === 'break') slot.lessons = {};
    }, true);
  }
  function lessonChange(day, slotId, classId, fn) {
    update(p => {
      const slot = p.days[day].find(s => s.id === slotId);
      const lesson = clone(slot.lessons[classId] || { subjectId: '', teacherIds: [] });
      fn(lesson);
      if (!lesson.subjectId && !lesson.teacherIds.length) delete slot.lessons[classId];
      else slot.lessons[classId] = lesson;
    }, true);
  }
  async function save(publish) {
    const errors = validateTimetable(plan, classSubjects, activeStaff);
    if (errors.length) {
      setNotice(errors.join('\n'));
      return;
    }
    if (
      publish &&
      warnings(plan).length &&
      !window.confirm(`Publish with these confirmed warnings?\n${warnings(plan).join('\n')}`)
    )
      return;
    setBusy(true);
    setNotice('');
    try {
      const { data, error } = await supabase.rpc('save_school_timetable', {
        p_plan: plan,
        p_revision: record.revision,
        p_publish: publish,
      });
      if (error) throw error;
      setRecord(r => ({
        ...r,
        draft: clone(plan),
        revision: data.revision,
        ...(publish ? { published: clone(plan), published_at: new Date().toISOString() } : {}),
      }));
      setDirty(false);
      if (publish) {
        setEditing(false);
        setNotice(
          `Published. ${data.queued} message(s) queued for ${data.affected} affected staff; ${data.affected - data.queued} had no phone number. Queueing does not confirm delivery.`
        );
      } else setNotice('Draft saved. Teachers still see the published timetable.');
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  function copy() {
    if (!copyDays.length) return;
    if (
      !window.confirm(
        `Replace ${copyMode === 'all' ? 'slots and assignments' : copyMode === 'timings' ? 'slot structure and timings (keep assignments by slot position)' : 'assignments by slot position'} on ${copyDays.join(', ')}?`
      )
    )
      return;
    if (
      copyMode === 'assignments' &&
      copyDays.some(d => (plan.days[d] || []).length !== (plan.days[day] || []).length)
    ) {
      setNotice(
        'Assignment-only copy requires the same number of slots on each target day. Copy timings first.'
      );
      return;
    }
    update(p => {
      for (const target of copyDays) {
        const existing = p.days[target] || [];
        p.days[target] = (p.days[day] || []).map((s, i) =>
          copyMode === 'assignments'
            ? {
                ...existing[i],
                lessons:
                  existing[i].kind === 'break'
                    ? {}
                    : applicableLessons(existing[i], clone(s.lessons)),
              }
            : {
                ...clone(s),
                id: crypto.randomUUID(),
                lessons:
                  copyMode === 'timings'
                    ? s.kind === 'break'
                      ? {}
                      : applicableLessons(s, existing[i]?.lessons)
                    : clone(s.lessons),
              }
        );
      }
    }, true);
  }
  const slots = plan.days[day] || [];
  const scopedClasses = (classes ?? []).filter(
    c => !plan.classIds || plan.classIds.includes(String(c.id))
  );
  const [page, setPage] = useState(0);
  const [editingIds, setEditingIds] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const full = expanded && editing;
  useEffect(() => {
    if (!full) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = event => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', escape);
    };
  }, [full]);
  const [workspace, setWorkspace] = useState('schedule');
  const [pageSize, setPageSize] = useState(3);
  useEffect(() => {
    const resize = () =>
      setPageSize(window.innerWidth < 700 ? 1 : window.innerWidth < 1050 ? 2 : 3);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  function toggleClass(c) {
    const id = String(c.id);
    const included = scopedClasses.some(item => item.id === c.id);
    if (
      included &&
      timetableRows(plan).some(row => row.classId === id) &&
      !window.confirm(
        `Remove ${c.name} and its lessons from this draft? Publishing will update teacher access and notifications.`
      )
    )
      return;
    update(p => {
      const ids = new Set(scopedClasses.map(item => String(item.id)));
      if (included) {
        ids.delete(id);
        Object.values(p.days)
          .flat()
          .forEach(slot => {
            delete slot.lessons[id];
          });
      } else ids.add(id);
      p.classIds = [...ids];
    });
  }
  const [classIds, setClassIds] = useState(null),
    [teacherIds, setTeacherIds] = useState(null);
  const options = reportOptions(plan, scopedClasses, teachers);
  const reportFormats = isTeacher
    ? [
        ['teacher', 'Teacherwise'],
        ['class', 'Classwise'],
        ['overall', 'Overall'],
      ]
    : [[mode, { teacher: 'Teacherwise', class: 'Classwise', overall: 'Overall' }[mode]]];
  const reportExports = reportFormats.map(([format, label]) => ({
    format,
    label,
    reports:
      editing || workspace !== 'schedule' || !record?.published
        ? []
        : buildReports(record.published, {
            classes: scopedClasses,
            teachers,
            subjects,
            mode: format,
            classIds,
            teacherIds: isTeacher ? [String(profile.id)] : teacherIds,
            colorMode,
          }),
  }));
  const reports = reportExports.find(item => item.format === mode)?.reports ?? [];
  const filteredClasses = scopedClasses.filter(
    c => editingIds === null || editingIds.includes(String(c.id))
  );
  const lastPage = Math.max(0, Math.ceil(filteredClasses.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const [wholeWeek, setWholeWeek] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const weekView = editing && wholeWeek;
  const showTogether = editing;
  const visibleClasses = showTogether
    ? filteredClasses
    : filteredClasses.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const getSubject = id =>
    subjects.find(s => String(s.id) === String(id))?.name || 'Choose subject';
  const visibleSlots = (weekView ? DAYS : [day]).flatMap(rowDay =>
    (plan.days[rowDay] || [])
      .filter(
        slot =>
          (editing && editingIds === null) || visibleClasses.some(c => slotIncludes(slot, c.id))
      )
      .map(slot => ({ rowDay, slot }))
  );
  return (
    <>
      <Head>
        <title>Timetable | DAR-E-ARQAM</title>
      </Head>
      <div className={styles.page}>
        <Navbar />
        <main
          className={styles.shell}
          data-expanded={full}
          data-building={editing && workspace === 'schedule'}
        >
          <header className={styles.header}>
            <div>
              <p className={styles.breadcrumb}>Academics / Timetable</p>
              <h1>
                {isTeacher
                  ? 'My timetable'
                  : workspace === 'subjects'
                    ? 'Subject assignments'
                    : 'Weekly timetable'}
              </h1>
              <p className={styles.status}>
                {editing
                  ? `Editing draft${dirty ? ' • Unsaved changes' : ''}`
                  : record?.published_at
                    ? `Published ${new Date(record.published_at).toLocaleString()}`
                    : 'No timetable published yet'}
              </p>
            </div>
            {workspace === 'schedule' && (
              <div className="flex flex-wrap gap-2">
                {canEdit && !editing && (
                  <button
                    className={button}
                    disabled={busy || !record}
                    onClick={() => {
                      setPlan(clone(record.draft));
                      setExpanded(false);
                      setEditingIds(null);
                      setEditing(true);
                      setWholeWeek(true);
                      setSettingsOpen(false);
                      setMode('overall');
                      setSelected('');
                    }}
                  >
                    Edit draft
                  </button>
                )}
                {editing && (
                  <>
                    <button className={field} disabled={busy} onClick={() => save(false)}>
                      Save draft
                    </button>
                    <button className={button} disabled={busy} onClick={() => save(true)}>
                      Publish & queue notifications
                    </button>
                    <button
                      className={field}
                      disabled={busy}
                      onClick={() => {
                        if (!dirty || window.confirm('Discard unsaved changes?')) {
                          setPlan(record.published || emptyTimetable());
                          setEditing(false);
                          setDirty(false);
                        }
                      }}
                    >
                      View published
                    </button>
                  </>
                )}
                {reportExports.map(({ format, label, reports: exportReports }) => (
                  <button
                    key={format}
                    className={field}
                    disabled={busy || !exportReports.length}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await downloadTimetablePDF(record.published, exportReports, format);
                      } catch (e) {
                        setNotice(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Download {label} PDF
                  </button>
                ))}
              </div>
            )}
          </header>
          {canEdit && !full && (
            <nav aria-label="Timetable workspace" className={styles.tabs}>
              {[
                ['schedule', 'Schedule planner'],
                ['subjects', 'Subject assignments'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={workspace === key}
                  className={workspace === key ? button : field}
                  onClick={() => setWorkspace(key)}
                >
                  {key === 'schedule' ? <CalendarDays size={16} /> : <BookOpen size={16} />} {label}
                </button>
              ))}
            </nav>
          )}
          {notice && (
            <pre
              role="status"
              className="whitespace-pre-wrap rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950"
            >
              {notice}
            </pre>
          )}
          {busy && <p role="status">Working…</p>}
          {canEdit && workspace === 'subjects' && (
            <SubjectManager
              classes={classes}
              subjects={subjects}
              classSubjects={classSubjects}
              onReload={reloadSubjects}
              onError={setNotice}
            />
          )}
          {workspace === 'schedule' && (
            <>
              {!isTeacher && (
                <div className={styles.metrics}>
                  {[
                    [Layers3, 'Included classes', scopedClasses.length],
                    [
                      Clock3,
                      'Weekly slots',
                      Object.values(plan.days).reduce((n, list) => n + list.length, 0),
                    ],
                    [
                      Users,
                      'Scheduled staff',
                      new Set(timetableRows(plan).flatMap(row => row.teacherIds)).size,
                    ],
                  ].map(([Icon, label, value]) => (
                    <div key={label}>
                      <Icon size={19} />
                      <span>
                        {label}
                        <strong>{value}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.planner}>
                {(!editing || settingsOpen) && (
                  <aside className={styles.sidebar}>
                    <h2>{isTeacher ? 'Timetable views' : 'Planner settings'}</h2>
                    <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 text-slate-900">
                      {editing && (
                        <input
                          aria-label="Timetable title"
                          className={field}
                          value={plan.title}
                          onChange={e =>
                            update(p => {
                              p.title = e.target.value;
                            })
                          }
                        />
                      )}
                      <label>
                        View{' '}
                        <select
                          className={field}
                          value={mode}
                          disabled={editing}
                          onChange={e => {
                            setMode(e.target.value);
                            setSelected('');
                          }}
                        >
                          <option value="teacher">
                            {isTeacher ? 'My weekly schedule' : 'Teacherwise'}
                          </option>
                          <option value="class">
                            {isTeacher ? 'Class timetables' : 'Classwise'}
                          </option>
                          <option value="overall">
                            {isTeacher ? 'My classes by day' : 'Overall'}
                          </option>
                        </select>
                      </label>
                      {!editing && (
                        <TimetableReportSelection
                          label={isTeacher ? 'My classes' : 'Report classes'}
                          items={options.classes}
                          ids={classIds}
                          onChange={setClassIds}
                        />
                      )}
                      {!isTeacher && !editing && mode === 'teacher' && (
                        <TimetableReportSelection
                          label={
                            canEdit ? 'Teachers with timetable assignments' : 'Report teachers'
                          }
                          items={options.teachers}
                          ids={teacherIds}
                          onChange={setTeacherIds}
                        />
                      )}
                      {!isTeacher && (
                        <label>
                          Colors{' '}
                          <select
                            className={field}
                            value={colorMode}
                            onChange={e => setColorMode(e.target.value)}
                          >
                            <option value="classes">By class</option>
                            <option value="teachers">By teacher</option>
                          </select>
                        </label>
                      )}
                    </section>
                    {editing && (
                      <details className="rounded-xl border bg-white p-4 text-slate-900">
                        <summary className="cursor-pointer font-semibold">
                          Included and excluded classes · {scopedClasses.length} included ·{' '}
                          {classes.length - scopedClasses.length} excluded
                        </summary>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {classes.map(c => (
                            <div
                              key={c.id}
                              className="flex items-start justify-between gap-2 rounded border p-2"
                            >
                              <div>
                                <strong>{c.name}</strong>
                                {scopedClasses.includes(c) ? (
                                  <AssignedSubjects subjects={classSubjects[c.id]} />
                                ) : (
                                  <small className="block text-slate-500">
                                    Excluded from timetable
                                  </small>
                                )}
                              </div>
                              <button
                                type="button"
                                className={field}
                                disabled={busy}
                                aria-label={`${scopedClasses.includes(c) ? 'Exclude' : 'Include'} ${c.name}`}
                                onClick={() => toggleClass(c)}
                              >
                                {scopedClasses.includes(c) ? 'Exclude' : 'Include'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </aside>
                )}
                <div className={styles.canvas}>
                  {!editing && (
                    <>
                      {mode === 'overall' && (
                        <nav className={styles.days} aria-label="Report day">
                          {DAYS.map(d => (
                            <button
                              key={d}
                              aria-pressed={day === d}
                              className={day === d ? button : field}
                              onClick={() => setDay(d)}
                            >
                              {d}
                            </button>
                          ))}
                        </nav>
                      )}
                      {!busy && !reports.some(r => !r.day || r.day === day) && (
                        <p>
                          No published assignments match this selection
                          {mode === 'overall' ? ' on ' + day : ''}.
                        </p>
                      )}
                      {reports
                        .filter(r => !r.day || r.day === day)
                        .map((r, i) => (
                          <section key={i} className="rounded-xl border bg-white p-3">
                            <h2 className="mb-2 font-semibold">{r.title}</h2>
                            <div className={styles.gridScroll}>
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr>
                                    {r.head.map((h, j) => (
                                      <th className="border p-2 text-left text-white" key={j}>
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.body.map((row, j) => (
                                    <tr key={j}>
                                      {row.map((cell, k) => (
                                        <td
                                          className="min-w-24 whitespace-pre-line border p-2 align-top"
                                          key={k}
                                          style={
                                            cell.color
                                              ? { '--lesson-color': cell.color }
                                              : undefined
                                          }
                                        >
                                          {cell.text}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        ))}
                    </>
                  )}
                  {editing && (
                    <>
                      {editing && (
                        <div className={styles.editBar}>
                          <button
                            className={field}
                            aria-expanded={settingsOpen}
                            onClick={() => setSettingsOpen(!settingsOpen)}
                          >
                            Planner settings
                          </button>
                          <details>
                            <summary>Classes to edit · {filteredClasses.length}</summary>
                            <div className={styles.picker}>
                              <button className={field} onClick={() => setEditingIds(null)}>
                                All classes
                              </button>
                              <button className={field} onClick={() => setEditingIds([])}>
                                Clear
                              </button>
                              {scopedClasses.map(c => (
                                <label key={c.id}>
                                  <input
                                    type="checkbox"
                                    checked={
                                      editingIds === null || editingIds.includes(String(c.id))
                                    }
                                    onChange={e => {
                                      const ids = new Set(
                                        editingIds ?? scopedClasses.map(item => String(item.id))
                                      );
                                      if (e.target.checked) ids.add(String(c.id));
                                      else ids.delete(String(c.id));
                                      setEditingIds([...ids]);
                                      setPage(0);
                                    }}
                                  />{' '}
                                  {c.name}
                                </label>
                              ))}
                            </div>
                          </details>
                          <button
                            className={field}
                            aria-pressed={full}
                            onClick={() => setExpanded(!full)}
                          >
                            {full ? 'Exit full screen' : 'Full screen'}
                          </button>
                        </div>
                      )}
                      <nav aria-label="Timetable days" className={styles.days}>
                        {editing && (
                          <button
                            aria-pressed={weekView}
                            className={weekView ? button : field}
                            onClick={() => setWholeWeek(true)}
                          >
                            Whole week
                          </button>
                        )}
                        {DAYS.map(d => (
                          <button
                            className={!weekView && day === d ? button : field}
                            key={d}
                            aria-pressed={!weekView && day === d}
                            onClick={() => {
                              setDay(d);
                              setWholeWeek(false);
                              setCopyDays([]);
                              setPage(0);
                            }}
                          >
                            {d} <span className="opacity-60">{plan.days[d]?.length || 0}</span>
                          </button>
                        ))}
                      </nav>
                      {editing && superadmin && (
                        <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 text-slate-900">
                          {weekView && (
                            <label>
                              Manage slots for{' '}
                              <select
                                className={field}
                                value={day}
                                onChange={e => {
                                  setDay(e.target.value);
                                  setCopyDays([]);
                                }}
                              >
                                {DAYS.map(d => (
                                  <option key={d}>{d}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          <button
                            className={button}
                            disabled={!filteredClasses.length}
                            onClick={() =>
                              update(p => {
                                (p.days[day] ||= []).push({
                                  id: crypto.randomUUID(),
                                  label: `Lecture ${slots.length + 1}`,
                                  start: '08:00',
                                  end: '08:40',
                                  kind: 'lecture',
                                  ...(editingIds !== null
                                    ? { classIds: filteredClasses.map(c => String(c.id)) }
                                    : {}),
                                  lessons: {},
                                });
                              })
                            }
                          >
                            {editingIds === null ? 'Add slot' : 'Add slot for selected classes'}
                          </button>
                          <details>
                            <summary>Copy {day} to other days</summary>
                            <div className={styles.picker}>
                              {DAYS.filter(d => d !== day).map(d => (
                                <label key={d} className="flex items-center gap-1 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={copyDays.includes(d)}
                                    onChange={e =>
                                      setCopyDays(v =>
                                        e.target.checked ? [...v, d] : v.filter(x => x !== d)
                                      )
                                    }
                                  />
                                  {d.slice(0, 3)}
                                </label>
                              ))}
                              <select
                                aria-label="Copy mode"
                                className={field}
                                value={copyMode}
                                onChange={e => setCopyMode(e.target.value)}
                              >
                                <option value="all">Timings + assignments</option>
                                <option value="timings">Timings only</option>
                                <option value="assignments">Assignments only</option>
                              </select>
                              <button className={field} onClick={copy}>
                                Copy days
                              </button>
                            </div>
                          </details>
                        </section>
                      )}
                      <div className="min-w-0 rounded-xl border bg-white text-slate-900">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                          <strong>{weekView ? 'Weekly' : day} timetable</strong>
                          {editing && (
                            <span className="text-xs">
                              {visibleSlots.length} slots · {visibleClasses.length} classes
                            </span>
                          )}
                          {!showTogether && (
                            <div className="flex items-center gap-2 text-sm">
                              <button
                                className={field}
                                disabled={!currentPage}
                                onClick={() => setPage(currentPage - 1)}
                              >
                                Previous
                              </button>
                              {filteredClasses.length
                                ? `Classes ${currentPage * pageSize + 1}–${currentPage * pageSize + visibleClasses.length} of ${filteredClasses.length}`
                                : 'No classes selected'}
                              <button
                                className={field}
                                disabled={currentPage === lastPage}
                                onClick={() => setPage(currentPage + 1)}
                              >
                                Next
                              </button>
                            </div>
                          )}
                        </div>
                        <div className={styles.gridScroll}>
                          <table
                            style={
                              showTogether
                                ? { minWidth: 144 + visibleClasses.length * 128 }
                                : undefined
                            }
                            className="w-full table-fixed border-collapse break-words text-sm [&_input]:max-w-full [&_select]:max-w-full"
                          >
                            <thead>
                              <tr className="bg-indigo-950 text-white">
                                <th className="w-2/5 p-3 text-left md:w-56">Lecture slot</th>
                                {visibleClasses.map(c => (
                                  <th key={c.id} className="border-l border-white/20 p-3 text-left">
                                    {c.name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {!visibleSlots.length && (
                                <tr>
                                  <td
                                    colSpan={visibleClasses.length + 1}
                                    className="p-8 text-slate-500"
                                  >
                                    No slots for the selected classes{' '}
                                    {weekView ? 'this week' : 'on ' + day}.
                                    {editing && superadmin
                                      ? ' Add a slot or copy another day.'
                                      : ''}
                                  </td>
                                </tr>
                              )}
                              {visibleSlots.map(({ rowDay, slot }, index) => (
                                <tr
                                  key={rowDay + slot.id}
                                  data-day-start={
                                    weekView && visibleSlots[index - 1]?.rowDay !== rowDay
                                  }
                                >
                                  <td className="border p-3 align-top">
                                    {weekView && <small className={styles.rowDay}>{rowDay}</small>}
                                    {editing && superadmin ? (
                                      <details>
                                        <summary>
                                          {slot.label} · {slot.start}–{slot.end}
                                        </summary>
                                        <div className="space-y-2">
                                          <details>
                                            <summary>
                                              Slot classes (
                                              {
                                                scopedClasses.filter(c => slotIncludes(slot, c.id))
                                                  .length
                                              }
                                              )
                                            </summary>
                                            {scopedClasses.map(c => (
                                              <label key={c.id} className="block">
                                                <input
                                                  type="checkbox"
                                                  checked={slotIncludes(slot, c.id)}
                                                  onChange={e => {
                                                    const id = String(c.id);
                                                    if (
                                                      !e.target.checked &&
                                                      slot.lessons[id] &&
                                                      !window.confirm(
                                                        'Remove this class and its lesson from this slot?'
                                                      )
                                                    )
                                                      return;
                                                    const ids = new Set(
                                                      slot.classIds ??
                                                        scopedClasses.map(item => String(item.id))
                                                    );
                                                    if (e.target.checked) ids.add(id);
                                                    else ids.delete(id);
                                                    update(p => {
                                                      const changed = p.days[rowDay].find(
                                                        s => s.id === slot.id
                                                      );
                                                      changed.classIds = [...ids];
                                                      changed.lessons = applicableLessons(
                                                        changed,
                                                        changed.lessons
                                                      );
                                                    });
                                                  }}
                                                />{' '}
                                                {c.name}
                                              </label>
                                            ))}
                                          </details>
                                          <input
                                            aria-label="Slot label"
                                            className={`${field} w-44`}
                                            value={slot.label}
                                            onChange={e =>
                                              slotChange(rowDay, slot.id, 'label', e.target.value)
                                            }
                                          />
                                          <div className="flex flex-wrap gap-1">
                                            <input
                                              aria-label="Slot start"
                                              type="time"
                                              className={`${field} w-28`}
                                              value={slot.start}
                                              onChange={e =>
                                                slotChange(rowDay, slot.id, 'start', e.target.value)
                                              }
                                            />
                                            <input
                                              aria-label="Slot end"
                                              type="time"
                                              className={`${field} w-28`}
                                              value={slot.end}
                                              onChange={e =>
                                                slotChange(rowDay, slot.id, 'end', e.target.value)
                                              }
                                            />
                                          </div>
                                          <select
                                            aria-label="Slot type"
                                            className={field}
                                            value={slot.kind}
                                            onChange={e => {
                                              if (
                                                e.target.value !== 'break' ||
                                                !Object.keys(slot.lessons).length ||
                                                window.confirm(
                                                  'Making this a break clears its assignments. Continue?'
                                                )
                                              )
                                                slotChange(rowDay, slot.id, 'kind', e.target.value);
                                            }}
                                          >
                                            <option value="lecture">Lecture</option>
                                            <option value="break">Break</option>
                                          </select>
                                          <button
                                            className="ml-2 text-rose-700"
                                            onClick={() => {
                                              if (
                                                window.confirm(
                                                  'Remove this slot and its assignments?'
                                                )
                                              )
                                                update(p => {
                                                  p.days[rowDay] = p.days[rowDay].filter(
                                                    s => s.id !== slot.id
                                                  );
                                                });
                                            }}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </details>
                                    ) : (
                                      <>
                                        <strong>{slot.label}</strong>
                                        <p>
                                          {slot.start}–{slot.end}
                                        </p>
                                      </>
                                    )}
                                  </td>
                                  {visibleClasses.map(c => {
                                    if (!slotIncludes(slot, c.id))
                                      return (
                                        <td key={c.id} className={styles.unavailable}>
                                          Outside class schedule
                                        </td>
                                      );
                                    const lesson = slot.lessons?.[c.id];
                                    const show =
                                      mode !== 'teacher' ||
                                      !selected ||
                                      lesson?.teacherIds.map(String).includes(selected);
                                    return (
                                      <td
                                        key={c.id}
                                        className="border p-3 align-top"
                                        style={{
                                          '--lesson-color':
                                            slot.kind === 'break'
                                              ? '#f1f5f9'
                                              : colorMode === 'classes'
                                                ? colorFor(c.id, plan.colors?.classes)
                                                : lesson?.teacherIds.length
                                                  ? colorFor(
                                                      lesson.teacherIds[0],
                                                      plan.colors?.teachers
                                                    )
                                                  : '#ffffff',
                                        }}
                                      >
                                        {slot.kind === 'break' ? (
                                          <span className="text-slate-500">
                                            {slot.label || 'Break'}
                                          </span>
                                        ) : editing ? (
                                          <div className="space-y-2">
                                            <select
                                              aria-label={`${c.name} subject`}
                                              className={`${field} w-full`}
                                              value={lesson?.subjectId || ''}
                                              onChange={e =>
                                                lessonChange(rowDay, slot.id, c.id, l => {
                                                  l.subjectId = e.target.value;
                                                  if (!e.target.value) l.teacherIds = [];
                                                })
                                              }
                                            >
                                              <option value="">Free / choose subject</option>
                                              {(classSubjects[c.id] || []).map(s => (
                                                <option key={s.id} value={s.id}>
                                                  {s.name}
                                                </option>
                                              ))}
                                            </select>
                                            {!(classSubjects[c.id] || []).length && (
                                              <p className="text-xs text-rose-700">
                                                Choose subjects in the Subject assignments
                                                workspace.
                                              </p>
                                            )}
                                            {lesson?.subjectId && (
                                              <details>
                                                <summary className="cursor-pointer">
                                                  {lesson.teacherIds
                                                    .map(
                                                      id => teachers.find(t => t.id === id)?.name
                                                    )
                                                    .join(', ') || 'Assign teacher / admin'}
                                                </summary>
                                                <div className="mt-2 max-h-48 overflow-auto">
                                                  {activeStaff.map(t => (
                                                    <label key={t.id} className="flex gap-2 py-1">
                                                      <input
                                                        type="checkbox"
                                                        checked={lesson.teacherIds.includes(t.id)}
                                                        onChange={e =>
                                                          lessonChange(rowDay, slot.id, c.id, l => {
                                                            l.teacherIds = e.target.checked
                                                              ? [...l.teacherIds, t.id].sort()
                                                              : l.teacherIds.filter(
                                                                  id => id !== t.id
                                                                );
                                                          })
                                                        }
                                                      />
                                                      {t.name} <small>({t.role})</small>
                                                    </label>
                                                  ))}
                                                </div>
                                              </details>
                                            )}
                                          </div>
                                        ) : show && lesson ? (
                                          <>
                                            <strong>{getSubject(lesson.subjectId)}</strong>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                              {lesson.teacherIds.map(id => (
                                                <span
                                                  className="rounded border border-black/10 px-2 py-1 text-xs"
                                                  style={{
                                                    '--lesson-color': colorFor(
                                                      id,
                                                      plan.colors?.teachers
                                                    ),
                                                  }}
                                                  key={id}
                                                >
                                                  {teachers.find(t => t.id === id)?.name ||
                                                    'Former staff'}
                                                </span>
                                              ))}
                                            </div>
                                          </>
                                        ) : (
                                          <span className="text-slate-400">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                  {!isTeacher && (
                    <details className="rounded-xl border bg-white p-4 text-slate-900">
                      <summary className="cursor-pointer font-semibold">
                        {colorMode === 'classes' ? 'Class' : 'Teacher'} color legend{' '}
                        {editing && '(editable)'}
                      </summary>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {(colorMode === 'classes'
                          ? editing
                            ? scopedClasses
                            : options.classes.filter(
                                c => classIds === null || classIds.includes(String(c.id))
                              )
                          : editing
                            ? teachers
                            : options.teachers
                        ).map(item => (
                          <label
                            className="flex items-center gap-2 rounded border px-2 py-1"
                            key={item.id}
                          >
                            <input
                              aria-label={`${item.name} color`}
                              type="color"
                              disabled={!editing}
                              value={colorFor(item.id, plan.colors?.[colorMode])}
                              onChange={e =>
                                update(p => {
                                  p.colors ||= { classes: {}, teachers: {} };
                                  p.colors[colorMode] ||= {};
                                  p.colors[colorMode][item.id] = e.target.value;
                                })
                              }
                            />
                            {item.name}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                  {editing && warnings(plan).length > 0 && (
                    <details className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-950">
                      <summary>{warnings(plan).length} assignment warning(s)</summary>
                      <ul className="list-disc pl-5">
                        {warnings(plan).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
