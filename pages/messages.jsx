import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  CalendarClock,
  CheckCircle2,
  Inbox,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { loadPTMClasses, matchesSearch, staffRoles } from '../utils/ptm';
import { formatMessageTime, groupMessages, pktDateTime } from '../utils/messaging';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../components/ui/dialog';
import QueueWorkspace from '../components/messaging/QueueWorkspace';
import MessagingLayout, {
  field,
  muted,
  Notice,
  panel,
  primary,
  secondary,
} from '../components/messaging/MessagingLayout';

const statuses = [
  ['queued', 'Ready to send', Inbox],
  ['scheduled', 'Scheduled', CalendarClock],
  ['sent', 'Sent', CheckCircle2],
];
const selection =
  'id,text,student_id,class_id,created_at,sent,type,notice_batch_id,notice_template,notice_scheduled_for,notice_queued_at,classes(name),students(name,fathername)';
const pageSize = 20;
const label = 'grid gap-1.5 text-sm font-semibold';
const getStatus = (message, now) =>
  message.sent ? 'sent' : Date.parse(message.created_at) > now ? 'scheduled' : 'queued';

async function readMessages({ access, status, classId, from, to, batch, active }) {
  if (access.role === 'teacher' && !access.classIds.length) return [];
  const now = new Date().toISOString();
  const rows = [];
  let last = null;
  while (active()) {
    let query = supabase.from('messages').select(selection);
    if (access.role === 'teacher') query = query.in('class_id', access.classIds);
    if (!batch && classId !== 'all') query = query.eq('class_id', classId);
    if (batch) query = query.eq('notice_batch_id', batch);
    else {
      if (status === 'sent') query = query.eq('sent', true);
      else {
        query = query.or('sent.eq.false,sent.is.null');
        query =
          status === 'scheduled'
            ? query.gt('created_at', now)
            : query.or(`created_at.lte.${now},created_at.is.null`);
      }
      if (from) query = query.gte('created_at', from + 'T00:00:00+05:00');
      if (to) query = query.lte('created_at', to + 'T23:59:59.999999+05:00');
    }
    if (last != null) query = query.gt('id', last);
    const { data, error } = await query.order('id').limit(500);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
    last = data.at(-1).id;
  }
  return rows;
}

