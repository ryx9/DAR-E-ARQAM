import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  CalendarClock,
  ChevronDown,
  Eye,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import Groq from 'groq-sdk';
import { supabase } from '../utils/supabaseClient';
import { canAccessClass, getClassAccess } from '../utils/classAccess';
import {
  formatMessageTime,
  messageTokens,
  personalise,
  pktDateTime,
  unsupportedTokens,
} from '../utils/messaging';
import { loadPTMClasses, matchesSearch, staffRoles } from '../utils/ptm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../components/ui/dialog';
import MessagingLayout, {
  field,
  muted,
  Notice,
  panel,
  primary,
  secondary,
} from '../components/messaging/MessagingLayout';

const AI_DRAFTER_PROMPT = `
You are the **AI Communications Director** for "DAR-E-ARQAM SCHOOL".
Your goal is to write professional, polite, and clear SMS broadcasts to parents based on the user's rough input.

### CORE INSTRUCTIONS
1. **ENGLISH ONLY**: The final output must be in professional English. If the input is in Urdu or Roman Urdu, translate and refine it to English.
2. **ACTION**: 
   - If the user provides a topic (e.g., "fee reminder"), write a full message from scratch.
   - If the user provides a rough draft, polish and fix grammar.
3. **TONE**: Formal, respectful, and authoritative yet gentle. Use "Respected Parent" as the salutation.
4. **FORMAT**: Add 1-2 emojis (like calendar,school,pencil etc) per message and MUST use ** and _ _ for bold and italic very often

### MANDATORY VARIABLES
You MUST seamlessly integrate these placeholders where they make sense naturally:
- {{name}} (Student Name)
- {{fathername}} (Father's Name) - *Optional, use if flow allows*
- {{id}} (Student ID) - *Good for official notices*
- {{class}} (Class Name)

### FORMATTING RULES
- Do not use "Subject:" lines.
- Keep it under 400 characters if possible (SMS friendly).
- Use spacing for readability.
- Ends with "Regards, 
Administration".
`;

const SCHOOL_POLICY_CONTEXT = `
You are a strict AI Compliance Officer for a School Administration System. 
Your task is to review the message text provided by the user to ensure it adheres to school policy.

STRICT OUTPUT FORMAT:
You must return ONLY a JSON object in this exact format:
{
  "allowed": boolean,
  "reason": "Short explanation if rejected, or 'OK' if allowed"
}

POLICY RULES:
1. Language must be professional, polite, and grammatically correct.
2. No threatening, abusive, or slang language. No bad remarks about the school.
3. Messages must be relevant to school activities (Fees, Exams, Attendance, Holidays, or moral lessons).
4. Teachers are not allowed to share personal contacts (Only school address and 03234447292 allowed).

Do not provide conversational text, only the JSON.
`;

const label = 'grid gap-1.5 text-sm font-semibold';
const hasPhone = student => Boolean(String(student.mobilenumber ?? '').trim());

async function complete(prompt, text, json = false) {
  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (!apiKey) throw Error('The drafting and policy service is unavailable.');
  const client = new Groq({ apiKey, dangerouslyAllowBrowser: true });
  const result = await client.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    max_completion_tokens: json ? 2048 : 600,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  return result.choices[0]?.message?.content || '';
}

