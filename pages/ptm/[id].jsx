import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CalendarDays, MapPin, MessageCircle, Users } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { getClassAccess, canAccessClass } from '../../utils/classAccess';
import { matchesSearch, meetingDate, staffRoles } from '../../utils/ptm';
import PTMLayout, {
  control,
  Empty,
  muted,
  Notice,
  panel,
  secondary,
} from '../../components/ptm/PTMLayout';

const messageKinds = [
  ['scheduled', 'Invitations'],
  ['present', 'Thank-you messages'],
  ['absent', 'Absence messages'],
];
const attendanceLabels = { pending: 'Pending', present: 'Present', absent: 'Absent' };

async function loadHistory(id) {
  const { data, error } = await supabase
    .from('ptm_message_history')
    .select('participant_id,kind,messages(sent),ptm_participants!inner(meeting_id)')
    .eq('ptm_participants.meeting_id', id);
  if (error) throw error;
  return data;
}

export default function PTMPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const [record, setRecord] = useState(null),
    [retry, setRetry] = useState(0);
  const [participants, setParticipants] = useState([]),
    [history, setHistory] = useState([]);
  const [tab, setTab] = useState('attendance'),
    [status, setStatus] = useState('all'),
    [classFilter, setClassFilter] = useState('all');
  const [search, setSearch] = useState(''),
    [noPhone, setNoPhone] = useState(false);
  const [busy, setBusy] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [messageError, setMessageError] = useState('');
  const meeting = record?.id === id ? record.meeting : null;
  useEffect(() => {
    if (!router.isReady || !id) return;
    let active = true;
    setRecord(null);
    setNotice('');
    setError('');
    setMessageError('');
    async function load() {
      const access = await getClassAccess();
      if (!staffRoles.includes(access.role)) throw Error('Only school staff can manage meetings.');
      const { data: meeting, error } = await supabase
        .from('ptm_meetings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !meeting) throw error || Error('Meeting not found.');
      if (meeting.class_id != null && !canAccessClass(access, meeting.class_id))
        throw Error('You do not have access to this meeting.');
      const { data: roster, error: rosterError } = await supabase
        .from('ptm_participants')
        .select(
          'id,student_id,attendance,students(studentid,name,fathername,mobilenumber,class_id)'
        )
        .eq('meeting_id', id)
        .order('id');
      if (rosterError) throw rosterError;
      if (
        access.role === 'teacher' &&
        (!roster.length || roster.some(p => !canAccessClass(access, p.students?.class_id)))
      )
        throw Error('You do not have access to all classes in this meeting.');
      const classIds = [
        ...new Set(
          [meeting.class_id, ...roster.map(p => p.students?.class_id)].filter(
            value => value != null
          )
        ),
      ];
      const classes = classIds.length
        ? await supabase.from('classes').select('id,name').in('id', classIds)
        : { data: [] };
      if (!active) return;
      setParticipants(
        roster.sort((a, b) =>
          (a.students?.name || a.student_id).localeCompare(b.students?.name || b.student_id)
        )
      );
      setHistory([]);
      setRecord({ id, meeting, classes: classes.data || [] });
      try {
        const rows = await loadHistory(id);
        if (active) setHistory(rows);
      } catch (e) {
        if (active) setMessageError(e.message);
      }
    }
    load().catch(e => {
      if (active) setRecord({ id, error: e.message });
    });
    return () => {
      active = false;
    };
  }, [id, router.isReady, retry]);

  async function changeAttendance(participant, value) {
    if (busy || participant.attendance === value) return;
    setBusy(String(participant.id));
    setNotice('');
    setError('');
    try {
      const { data, error } = await supabase.rpc('ptm_mark_attendance', {
        p_participant_id: participant.id,
        p_status: value,
      });
      if (error) throw error;
      setParticipants(current =>
        current.map(p => (p.id === participant.id ? { ...p, attendance: value } : p))
      );
      setNotice(
        `${participant.students?.name || participant.student_id} marked ${value}.${data?.queued ? ` ${data.queued} follow-up message(s) queued.` : ''}`
      );
      await refreshHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function refreshHistory() {
    try {
      setHistory(await loadHistory(id));
      setMessageError('');
    } catch (e) {
      setMessageError(e.message);
    }
  }
  async function queue(kind) {
    if (busy) return;
    setBusy(kind);
    setNotice('');
    setError('');
    try {
      const { data, error } = await supabase.rpc('ptm_queue_messages', {
        p_meeting_id: meeting.id,
        p_kind: kind,
      });
      if (error) throw error;
      setNotice(
        `${data.queued} newly queued · ${data.already_queued} already queued or sent · ${data.missing_phone} missing a phone number.`
      );
      await refreshHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const classes = record?.classes || [];
  const className = classId => classes.find(c => String(c.id) === String(classId))?.name;
  const hasPhone = p => Boolean(String(p.students?.mobilenumber ?? '').trim());
  const counts = participants.reduce(
    (out, p) => ({ ...out, [p.attendance]: out[p.attendance] + 1 }),
    { pending: 0, present: 0, absent: 0 }
  );
  const visible = participants.filter(
    p =>
      (status === 'all' || p.attendance === status) &&
      (classFilter === 'all' || String(p.students?.class_id) === classFilter) &&
      (!noPhone || !hasPhone(p)) &&
      matchesSearch(search, p.students?.name, p.student_id, p.students?.fathername)
  );
  const historyByParticipant = new Map();
  for (const row of history) {
    const key = row.participant_id;
    if (!historyByParticipant.has(key)) historyByParticipant.set(key, new Map());
    historyByParticipant
      .get(key)
      .set(row.kind, row.messages?.sent ? 'Sent' : row.messages ? 'Queued' : 'Unavailable');
  }
  const back = {
    pathname: '/ptm',
    query: meeting?.class_id != null ? { class: meeting.class_id } : {},
  };
  return (
    <PTMLayout title={meeting?.title || 'Meeting'} back={back}>
      {!meeting ? (
        record?.id === id && record.error ? (
          <Notice error>
            {record.error}{' '}
            <button className="underline" onClick={() => setRetry(n => n + 1)}>
              Retry
            </button>
          </Notice>
        ) : (
          <Empty>Loading meeting…</Empty>
        )
      ) : (
        <>
          <section className={panel + ' space-y-4 p-4 md:p-5'} aria-label="Meeting details">
            <div className={muted + ' flex flex-wrap gap-x-5 gap-y-2'}>
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={16} />
                {meetingDate(meeting.starts_at)}
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin size={16} />
                {meeting.location}
              </span>
              <span className="inline-flex items-center gap-2">
                <Users size={16} />
                {className(meeting.class_id) || 'Multi-class'} · {participants.length} students
              </span>
            </div>
            <details className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
              <summary className="cursor-pointer text-sm font-semibold">
                Agenda and parent instructions
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm">{meeting.agenda}</p>
              {meeting.instructions && (
                <p className={muted + ' mt-2 whitespace-pre-wrap'}>{meeting.instructions}</p>
              )}
            </details>
          </section>
          <nav className={panel + ' flex flex-wrap gap-2 p-1.5'} aria-label="Meeting sections">
            {[
              ['attendance', 'Attendance', Users],
              ['messages', 'Parent messages', MessageCircle],
            ].map(([key, label, Icon]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                onClick={() => setTab(key)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
          {error && <Notice error>{error}</Notice>}
          {notice && <Notice>{notice}</Notice>}
          {tab === 'attendance' ? (
            <section className={panel + ' overflow-hidden'} aria-label="Attendance roster">
              <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">Parent attendance</h2>
                    <p className={muted}>
                      Marking present or absent queues a follow-up where a phone number is
                      available.
                    </p>
                  </div>
                  <span className={muted}>
                    <strong className="text-slate-900 dark:text-white">
                      {counts.present + counts.absent}
                    </strong>{' '}
                    of {participants.length} marked
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{
                      width: participants.length
                        ? `${(100 * (counts.present + counts.absent)) / participants.length}%`
                        : '0%',
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['all', 'All', participants.length],
                    ...Object.entries(attendanceLabels).map(([key, label]) => [
                      key,
                      label,
                      counts[key],
                    ]),
                  ].map(([key, label, count]) => (
                    <button
                      key={key}
                      className={secondary + (status === key ? ' ring-2 ring-indigo-400' : '')}
                      aria-pressed={status === key}
                      onClick={() => setStatus(key)}
                    >
                      {label}
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    aria-label="Search attendees"
                    className={control + ' sm:max-w-xs'}
                    placeholder="Search student or parent"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {classes.length > 1 && (
                    <select
                      aria-label="Filter by class"
                      className={control + ' sm:max-w-44'}
                      value={classFilter}
                      onChange={e => setClassFilter(e.target.value)}
                    >
                      <option value="all">All classes</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={noPhone}
                      onChange={e => setNoPhone(e.target.checked)}
                    />
                    Missing phone only ({participants.filter(p => !hasPhone(p)).length})
                  </label>
                </div>
              </div>
              {!visible.length ? (
                <Empty>
                  {participants.length
                    ? 'No students match these filters.'
                    : 'No students are registered for this meeting.'}
                </Empty>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visible.map(p => (
                    <li
                      key={p.id}
                      className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_10rem] sm:items-center md:px-5"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-semibold">
                          {p.students?.name || p.student_id}
                        </p>
                        <p className={muted}>
                          {p.student_id}
                          {classes.length > 1 && className(p.students?.class_id)
                            ? ' · ' + className(p.students?.class_id)
                            : ''}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-sm">{p.students?.fathername || 'Parent'}</p>
                        {!hasPhone(p) && <p className={muted}>No phone number</p>}
                      </div>
                      <select
                        className={
                          control +
                          (p.attendance === 'present'
                            ? ' text-emerald-700 dark:text-emerald-300'
                            : p.attendance === 'absent'
                              ? ' text-red-700 dark:text-red-300'
                              : '')
                        }
                        aria-label={`Attendance for ${p.students?.name || p.student_id}`}
                        value={p.attendance}
                        disabled={!!busy}
                        onChange={e => changeAttendance(p, e.target.value)}
                      >
                        {Object.entries(attendanceLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {String(p.id) === busy && value === p.attendance ? 'Saving…' : label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="space-y-4" aria-label="Parent messages">
              {messageError && (
                <Notice error>
                  {messageError}{' '}
                  <button className="underline" onClick={refreshHistory}>
                    Retry loading messages
                  </button>
                </Notice>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                {messageKinds.map(([kind, label]) => {
                  const rows = history.filter(row => row.kind === kind);
                  const queued = rows.filter(row => row.messages && !row.messages.sent).length;
                  const sent = rows.filter(row => row.messages?.sent).length;
                  return (
                    <section key={kind} className={panel + ' space-y-3 p-4'}>
                      <h2 className="font-bold">{label}</h2>
                      <p className={muted}>
                        <strong className="text-slate-900 dark:text-white">{queued}</strong> queued
                        · <strong className="text-slate-900 dark:text-white">{sent}</strong> marked
                        sent
                      </p>
                      <button
                        className={secondary}
                        disabled={
                          !!busy || !(kind === 'scheduled' ? participants.length : counts[kind])
                        }
                        onClick={() => queue(kind)}
                      >
                        {busy === kind ? 'Queuing…' : 'Queue missing messages'}
                      </button>
                    </section>
                  );
                })}
              </div>
              <section className={panel + ' overflow-hidden'}>
                <header className="space-y-2 p-4">
                  <h2 className="text-lg font-bold">Message history</h2>
                  <p className={muted}>
                    Invitations and follow-ups normally queue automatically. The sent status comes
                    from the message queue.
                  </p>
                </header>
                {!participants.length ? (
                  <Empty>No students are registered.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="p-3">Student</th>
                          {messageKinds.map(([kind, label]) => (
                            <th key={kind} className="p-3">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {participants.map(p => (
                          <tr
                            key={p.id}
                            className="border-t border-slate-200 dark:border-slate-800"
                          >
                            <td className="p-3 font-semibold">
                              {p.students?.name || p.student_id}
                              {!hasPhone(p) && (
                                <span className="block text-xs font-normal text-amber-700 dark:text-amber-300">
                                  No phone number
                                </span>
                              )}
                            </td>
                            {messageKinds.map(([kind]) => (
                              <td key={kind} className="p-3">
                                {historyByParticipant.get(p.id)?.get(kind) || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </section>
          )}
        </>
      )}
    </PTMLayout>
  );
}