export default function Messages() {
  const router = useRouter();
  const [setup, setSetup] = useState(null),
    [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const [setupError, setSetupError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [actionError, setActionError] = useState(''),
    [notice, setNotice] = useState('');
  const [classId, setClassId] = useState('all'),
    [type, setType] = useState('all'),
    [search, setSearch] = useState('');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [limit, setLimit] = useState(pageSize),
    [expanded, setExpanded] = useState(''),
    [confirm, setConfirm] = useState(null),
    [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const status = statuses.some(([key]) => key === router.query.status)
    ? router.query.status
    : 'queued';
  const batch =
    typeof router.query.batch === 'string' && /^[0-9a-f-]{36}$/i.test(router.query.batch)
      ? router.query.batch
      : '';
  const effectiveFrom =
    from || (status === 'sent' && !to ? pktDateTime(-6 * 24 * 60).slice(0, 10) : '');
  useEffect(() => {
    let active = true;
    loadPTMClasses()
      .then(result => {
        if (active) {
          setSetup(result);
          setSetupError('');
        }
      })
      .catch(e => {
        if (active) setSetupError(e.message);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const access = setup?.access;
  useEffect(() => {
    if (!router.isReady || !staffRoles.includes(access?.role)) return;
    let current = true;
    setLoading(true);
    setLoadError('');
    setRows([]);
    readMessages({ access, status, classId, from: effectiveFrom, to, batch, active: () => current })
      .then(data => {
        if (current) {
          setRows(data);
          setNow(Date.now());
        }
      })
      .catch(e => {
        if (current) setLoadError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [router.isReady, access, status, classId, effectiveFrom, to, batch]);
  useEffect(() => {
    if (status !== 'scheduled' && !batch) return;
    const next = rows.reduce(
      (due, row) =>
        getStatus(row, now) === 'scheduled' ? Math.min(due, Date.parse(row.created_at)) : due,
      Infinity
    );
    if (!Number.isFinite(next)) return;
    const wait = next - Date.now();
    const timer = setTimeout(
      () => (batch ? setNow(Date.now()) : setReload(n => n + 1)),
      Math.min(2147483647, Math.max(1000, wait + 500))
    );
    return () => clearTimeout(timer);
  }, [rows, status, batch, now]);

  const groups = useMemo(
    () =>
      groupMessages(
        rows.filter(row => batch || type === 'all' || (row.type || 'other') === type)
      ).filter(
        group =>
          batch ||
          matchesSearch(search, group.template) ||
          group.messages.some(row =>
            matchesSearch(search, row.text, row.students?.name, row.student_id, row.classes?.name)
          )
      ),
    [rows, type, search, batch]
  );
  useEffect(() => {
    setLimit(pageSize);
    setExpanded('');
  }, [status, batch, classId, type, search, effectiveFrom, to]);

  function clearFilters() {
    setSearch('');
    setType('all');
    setClassId('all');
    setFrom('');
    setTo('');
  }
  function changeStatus(value) {
    setNotice('');
    setActionError('');
    setFrom('');
    setTo('');
    router.replace({ pathname: '/messages', query: { status: value } }, undefined, {
      shallow: true,
    });
  }
  async function act() {
    setBusy(true);
    setActionError('');
    try {
      const { data, error } = await supabase.rpc('manage_message_rows', {
        p_ids: confirm.ids,
        p_action: confirm.action,
      });
      if (error) throw error;
      const done = new Set(confirm.ids);
      setRows(current =>
        confirm.action === 'mark_sent' && batch
          ? current.map(row => (done.has(row.id) ? { ...row, sent: true } : row))
          : current.filter(row => !done.has(row.id))
      );
      setNotice(
        `${data} recipient message(s) ${confirm.action === 'mark_sent' ? 'marked as sent' : confirm.action === 'cancel' ? 'cancelled' : 'deleted'}.`
      );
      setConfirm(null);
    } catch (e) {
      setActionError(e.message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  function ask(action, records) {
    const individual = action === 'cancel' && records.length === 1;
    const recipient = individual ? records[0].students?.name || records[0].student_id : null;
    setConfirm({
      action,
      ids: records.map(m => m.id),
      recipient,
      title: {
        mark_sent: 'Mark as sent',
        cancel: individual ? 'Cancel message' : 'Cancel batch messages',
        delete_sent: 'Delete sent records',
      }[action],
    });
  }
  const kinds = [...new Set(rows.map(r => r.type || 'other'))].sort();
  const allowed = staffRoles.includes(access?.role);
  return (
    <MessagingLayout
      mode="queue"
      title="Message queue"
      description="Review delivery status and manage recipient messages."
    >
      <Notice error>{setupError || loadError || actionError}</Notice>
      <Notice>{notice}</Notice>
      <section className={panel + ' overflow-hidden'}>
        <div className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
              role="group"
              aria-label="Queue status"
            >
              {statuses.map(([key, name, Icon]) => (
                <button
                  key={key}
                  className={
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold focus-visible:outline-indigo-500 ' +
                    (!batch && status === key
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white')
                  }
                  aria-pressed={!batch && status === key}
                  onClick={() => changeStatus(key)}
                >
                  <Icon size={16} />
                  {name}
                </button>
              ))}
            </div>
            <button
              className={secondary}
              onClick={() => {
                setActionError('');
                setReload(n => n + 1);
              }}
              disabled={loading && !setupError}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          {batch ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Notice batch · all delivery statuses</p>
              <button className={secondary} onClick={() => changeStatus(status)}>
                Back to queue
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className={label}>
                Search messages
                <span className="relative">
                  <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                  <input
                    className={field + ' pl-9'}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Text, student or class"
                  />
                </span>
              </label>
              <details className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                <summary className="cursor-pointer text-sm font-semibold">
                  <span className="ml-1 inline-flex items-center gap-2">
                    <SlidersHorizontal size={15} />
                    Filters{' '}
                    {classId !== 'all' || type !== 'all' || from || to ? (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        Active
                      </span>
                    ) : null}
                  </span>
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className={label}>
                    Class
                    <select
                      className={field}
                      value={classId}
                      onChange={e => {
                        setClassId(e.target.value);
                        setType('all');
                      }}
                    >
                      <option value="all">All accessible classes</option>
                      {setup?.classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={label}>
                    Type
                    <select className={field} value={type} onChange={e => setType(e.target.value)}>
                      <option value="all">All types</option>
                      {(kinds.includes(type) || type === 'all' ? kinds : [type, ...kinds]).map(
                        kind => (
                          <option key={kind} value={kind}>
                            {kind === 'ptm' ? 'PTM' : kind.charAt(0).toUpperCase() + kind.slice(1)}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                  <label className={label}>
                    From (PKT)
                    <input
                      className={field}
                      type="date"
                      value={effectiveFrom}
                      max={to || undefined}
                      onChange={e => setFrom(e.target.value)}
                    />
                  </label>
                  <label className={label}>
                    Through (PKT)
                    <input
                      className={field}
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={e => setTo(e.target.value)}
                    />
                  </label>
                </div>
                <button className={secondary + ' mt-3'} onClick={clearFilters}>
                  Reset filters
                </button>
              </details>
            </div>
          )}
        </div>
      </section>
      {!setup || !allowed || loading ? (
        <div className={panel + ' p-8 text-center'}>
          <p className={muted} aria-live="polite">
            {setupError
              ? 'Unable to load the queue.'
              : setup && !allowed
                ? 'Only staff can view the message queue.'
                : 'Loading messages…'}
          </p>
        </div>
      ) : loadError ? (
        <div className={panel + ' p-8 text-center'}>
          <p className={muted}>Use Refresh to try again.</p>
        </div>
      ) : !groups.length ? (
        <div className={panel + ' flex flex-col items-center gap-2 p-8 text-center'}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
            <Inbox size={20} />
          </span>
          <h2 className="font-bold">
            {search || type !== 'all'
              ? 'No matching messages'
              : batch
                ? 'No recipient messages in this batch'
                : status === 'scheduled'
                  ? 'Nothing scheduled'
                  : status === 'sent'
                    ? 'No sent messages in this date range'
                    : 'The queue is clear'}
          </h2>
          {!batch && (search || type !== 'all' || classId !== 'all' || from || to) && (
            <button className={secondary} onClick={clearFilters}>
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <QueueWorkspace
          groups={groups}
          limit={limit}
          showMore={() => setLimit(n => n + pageSize)}
          activeKey={expanded}
          select={setExpanded}
          now={now}
          batch={batch}
          status={status}
          busy={busy}
          ask={ask}
        />
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={open => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] rounded-xl">
          <DialogTitle>{confirm?.title}</DialogTitle>
          <DialogDescription>
            {confirm?.action === 'mark_sent'
              ? `Record ${confirm.ids.length} recipient messages as already sent. This does not send them.`
              : confirm?.action === 'cancel'
                ? confirm.ids.length === 1
                  ? `Remove this message${confirm.recipient ? ' for ' + confirm.recipient : ''} from the delivery queue.`
                  : `Remove all ${confirm.ids.length} selected unsent messages from the delivery queue.`
                : `Permanently remove ${confirm?.ids.length} sent message records.`}
          </DialogDescription>
          <DialogFooter>
            <button className={secondary} disabled={busy} onClick={() => setConfirm(null)}>
              Go back
            </button>
            <button className={primary} disabled={busy} onClick={act}>
              {busy ? 'Saving…' : confirm?.title}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MessagingLayout>
  );
}