export default function ComposeNotice() {
  const router = useRouter();
  const [setup, setSetup] = useState(null),
    [chosen, setChosen] = useState(null);
  const [roster, setRoster] = useState(null),
    [selection, setSelection] = useState(new Set());
  const [search, setSearch] = useState(''),
    [fee, setFee] = useState('all'),
    [onlySelected, setOnlySelected] = useState(false);
  const [template, setTemplate] = useState(''),
    [delivery, setDelivery] = useState('now'),
    [scheduled, setScheduled] = useState('');
  const [previewId, setPreviewId] = useState(''),
    [review, setReview] = useState(false);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const editor = useRef(null);
  const studentId = typeof router.query.student === 'string' ? router.query.student : '';
  const linked = Array.isArray(router.query.class)
    ? router.query.class
    : router.query.class
      ? [router.query.class]
      : [];
  const classes = setup?.classes || [];
  const classIds =
    chosen ?? classes.filter(c => linked.includes(String(c.id))).map(c => String(c.id));
  const rosterKey = studentId ? 'student:' + studentId : 'class:' + classIds.join(',');
  const students = roster?.key === rosterKey ? roster.rows : [];
  const selected = students.filter(s => selection.has(s.studentid));
  const visible = students.filter(
    s =>
      (!onlySelected || selection.has(s.studentid)) &&
      (fee === 'all' || (s.Clear === true) === (fee === 'cleared')) &&
      matchesSearch(search, s.name, s.studentid, s.fathername, s.classes?.name)
  );
  const missing = selected.filter(s => !hasPhone(s)).length;
  const preview = selected.find(s => s.studentid === previewId) || selected[0];
  const unknown = unsupportedTokens(template);
  const planned = delivery === 'scheduled' && scheduled ? new Date(scheduled + '+05:00') : null;

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
    if (
      !router.isReady ||
      !setup ||
      !staffRoles.includes(setup.access.role) ||
      (!studentId && !classIds.length)
    )
      return;
    let active = true;
    async function load() {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        let query = supabase
          .from('active_students')
          .select('studentid,name,fathername,class_id,mobilenumber,Clear,classes(name)');
        query = studentId ? query.eq('studentid', studentId) : query.in('class_id', classIds);
        if (setup.access.role === 'teacher') {
          if (!setup.access.classIds.length) break;
          query = query.in('class_id', setup.access.classIds);
        }
        const { data, error } = await query.order('studentid').range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) break;
      }
      if (active) {
        setRoster({ key: rosterKey, rows });
        setSelection(
          prev =>
            new Set(
              studentId
                ? rows.map(s => s.studentid)
                : rows.filter(s => prev.has(s.studentid)).map(s => s.studentid)
            )
        );
      }
    }
    load().catch(e => {
      if (active) setRoster({ key: rosterKey, rows: [], error: e.message });
    });
    return () => {
      active = false;
    };
  }, [router.isReady, setup, rosterKey, retry]);

  function pick(ids, enabled) {
    setSelection(prev => {
      const next = new Set(prev);
      ids.forEach(id => (enabled ? next.add(id) : next.delete(id)));
      return next;
    });
  }
  function insertToken(key) {
    const input = editor.current;
    const start = input.selectionStart,
      end = input.selectionEnd;
    const token = '{{' + key + '}}';
    setTemplate(template.slice(0, start) + token + template.slice(end));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    });
  }
  async function draft() {
    setBusy('draft');
    setError('');
    try {
      const text = await complete(AI_DRAFTER_PROMPT, template);
      if (text) setTemplate(text.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  function scheduledTime() {
    if (delivery === 'now') return null;
    if (!planned || !Number.isFinite(planned.valueOf()) || planned <= new Date())
      throw Error('Choose a future delivery time in Pakistan time.');
    return planned.toISOString();
  }
  function openReview(e) {
    e.preventDefault();
    setError('');
    try {
      if (!selected.length || !template.trim())
        throw Error('Choose recipients and write a message.');
      if (missing) throw Error('Remove students without a phone number or update their records.');
      if (unknown.length) throw Error('Replace unsupported placeholders before queueing.');
      scheduledTime();
      setReview(true);
    } catch (e) {
      setError(e.message);
    }
  }
  async function queue() {
    if (busy) return;
    setBusy('queue');
    setError('');
    try {
      const access = await getClassAccess();
      if (
        !staffRoles.includes(access.role) ||
        selected.some(s => !canAccessClass(access, s.class_id))
      )
        throw Error('Your class access changed. Reload before queueing.');
      const result = JSON.parse(await complete(SCHOOL_POLICY_CONTEXT, template, true));
      if (result.allowed !== true)
        throw Error(result.reason || 'The notice did not pass the message policy check.');
      const scheduledFor = scheduledTime(),
        queuedAt = new Date().toISOString(),
        due = scheduledFor || queuedAt;
      const batch = crypto.randomUUID();
      const payload = selected.map(student => ({
        student_id: student.studentid,
        number: student.mobilenumber,
        class_id: student.class_id,
        text: personalise(template, student, due),
        type: 'notice',
        sent: false,
        created_at: due,
        notice_batch_id: batch,
        notice_template: template.trim(),
        notice_queued_at: queuedAt,
        notice_scheduled_for: scheduledFor,
      }));
      if (payload.some(row => !row.text))
        throw Error('At least one recipient would receive an empty message.');
      const { error } = await supabase.from('messages').insert(payload);
      if (error) throw error;
      setReview(false);
      setTemplate('');
      setSelection(new Set());
      await router.push({
        pathname: '/messages',
        query: { status: scheduledFor ? 'scheduled' : 'queued', batch },
      });
    } catch (e) {
      setError(e.message);
      setReview(false);
    } finally {
      setBusy('');
    }
  }
  const allVisible = visible.length > 0 && visible.every(s => selection.has(s.studentid));
  const ready = setup && router.isReady && staffRoles.includes(setup.access.role);
  const deliveryLabel =
    delivery === 'now'
      ? 'Queue immediately'
      : planned && Number.isFinite(planned.valueOf())
        ? formatMessageTime(planned) + ' PKT'
        : 'Choose a delivery time';
  const previewText =
    preview && template
      ? personalise(
          template,
          preview,
          planned && Number.isFinite(planned.valueOf()) ? planned : new Date()
        )
      : '';
  const selectedClasses = classes.filter(c => classIds.includes(String(c.id)));
  const canReview =
    !busy && selected.length > 0 && !missing && Boolean(template.trim()) && !unknown.length;
  return (
    <MessagingLayout
      mode="compose"
      title="Compose notice"
      description="Choose recipients, preview their personalised notice and set the delivery time."
    >
      <Notice error>{error}</Notice>
      {!ready ? (
        <p className={muted}>
          {setup
            ? 'Only school staff can compose notices.'
            : error
              ? 'Unable to load classes.'
              : 'Loading classes…'}{' '}
          {!setup && error && (
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
        </p>
      ) : (
        <form onSubmit={openReview} className="space-y-4">
          <nav className="flex flex-wrap items-center gap-2 lg:hidden" aria-label="Notice sections">
            <a className={secondary} href="#notice-recipients">
              <Users size={15} />
              Recipients
            </a>
            <a className={secondary} href="#notice-message">
              <MessageSquareText size={15} />
              Message
            </a>
            <a className={secondary} href="#notice-delivery">
              <CalendarClock size={15} />
              Delivery
            </a>
          </nav>
          <fieldset
            disabled={!!busy}
            className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          >
            <section
              id="notice-recipients"
              aria-labelledby="notice-recipients-title"
              className={panel + ' min-w-0 scroll-mt-24 overflow-hidden'}
            >
              <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h2
                    id="notice-recipients-title"
                    className="flex items-center gap-2 text-lg font-bold"
                  >
                    <Users size={19} className="text-indigo-600 dark:text-indigo-400" />
                    Recipients
                  </h2>
                  <span
                    className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    aria-live="polite"
                  >
                    {selected.length} selected
                  </span>
                </div>
                {!studentId && (
                  <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 break-words">
                        {selectedClasses.length === 1
                          ? selectedClasses[0].name
                          : classIds.length
                            ? `${classIds.length} classes selected`
                            : 'Choose classes'}
                      </span>
                      <ChevronDown size={16} className="shrink-0 text-slate-400" />
                    </summary>
                    <div className="mt-2 grid max-h-40 gap-2 overflow-auto sm:grid-cols-2">
                      {classes.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="accent-indigo-600"
                            checked={classIds.includes(String(c.id))}
                            onChange={e => {
                              const id = String(c.id);
                              setChosen(
                                e.target.checked
                                  ? [...classIds, id]
                                  : classIds.filter(value => value !== id)
                              );
                              setRoster(null);
                            }}
                          />
                          {c.name}
                        </label>
                      ))}
                      {!classes.length && <p className={muted}>No classes available.</p>}
                    </div>
                  </details>
                )}
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)]">
                  <label className="relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    <input
                      className={field + ' pl-9'}
                      aria-label="Search recipients"
                      placeholder="Search students or parents"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    className={field}
                    aria-label="Fee status"
                    value={fee}
                    onChange={e => setFee(e.target.value)}
                  >
                    <option value="all">All fee statuses</option>
                    <option value="cleared">Fee cleared</option>
                    <option value="outstanding">Fee outstanding</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondary}
                    disabled={!visible.length}
                    onClick={() =>
                      pick(
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
                  {missing > 0 && (
                    <button
                      type="button"
                      className={secondary}
                      onClick={() =>
                        pick(
                          selected.filter(s => !hasPhone(s)).map(s => s.studentid),
                          false
                        )
                      }
                    >
                      Remove {missing} without a phone
                    </button>
                  )}
                </div>
              </div>
              <ul
                aria-label="Students"
                className="max-h-72 lg:max-h-[34rem] divide-y divide-slate-100 overflow-auto dark:divide-slate-800"
              >
                {visible.map(s => (
                  <li key={s.studentid}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 ${selection.has(s.studentid) ? 'bg-indigo-50/60 dark:bg-indigo-950/40' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-indigo-600"
                        checked={selection.has(s.studentid)}
                        onChange={e => pick([s.studentid], e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <strong className="block break-words text-sm">{s.name}</strong>
                        <span className={muted}>
                          {s.studentid} · {s.classes?.name || 'Unassigned'}
                        </span>
                      </span>
                      {!hasPhone(s) && (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          No phone
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              {!visible.length && (
                <div className="p-4">
                  <p className={muted}>
                    {roster?.error ||
                      (!studentId && !classIds.length
                        ? 'Choose a class to see its students.'
                        : roster?.key !== rosterKey
                          ? 'Loading students…'
                          : students.length
                            ? 'No students match these filters.'
                            : 'No active students available.')}
                  </p>
                  {roster?.error && (
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
                  )}
                </div>
              )}
            </section>
            <div className="min-w-0 space-y-4">
              <section
                id="notice-message"
                aria-labelledby="notice-message-title"
                className={panel + ' scroll-mt-24 overflow-hidden'}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
                  <h2
                    id="notice-message-title"
                    className="flex items-center gap-2 text-lg font-bold"
                  >
                    <MessageSquareText size={19} className="text-indigo-600 dark:text-indigo-400" />
                    Message
                  </h2>
                  <button
                    type="button"
                    className={secondary}
                    disabled={!template.trim()}
                    onClick={draft}
                  >
                    <Sparkles size={16} />
                    {busy === 'draft' ? 'Drafting…' : 'Polish with AI'}
                  </button>
                </div>
                <div className="space-y-3 p-4 sm:p-5">
                  <label className={label}>
                    Notice text
                    <textarea
                      ref={editor}
                      required
                      rows={6}
                      className={field + ' resize-y leading-relaxed'}
                      placeholder="Write a notice for the selected parents…"
                      value={template}
                      onChange={e => setTemplate(e.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={muted}>Insert a placeholder</p>
                    <span className={muted + ' tabular-nums'}>{template.length} characters</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {messageTokens.map(([key, name]) => (
                      <button
                        key={key}
                        type="button"
                        className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-indigo-500 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
                        onClick={() => insertToken(key)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {!!unknown.length && (
                    <Notice error>
                      Unsupported placeholders: {unknown.map(key => '{{' + key + '}}').join(', ')}
                    </Notice>
                  )}
                </div>
              </section>
              <section
                aria-labelledby="notice-preview-title"
                className={panel + ' space-y-3 p-4 sm:p-5'}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2
                    id="notice-preview-title"
                    className="flex items-center gap-2 text-lg font-bold"
                  >
                    <Eye size={19} className="text-indigo-600 dark:text-indigo-400" />
                    Recipient preview
                  </h2>
                  <label className={label + ' min-w-0 max-w-full'}>
                    <span className="sr-only">Preview for</span>
                    <select
                      className={field}
                      value={preview?.studentid || ''}
                      disabled={!selected.length}
                      onChange={e => setPreviewId(e.target.value)}
                    >
                      {!selected.length && <option value="">Select a recipient</option>}
                      {selected.map(s => (
                        <option key={s.studentid} value={s.studentid}>
                          {s.name} · {s.studentid}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
                  {previewText ? (
                    <p className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {previewText}
                    </p>
                  ) : (
                    <p className={muted}>
                      {preview
                        ? 'Write a notice to preview it for this student.'
                        : 'Choose a recipient to preview their message.'}
                    </p>
                  )}
                </div>
              </section>
              <section
                id="notice-delivery"
                aria-labelledby="notice-delivery-title"
                className={panel + ' scroll-mt-24 overflow-hidden'}
              >
                <div className="space-y-3 p-4 sm:p-5">
                  <h2
                    id="notice-delivery-title"
                    className="flex items-center gap-2 text-lg font-bold"
                  >
                    <CalendarClock size={19} className="text-indigo-600 dark:text-indigo-400" />
                    Delivery
                  </h2>
                  <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <legend className="sr-only">Choose delivery mode</legend>
                    {[
                      ['now', 'Queue now'],
                      ['scheduled', 'Schedule for later'],
                    ].map(([value, name]) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${delivery === value ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700'}`}
                      >
                        <input
                          type="radio"
                          name="notice-delivery-mode"
                          value={value}
                          checked={delivery === value}
                          className="accent-indigo-600"
                          onChange={() => {
                            setDelivery(value);
                            if (value === 'scheduled' && !scheduled) setScheduled(pktDateTime(15));
                          }}
                        />
                        {name}
                      </label>
                    ))}
                  </fieldset>
                  {delivery === 'scheduled' && (
                    <label className={label}>
                      Delivery date and time (Pakistan time)
                      <input
                        type="datetime-local"
                        required
                        min={pktDateTime(1)}
                        className={field}
                        value={scheduled}
                        onChange={e => setScheduled(e.target.value)}
                      />
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50 sm:px-5">
                  <div>
                    <p className="text-sm font-semibold">
                      {selected.length} {selected.length === 1 ? 'recipient' : 'recipients'} ·{' '}
                      {deliveryLabel}
                    </p>
                    {missing > 0 && (
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {missing} missing a phone number
                      </p>
                    )}
                  </div>
                  <button type="submit" className={primary} disabled={!canReview}>
                    <Send size={16} />
                    Review notice
                  </button>
                </div>
              </section>
            </div>
          </fieldset>
        </form>
      )}
      <Dialog
        open={review}
        onOpenChange={open => {
          if (!busy) setReview(open);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] rounded-xl">
          <DialogTitle>{delivery === 'scheduled' ? 'Schedule notice' : 'Queue notice'}</DialogTitle>
          <DialogDescription>
            Check the recipients, delivery time and message before adding it to the queue.
          </DialogDescription>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <dt className={muted}>Recipients</dt>
            <dd className="font-semibold">{selected.length}</dd>
            <dt className={muted}>Delivery</dt>
            <dd className="font-semibold">{deliveryLabel}</dd>
          </dl>
          {preview && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className={muted}>Preview for {preview.name}</p>
              <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                {previewText}
              </p>
            </div>
          )}
          <DialogFooter>
            <button className={secondary} disabled={!!busy} onClick={() => setReview(false)}>
              Back to editing
            </button>
            <button className={primary} disabled={!!busy} onClick={queue}>
              {busy === 'queue'
                ? 'Checking and saving…'
                : delivery === 'scheduled'
                  ? 'Schedule notice'
                  : 'Queue notice'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MessagingLayout>
  );
}
