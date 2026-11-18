import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Clock3, ExternalLink, Inbox, Search, Users } from 'lucide-react';
import { formatMessageTime } from '../../utils/messaging';
import { matchesSearch } from '../../utils/ptm';
import { field, muted, panel, secondary } from './MessagingLayout';

const statuses = {
  queued: ['Ready', 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'],
  scheduled: ['Scheduled', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'],
  sent: ['Sent', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'],
};
const countLabel = (count, unit) => count + ' ' + unit + (count === 1 ? '' : 's');
const getStatus = (message, now) =>
  message.sent ? 'sent' : Date.parse(message.created_at) > now ? 'scheduled' : 'queued';

function groupDetails(group, now) {
  const counts = { queued: 0, scheduled: 0, sent: 0 };
  const classNames = new Set();
  for (const message of group.messages) {
    counts[getStatus(message, now)]++;
    if (message.classes?.name) classNames.add(message.classes.name);
  }
  const first = group.messages[0];
  return {
    counts,
    classes: [...classNames].join(', ') || 'No class',
    type: first.type === 'ptm' ? 'PTM' : first.type || 'Other',
    time: group.scheduledFor || first.notice_queued_at || group.time,
    timeLabel:
      group.scheduledFor || counts.scheduled > 0
        ? 'Scheduled for'
        : first.notice_queued_at
          ? 'Queued at'
          : 'Message date',
  };
}

function StatusBadge({ status, count }) {
  const [label, color] = statuses[status];
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ' + color
      }
    >
      {label}
      {count != null && <span className="tabular-nums">{count}</span>}
    </span>
  );
}

function RecipientDetail({ group, now, batch, status, busy, ask, back }) {
  const [search, setSearch] = useState('');
  const { counts, classes, type, time, timeLabel } = groupDetails(group, now);
  const waiting = group.messages.filter(row => !row.sent);
  const ready = waiting.filter(row => getStatus(row, now) === 'queued');
  const sent = group.messages.filter(row => row.sent);
  const visible = group.messages.filter(row =>
    matchesSearch(search, row.students?.name, row.student_id, row.classes?.name, row.text)
  );
  const batchId = group.messages[0].notice_batch_id;

  return (
    <section className={panel + ' min-w-0 overflow-hidden'} aria-labelledby="recipients-heading">
      <div className="space-y-4 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
        {!batch && (
          <button
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300 lg:hidden"
            onClick={back}
          >
            <ArrowLeft size={16} />
            Back to batches
          </button>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold capitalize text-indigo-700 dark:text-indigo-300">
              {type} · {classes}
            </p>
            <h2 id="recipients-heading" className="mt-1 text-xl font-bold">
              {countLabel(group.messages.length, 'recipient message')}
            </h2>
            <p className={muted + ' mt-1'}>
              {timeLabel} {formatMessageTime(time)}
              {time ? ' PKT' : ''}
            </p>
          </div>
          {!batch && batchId && (
            <Link
              className={secondary}
              href={{ pathname: '/messages', query: { status, batch: batchId } }}
            >
              <ExternalLink size={15} />
              Full batch
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(
            ([key, count]) => count > 0 && <StatusBadge key={key} status={key} count={count} />
          )}
        </div>
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
          <summary className="cursor-pointer text-sm font-semibold">Message template</summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
            {group.template}
          </p>
        </details>
        <div className="flex flex-wrap items-center gap-2" aria-label="Batch actions">
          {!!ready.length && (
            <button className={secondary} disabled={busy} onClick={() => ask('mark_sent', ready)}>
              Mark {ready.length} as sent
            </button>
          )}
          {!!waiting.length && (
            <button
              className={secondary + ' text-red-700 dark:text-red-300'}
              disabled={busy}
              onClick={() => ask('cancel', waiting)}
            >
              Cancel all unsent ({waiting.length})
            </button>
          )}
          {!!sent.length && (
            <button className={secondary} disabled={busy} onClick={() => ask('delete_sent', sent)}>
              Delete {sent.length} sent records
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 dark:bg-slate-800/60 sm:px-5">
        <h3 className="text-sm font-bold">Recipients</h3>
        {group.messages.length > 3 && (
          <label className="relative w-full sm:max-w-60">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              className={field + ' pl-9'}
              aria-label="Find recipients in batch"
              placeholder="Find recipients"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
        )}
      </div>
      {!visible.length && <p className={muted + ' p-5'}>No recipients match your search.</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800 lg:max-h-[34rem] lg:overflow-y-auto">
        {visible.map(msg => {
          const name = msg.students?.name || msg.student_id || 'Unassigned recipient';
          return (
            <li key={msg.id} className="space-y-2 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{name}</p>
                  {msg.classes?.name && <p className={muted}>{msg.classes.name}</p>}
                </div>
                <StatusBadge status={getStatus(msg, now)} />
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">
                {msg.text}
              </p>
              {!msg.sent && (
                <button
                  className="rounded py-1 text-sm font-semibold text-red-700 underline-offset-4 hover:underline focus-visible:outline-indigo-500 disabled:opacity-50 dark:text-red-300"
                  disabled={busy}
                  onClick={() => ask('cancel', [msg])}
                  aria-label={'Cancel message for ' + name}
                >
                  Cancel message
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function QueueWorkspace({
  groups,
  limit,
  showMore,
  activeKey,
  select,
  now,
  batch,
  status,
  busy,
  ask,
}) {
  const active = groups.find(group => group.key === activeKey) || (batch ? groups[0] : null);
  const total = groups.reduce((sum, group) => sum + group.messages.length, 0);
  return (
    <div
      className={
        batch ? '' : 'grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(18rem,2fr)_minmax(0,3fr)]'
      }
    >
      {!batch && (
        <section
          className={panel + ' min-w-0 overflow-hidden ' + (active ? 'hidden lg:block' : '')}
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="font-bold">Batches</h2>
            <span className={muted}>
              {countLabel(groups.length, 'group')} · {countLabel(total, 'message')}
            </span>
          </header>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800 lg:max-h-[44rem] lg:overflow-y-auto">
            {groups.slice(0, limit).map(group => {
              const { classes, counts, type, time } = groupDetails(group, now);
              const selected = active?.key === group.key;
              return (
                <li key={group.key}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => select(group.key)}
                    className={
                      'flex w-full items-start gap-2 border-l-4 px-3 py-3 text-left transition focus-visible:outline-indigo-500 ' +
                      (selected
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/60'
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/70')
                    }
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold capitalize text-slate-600 dark:text-slate-400">
                        {type}
                        <span aria-hidden="true">·</span>
                        {classes}
                      </p>
                      <p className="line-clamp-2 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                        {group.template}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                          <Users size={13} />
                          {group.messages.length}
                        </span>
                        {Object.keys(counts).map(
                          key => counts[key] > 0 && <StatusBadge key={key} status={key} />
                        )}
                      </div>
                      <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Clock3 size={13} />
                        {formatMessageTime(time)}
                        {time ? ' PKT' : ''}
                      </p>
                    </div>
                    <ChevronRight
                      size={16}
                      className="mt-1 shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {limit < groups.length && (
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <button className={secondary + ' w-full'} onClick={showMore}>
                Show more batches ({groups.length - limit} remaining)
              </button>
            </div>
          )}
        </section>
      )}
      {active ? (
        <RecipientDetail
          key={active.key}
          group={active}
          now={now}
          batch={batch}
          status={status}
          busy={busy}
          ask={ask}
          back={() => select('')}
        />
      ) : (
        <div
          className={
            panel +
            ' hidden min-h-64 flex-col items-center justify-center gap-2 p-6 text-center lg:flex'
          }
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
            <Inbox size={20} />
          </span>
          <h2 className="font-bold">Select a batch</h2>
          <p className={muted}>Review recipient messages and manage delivery.</p>
        </div>
      )}
    </div>
  );
}
