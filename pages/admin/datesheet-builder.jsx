import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import AssessmentNav from '../../components/AssessmentNav';
import { supabase } from '../../utils/supabaseClient';
import { parentMessage, messageDate, rupees } from '../../utils/parentMessages';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  CalendarDays,
  CheckCircle2,
  FileDown,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { downloadDatesheetsPDF } from '../../utils/datesheetPDF';
import { getClassAccess } from '../../utils/classAccess';
import { queueClassTeacherAlerts } from '../../utils/staffNotifications';

import { loadClassSubjects } from '../../utils/subjects';
const today = () => new Date().toISOString().slice(0, 10);
const emptyRow = () => ({ subject: '', test_name: '', date: '' });

export default function DatesheetBuilder() {
  const [classSubjects, setClassSubjects] = useState({});
  const [classes, setClasses] = useState([]),
    [selected, setSelected] = useState([]),
    [rows, setRows] = useState([emptyRow()]);
  const [title, setTitle] = useState('Terminal Examination'),
    [testType, setTestType] = useState('Terminal-1');
  const [invoiceStart, setInvoiceStart] = useState(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    ),
    [invoiceEnd, setInvoiceEnd] = useState(today());
  const [attendanceStart, setAttendanceStart] = useState(invoiceStart),
    [attendanceEnd, setAttendanceEnd] = useState(invoiceEnd),
    [ptmStart, setPtmStart] = useState(''),
    [ptmEnd, setPtmEnd] = useState('');
  const [students, setStudents] = useState([]),
    [batches, setBatches] = useState([]),
    [editingId, setEditingId] = useState(null),
    [messageMode, setMessageMode] = useState('all'),
    [recipientIds, setRecipientIds] = useState([]),
    [showMessageSetup, setShowMessageSetup] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState('');
  const card =
    'rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl';
  const input =
    'w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 rounded-md';
  const label =
    'text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block';
  useEffect(() => {
    (async () => {
      const access = await getClassAccess();
      setClassSubjects(await loadClassSubjects());
      let query = supabase.from('classes').select('id,name').order('id');
      if (access.role === 'teacher') query = query.in('id', access.classIds || []);
      const { data } = await query;
      setClasses(data || []);
      // Choosing classes is deliberate: a new datesheet must never silently include everyone.
      setSelected([]);
      await loadBatches(data || []);
      setLoading(false);
    })().catch(error => {
      setNotice(error.message || 'Unable to load your classes.');
      setLoading(false);
    });
  }, []);
  async function loadBatches(allowedClasses = classes) {
    const { data, error } = await supabase
      .from('datesheet_batches')
      .select(
        'id,title,exam_start_date,exam_end_date,is_active,datesheet_batch_classes(class_id,classes(name))'
      )
      .order('created_at', { ascending: false });
    if (error) throw error;
    const allowed = new Set(allowedClasses.map(c => String(c.id)));
    setBatches(
      (data || []).filter(
        b =>
          b.datesheet_batch_classes.length &&
          b.datesheet_batch_classes.every(c => allowed.has(String(c.class_id)))
      )
    );
  }
  const updateRow = (index, key, value) =>
    setRows(previous => previous.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const toggle = id =>
    setSelected(previous =>
      previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
    );
  const validRows = rows
    .filter(row => row.subject && row.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const scheduleComplete = validRows.length === rows.length && validRows.length > 0;
  const draftReady = Boolean(
    title.trim() &&
      selected.length &&
      scheduleComplete &&
      invoiceStart &&
      invoiceEnd >= invoiceStart &&
      attendanceStart &&
      attendanceEnd >= attendanceStart &&
      (!ptmStart || !ptmEnd || ptmEnd >= ptmStart)
  );
  const resetDraft = () => {
    setEditingId(null);
    setSelected([]);
    setRows([emptyRow()]);
    setTitle('Terminal Examination');
    setTestType('Terminal-1');
    setAttendanceStart(invoiceStart);
    setAttendanceEnd(invoiceEnd);
    setPtmStart('');
    setPtmEnd('');
    setStudents([]);
    setShowMessageSetup(false);
    setNotice('New datesheet ready. Choose classes and add the examination papers.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    setStudents([]);
    setShowMessageSetup(false);
    setRecipientIds([]);
  }, [selected, invoiceStart, invoiceEnd]);
  async function loadStudents() {
    if (!selected.length || !invoiceStart || !invoiceEnd)
      return setNotice('Select classes and an invoice period first.');
    setBusy('preview');
    try {
      const { data: studentRows, error } = await supabase
        .from('active_students')
        .select('studentid,name,fathername,mobilenumber,class_id,classes(name)')
        .in('class_id', selected)
        .order('name');
      if (error) throw error;
      const ids = (studentRows || []).map(item => item.studentid);
      const { data: invoices, error: invoiceError } = ids.length
        ? await supabase
            .from('fee_invoices')
            .select('student_id,total_amount,fee_payments(amount)')
            .in('student_id', ids)
            .gte('invoice_date', invoiceStart)
            .lte('invoice_date', invoiceEnd)
        : { data: [] };
      if (invoiceError) throw invoiceError;
      const balances = new Map();
      (invoices || []).forEach(invoice =>
        balances.set(
          String(invoice.student_id),
          (balances.get(String(invoice.student_id)) || 0) +
            Math.max(
              0,
              Number(invoice.total_amount || 0) -
                (invoice.fee_payments || []).reduce(
                  (sum, payment) => sum + Number(payment.amount || 0),
                  0
                )
            )
        )
      );
      setStudents(
        (studentRows || []).map(student => ({
          ...student,
          className: student.classes?.name || '',
          balance: balances.get(String(student.studentid)) || 0,
        }))
      );
      setRecipientIds((studentRows || []).map(student => student.studentid));
      setNotice(`${studentRows?.length || 0} students loaded with balances.`);
    } catch (error) {
      setNotice(error.message || 'Could not calculate balances.');
    } finally {
      setBusy('');
    }
  }
  async function createTests() {
    if (!selected.length || !validRows.length)
      return setNotice('Add at least one dated subject and select classes.');
    setBusy('tests');
    try {
      if (
        validRows.some(row =>
          selected.some(id => !(classSubjects[id] || []).some(s => s.name === row.subject))
        )
      )
        throw new Error(
          'Each paper subject must be assigned to every selected class. Configure subjects in Timetable, or create separate datesheets for classes with different subjects.'
        );
      if (
        !title.trim() ||
        validRows.length !== rows.length ||
        !invoiceStart ||
        invoiceEnd < invoiceStart ||
        !attendanceStart ||
        attendanceEnd < attendanceStart ||
        (ptmStart && ptmEnd && ptmEnd < ptmStart)
      )
        throw new Error('Complete every paper and check the invoice, attendance and PTM periods.');
      const payload = selected.flatMap(classId => {
        const className = classes.find(item => item.id === classId)?.name || '';
        return validRows.map(row => ({
          ...(editingId && row.ids?.[classId] ? { id: row.ids[classId] } : {}),
          subject: row.subject,
          date: row.date,
          test_name: row.test_name || `${title} – ${row.subject}`,
          test_type: testType,
          class_id: classId,
          class_name: className,
        }));
      });
      const createdTests = [];
      for (const { id, ...paper } of payload.filter(p => p.id)) {
        const { error } = await supabase
          .from('tests')
          .update(paper)
          .eq('id', id)
          .select('id')
          .single();
        if (error) throw error;
        createdTests.push({ id });
      }
      const additions = payload.filter(p => !p.id);
      if (additions.length) {
        const { data, error } = await supabase.from('tests').insert(additions).select('id');
        if (error) throw error;
        createdTests.push(...data);
      }
      const dates = validRows.map(row => row.date).sort();
      const batchData = {
        title,
        exam_start_date: dates[0],
        exam_end_date: dates.at(-1),
        invoice_start_date: invoiceStart,
        invoice_end_date: invoiceEnd,
        attendance_start_date: attendanceStart,
        attendance_end_date: attendanceEnd,
        ptm_start_date: ptmStart || null,
        ptm_end_date: ptmEnd || null,
      };
      let batchId = editingId;
      if (editingId) {
        const { error: updateError } = await supabase
          .from('datesheet_batches')
          .update(batchData)
          .eq('id', editingId);
        if (updateError) throw updateError;
        const [{ error: oldClassesError }, { error: oldTestsError }] = await Promise.all([
          supabase.from('datesheet_batch_classes').delete().eq('batch_id', editingId),
          supabase.from('datesheet_batch_tests').delete().eq('batch_id', editingId),
        ]);
        if (oldClassesError || oldTestsError) throw oldClassesError || oldTestsError;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { data: batch, error: batchError } = await supabase
          .from('datesheet_batches')
          .insert({ ...batchData, created_by: auth.user?.id || null })
          .select('id')
          .single();
        if (batchError) throw batchError;
        batchId = batch.id;
      }
      const [{ error: classesError }, { error: testsError }] = await Promise.all([
        supabase
          .from('datesheet_batch_classes')
          .insert(selected.map(class_id => ({ batch_id: batchId, class_id }))),
        supabase
          .from('datesheet_batch_tests')
          .insert((createdTests || []).map(test => ({ batch_id: batchId, test_id: test.id }))),
      ]);
      if (classesError || testsError) throw classesError || testsError;
      let alerts = 0;
      let alertFailed = false;
      if (!editingId) {
        const classNames = classes
          .filter(item => selected.map(String).includes(String(item.id)))
          .map(item => item.name)
          .join(', ');
        try {
          alerts = await queueClassTeacherAlerts(
            selected,
            teacher =>
              `*New Datesheet Created*\n\nDear ${teacher.name || 'Teacher'}, a datesheet has been created for your assigned class(es).\n\n*${title}*\nClasses: ${classNames || 'Assigned classes'}\nExams: ${dates[0]} to ${dates.at(-1)}\n\nPlease sign in to review the schedule.`
          );
        } catch (error) {
          console.error('Unable to queue datesheet alerts:', error);
          alertFailed = true;
        }
      }
      await loadBatches();
      await loadBatch({ id: batchId });
      setNotice(
        editingId
          ? 'Datesheet updated. Existing papers retain their marks.'
          : `${payload.length} tests created and datesheet saved as inactive. ${alertFailed ? 'Teacher alerts could not be queued.' : `${alerts} teacher alert${alerts === 1 ? '' : 's'} queued.`} Activate it below when ready for parents.`
      );
    } catch (error) {
      setNotice(error.message || 'Unable to create tests.');
    } finally {
      setBusy('');
    }
  }
  async function loadBatch(batch, reuse = false) {
    setBusy(`load-${batch.id}`);
    try {
      const { data, error } = await supabase
        .from('datesheet_batches')
        .select(
          'id,title,exam_start_date,exam_end_date,invoice_start_date,invoice_end_date,attendance_start_date,attendance_end_date,ptm_start_date,ptm_end_date,datesheet_batch_classes(class_id),datesheet_batch_tests(tests(id,class_id,subject,test_name,date,test_type))'
        )
        .eq('id', batch.id)
        .single();
      if (error) throw error;
      const unique = new Map();
      (data.datesheet_batch_tests || []).forEach(row => {
        const test = row.tests;
        if (!test) return;
        const key = JSON.stringify([test.subject, test.test_name, test.date]);
        const paper = unique.get(key) || { ...test, ids: {} };
        paper.ids[test.class_id] = test.id;
        unique.set(key, paper);
      });
      setTitle(reuse ? `${data.title} (copy)` : data.title);
      setInvoiceStart(data.invoice_start_date);
      setInvoiceEnd(data.invoice_end_date);
      setAttendanceStart(
        data.attendance_start_date || data.exam_start_date || data.invoice_start_date
      );
      setAttendanceEnd(data.attendance_end_date || data.exam_end_date || data.invoice_end_date);
      setPtmStart(data.ptm_start_date || '');
      setPtmEnd(data.ptm_end_date || '');
      const scheduled = [...unique.values()];
      setSelected((data.datesheet_batch_classes || []).map(row => row.class_id));
      setRows(
        (scheduled.length ? scheduled : [emptyRow()]).map(test => ({
          subject: test.subject,
          ids: reuse ? {} : test.ids,
          test_name: test.test_name,
          date: test.date,
        }))
      );
      setTestType(scheduled[0]?.test_type || 'Terminal-1');
      setEditingId(reuse ? null : data.id);
      setNotice(
        reuse
          ? 'Datesheet loaded as a new inactive copy. Adjust it and create when ready.'
          : 'Datesheet loaded for update. Existing papers keep their marks; papers removed from this schedule remain safely available as standalone tests.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setNotice(error.message || 'Unable to load datesheet.');
    } finally {
      setBusy('');
    }
  }
  async function toggleBatch(batch) {
    setBusy(`batch-${batch.id}`);
    try {
      const { error } = await supabase
        .from('datesheet_batches')
        .update({ is_active: !batch.is_active })
        .eq('id', batch.id);
      if (error) throw error;
      await loadBatches();
      setNotice(
        `${batch.title} is now ${batch.is_active ? 'hidden from parents' : 'active for parents'}.`
      );
    } catch (error) {
      setNotice(error.message || 'Unable to update datesheet visibility.');
    } finally {
      setBusy('');
    }
  }
  async function pdf() {
    if (!students.length) return setNotice('Load students and balances first.');
    setBusy('pdf');
    try {
      await downloadDatesheetsPDF({
        title,
        schedule: validRows,
        students,
        invoiceStart,
        invoiceEnd,
      });
    } catch (error) {
      setNotice(error.message || 'Could not generate PDF.');
    } finally {
      setBusy('');
    }
  }
  function chooseRecipients(mode) {
    setMessageMode(mode);
    if (mode === 'all') setRecipientIds(students.map(student => student.studentid));
    if (mode === 'clear')
      setRecipientIds(
        students.filter(student => Number(student.balance) <= 0).map(student => student.studentid)
      );
    if (mode === 'pending')
      setRecipientIds(
        students.filter(student => Number(student.balance) > 0).map(student => student.studentid)
      );
  }
  function toggleRecipient(id) {
    setRecipientIds(previous =>
      previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
    );
  }
  async function messageParents() {
    const recipients = students.filter(student => recipientIds.includes(student.studentid));
    if (!recipients.length) return setNotice('Choose at least one recipient first.');
    setBusy('messages');
    try {
      if (!validRows.length || rows.length !== validRows.length)
        throw new Error('Complete the exam schedule before preparing notices.');
      const schedule = validRows.map(row => `${row.subject} — ${messageDate(row.date)}`).join('\n');
      const payload = recipients
        .filter(student => student.mobilenumber)
        .map(student => ({
          student_id: student.studentid,
          class_id: student.class_id,
          number: student.mobilenumber,
          sent: false,
          text: parentMessage(
            'Examination datesheet',
            [
              `Student: ${student.name} · ${student.className}`,
              `Examination: ${title}`,
              '',
              '*Exam schedule*',
              schedule,
              `Outstanding fees for the selected period: ${rupees(student.balance)}`,
            ],
            'Please arrive on time with the required stationery. For exam or fee queries, contact the school office.'
          ),
        }));
      if (!payload.length) throw new Error('None of the selected students has a mobile number.');
      const { error } = await supabase.from('messages').insert(payload);
      if (error) throw error;
      setNotice(
        `${payload.length} professional datesheet notice${payload.length === 1 ? '' : 's'} queued.${recipients.length - payload.length ? ` ${recipients.length - payload.length} skipped because no mobile number is recorded.` : ''}`
      );
      setShowMessageSetup(false);
    } catch (error) {
      setNotice(error.message || 'Unable to queue messages.');
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100">
      <Navbar />
      <main className="container mx-auto max-w-6xl p-4 md:p-8 space-y-6">
        <AssessmentNav />
        <div className="flex justify-end">
          <Link href="/rechecking" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-950 dark:text-indigo-300">
            Open rechecking control centre
          </Link>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-6 text-white shadow-xl shadow-indigo-500/20 md:p-8">
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-200">
              Examination workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Datesheet builder
            </h1>
            <p className="mt-3 text-sm leading-6 text-indigo-100">
              Plan a multi-class examination, publish it only when ready, then reuse the same
              schedule next term without starting from scratch.
            </p>
          </div>
          <div className="pointer-events-none absolute -right-10 -top-14 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
          {editingId && (
            <div className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
              <CalendarDays className="h-3.5 w-3.5" />
              Editing saved datesheet #{editingId}
              <button onClick={() => setEditingId(null)} className="underline">
                Create new instead
              </button>
            </div>
          )}
        </div>
        {notice && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            {notice}
          </div>
        )}
        <section className={`${card} overflow-hidden`}>
          <div className="grid divide-y divide-gray-100 dark:divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              ['1', 'Choose classes', selected.length ? `${selected.length} selected` : 'Required'],
              ['2', 'Add papers', scheduleComplete ? `${validRows.length} ready` : 'Required'],
              ['3', 'Save & share', editingId ? 'Updating saved draft' : 'Publish when ready'],
            ].map(([step, name, status], index) => {
              const done = index === 0 ? selected.length : index === 1 ? scheduleComplete : false;
              return (
                <div key={step} className="flex items-center gap-3 px-5 py-4">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'}`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : step}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className={`${card} p-5 grid grid-cols-1 gap-4 md:grid-cols-3`}>
          <div>
            <label className={label}>Datesheet title</label>
            <Input className={input} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={label}>Test type</label>
            <select
              className={`${input} h-10 px-3`}
              value={testType}
              onChange={e => setTestType(e.target.value)}
            >
              {['Midterm-1', 'Midterm-2', 'Terminal-1', 'Terminal-2', 'Monthly'].map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Invoice date range</label>
            <div className="flex gap-2">
              <Input
                type="date"
                className={input}
                value={invoiceStart}
                onChange={e => setInvoiceStart(e.target.value)}
              />
              <Input
                type="date"
                className={input}
                value={invoiceEnd}
                onChange={e => setInvoiceEnd(e.target.value)}
              />
            </div>
          </div>
        </section>
        <section className={`${card} p-5`}>
          <div className="mb-4">
            <h2 className="font-semibold">Linked review windows</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Save the attendance period and optional parent-meeting period with this datesheet so
              reports and result cards use the same academic context.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
              <label className={label}>Attendance duration</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  className={input}
                  value={attendanceStart}
                  onChange={e => setAttendanceStart(e.target.value)}
                />
                <Input
                  type="date"
                  className={input}
                  value={attendanceEnd}
                  onChange={e => setAttendanceEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-500/20 dark:bg-violet-500/5">
              <label className={label}>
                PTM duration <span className="normal-case font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  className={input}
                  value={ptmStart}
                  onChange={e => setPtmStart(e.target.value)}
                />
                <Input
                  type="date"
                  className={input}
                  value={ptmEnd}
                  onChange={e => setPtmEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>
        <section className={`${card} p-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <label className={label}>Classes included</label>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Only the selected classes receive these papers.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSelected(selected.length === classes.length ? [] : classes.map(item => item.id))
              }
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300"
            >
              {classes.length && selected.length === classes.length
                ? 'Clear selection'
                : 'Select all available'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {classes.map(item => (
              <label
                key={item.id}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${selected.includes(item.id) ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-200 dark:border-white/10'}`}
              >
                <input
                  className="sr-only"
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                />
                {item.name}
              </label>
            ))}
          </div>
        </section>
        <section className={card}>
          <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-white/10">
            <div>
              <h2 className="font-semibold">Exam schedule</h2>
              <p className="text-sm text-gray-500">
                Each paper is created for every selected class.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`hidden text-xs font-semibold sm:inline ${scheduleComplete ? 'text-emerald-600' : 'text-gray-400'}`}
              >
                {validRows.length}/{rows.length} complete
              </span>
              <Button size="sm" onClick={() => setRows(previous => [...previous, emptyRow()])}>
                <Plus className="mr-1 h-4 w-4" />
                Add paper
              </Button>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-white/5">
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-12">
                <select
                  className={`${input} h-10 px-3 md:col-span-3`}
                  value={row.subject}
                  onChange={e => updateRow(index, 'subject', e.target.value)}
                >
                  <option value="">Subject…</option>
                  {(selected.length
                    ? (classSubjects[selected[0]] || [])
                        .map(s => s.name)
                        .filter(name =>
                          selected.every(id => (classSubjects[id] || []).some(s => s.name === name))
                        )
                    : []
                  ).map(subject => (
                    <option key={subject}>{subject}</option>
                  ))}
                </select>
                <Input
                  className={`md:col-span-5 ${input}`}
                  placeholder="Test name (optional)"
                  value={row.test_name}
                  onChange={e => updateRow(index, 'test_name', e.target.value)}
                />
                <Input
                  type="date"
                  className={`md:col-span-3 ${input}`}
                  value={row.date}
                  onChange={e => updateRow(index, 'date', e.target.value)}
                />
                <Button
                  variant="ghost"
                  className="md:col-span-1 text-red-500"
                  disabled={rows.length === 1}
                  onClick={() => setRows(previous => previous.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>
        <section
          className={`${card} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}
        >
          <div>
            <p className="font-semibold">Ready to save?</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Save the timetable first. Parent PDFs and notices are prepared afterwards.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editingId && (
              <Button variant="outline" onClick={resetDraft} disabled={!!busy}>
                <RotateCcw className="mr-2 h-4 w-4" /> New datesheet
              </Button>
            )}
            <Button
              onClick={createTests}
              disabled={!!busy || !draftReady}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {busy === 'tests' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {editingId ? 'Update datesheet & tests' : 'Create datesheet & tests'}
            </Button>
          </div>
        </section>
        <section className={`${card} p-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-600" />
                <h2 className="font-semibold">Parent pack</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                Load active students and balances once, then download PDFs or queue notices.
              </p>
            </div>
            <Button variant="outline" onClick={loadStudents} disabled={!!busy || !editingId}>
              {busy === 'preview' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarDays className="mr-2 h-4 w-4" />
              )}
              {students.length ? 'Refresh parent pack' : 'Prepare parent pack'}
            </Button>
          </div>
          {students.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
              <Button variant="outline" onClick={pdf} disabled={!!busy || !students.length}>
                <FileDown className="mr-2 h-4 w-4" />
                PDF datesheets
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowMessageSetup(true)}
                disabled={!!busy || !students.length}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Prepare parent messages
              </Button>
              <span className="self-center text-sm text-gray-500">
                {students.length} active student{students.length === 1 ? '' : 's'} loaded
              </span>
            </div>
          )}
        </section>
        {showMessageSetup && students.length > 0 && (
          <section className={`${card} overflow-hidden`}>
            <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white p-5 dark:border-white/10 dark:from-blue-950/20 dark:to-transparent">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-semibold">Parent message recipients</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    Choose who receives the datesheet notice. Balances are shown before messages are
                    queued.
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setShowMessageSetup(false)}>
                  Close
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                {[
                  ['all', 'All students'],
                  ['clear', 'All clear'],
                  ['pending', 'All pending'],
                  ['custom', 'Choose students'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => chooseRecipients(mode)}
                    className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${messageMode === mode ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200'}`}
                  >
                    <span className="block text-xs opacity-75">
                      {mode === 'all'
                        ? students.length
                        : mode === 'clear'
                          ? students.filter(s => Number(s.balance) <= 0).length
                          : mode === 'pending'
                            ? students.filter(s => Number(s.balance) > 0).length
                            : recipientIds.length}{' '}
                      recipients
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-80 overflow-auto divide-y divide-gray-100 dark:divide-white/5">
              {students
                .filter(
                  student =>
                    messageMode === 'custom' ||
                    messageMode === 'all' ||
                    (messageMode === 'clear'
                      ? Number(student.balance) <= 0
                      : Number(student.balance) > 0)
                )
                .map(student => (
                  <label
                    key={student.studentid}
                    className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/[.02]"
                  >
                    <input
                      type="checkbox"
                      checked={recipientIds.includes(student.studentid)}
                      onChange={() => toggleRecipient(student.studentid)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {student.name}{' '}
                        <span className="text-sm font-normal text-gray-500">
                          · {student.className}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {student.mobilenumber || 'No mobile number'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(student.balance) > 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}
                    >
                      Rs. {Number(student.balance).toLocaleString('en-PK')}
                    </span>
                  </label>
                ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
              <p className="text-sm text-gray-500">
                {recipientIds.length} selected · Notices are queued, not sent immediately.
              </p>
              <Button
                onClick={messageParents}
                disabled={!!busy || !recipientIds.length}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {busy === 'messages' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="mr-2 h-4 w-4" />
                )}
                Queue selected notices
              </Button>
            </div>
          </section>
        )}
        <section className={card}>
          <div className="p-4 border-b border-gray-200 dark:border-white/10">
            <h2 className="font-semibold">Saved datesheets</h2>
            <p className="text-sm text-gray-500">
              Activate a saved datesheet to show it to parents in the datesheets portal.
            </p>
          </div>
          {batches.length ? (
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {batches.map(batch => (
                <div
                  key={batch.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{batch.title}</p>
                    <p className="text-sm text-gray-500">
                      {batch.exam_start_date} — {batch.exam_end_date} ·{' '}
                      {(batch.datesheet_batch_classes || [])
                        .map(row => row.classes?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={batch.is_active ? 'outline' : 'default'}
                    disabled={!!busy}
                    onClick={() => toggleBatch(batch)}
                    className={
                      batch.is_active
                        ? 'border-emerald-300 text-emerald-700 dark:text-emerald-300'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }
                  >
                    {busy === `batch-${batch.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : batch.is_active ? (
                      'Active · hide'
                    ) : (
                      'Make active'
                    )}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => loadBatch(batch)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => loadBatch(batch, true)}
                    >
                      Reuse
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-6 text-sm text-gray-500">
              Saved datesheets will appear after you create the tests.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
