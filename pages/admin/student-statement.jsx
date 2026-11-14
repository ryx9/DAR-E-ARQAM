'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Navbar from '../../components/Navbar';
import Loader from '../../components/Loader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { supabase } from '../../utils/supabaseClient';
import { downloadStatementCsv, downloadStatementPdf } from '../../utils/studentStatementReport';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  Download,
  FileDown,
  FileText,
  Search,
  Users,
} from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

const localDate = date =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const money = value =>
  `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const formatDate = value =>
  value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default function StudentStatementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const now = new Date();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [classId, setClassId] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [query, setQuery] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statements, setStatements] = useState([]);
  const [range, setRange] = useState({
    start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: localDate(now),
  });

  useEffect(() => {
    supabase
      .from('classes')
      .select('id, name')
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (error)
          toast({
            title: 'Could not load classes',
            description: error.message,
            variant: 'destructive',
          });
        else setClasses(data || []);
      });
  }, [toast]);

  const loadStudents = async id => {
    setClassId(id);
    setStudents([]);
    setSelectedIds(new Set());
    setStatements([]);
    setQuery('');
    if (!id) return;
    setLoadingStudents(true);
    const { data, error } = await supabase
      .from('active_students')
      .select('studentid, name, fathername, class_id')
      .eq('class_id', id)
      .order('name', { ascending: true });
    setLoadingStudents(false);
    if (error)
      toast({
        title: 'Could not load students',
        description: error.message,
        variant: 'destructive',
      });
    else setStudents(data || []);
  };

  const visibleStudents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return !term
      ? students
      : students.filter(s =>
          `${s.name} ${s.fathername || ''} ${s.studentid}`.toLowerCase().includes(term)
        );
  }, [students, query]);
  const toggle = id =>
    setSelectedIds(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleVisible = () =>
    setSelectedIds(current => {
      const next = new Set(current);
      const allSelected =
        visibleStudents.length > 0 && visibleStudents.every(s => next.has(s.studentid));
      visibleStudents.forEach(s =>
        allSelected ? next.delete(s.studentid) : next.add(s.studentid)
      );
      return next;
    });

  const generate = async () => {
    if (!classId || !selectedIds.size)
      return toast({
        title: 'Select at least one student',
        description: 'Choose a class, then select the students for the statement.',
        variant: 'destructive',
      });
    if (!range.start || !range.end || range.start > range.end)
      return toast({ title: 'Choose a valid invoice date range', variant: 'destructive' });
    setGenerating(true);
    try {
      const ids = Array.from(selectedIds);
      const { data: invoices, error } = await supabase
        .from('fee_invoices')
        .select(
          `
        id, student_id, invoice_date, due_date, total_amount, status,
        fee_invoice_details ( id, fee_type, description, amount ),
        fee_payments ( id, invoice_detail_id, amount, paid_at, payment_method, notes )
      `
        )
        .in('student_id', ids)
        .lte('invoice_date', range.end)
        .order('invoice_date', { ascending: true });
      if (error) throw error;
      const selectedClass = classes.find(item => String(item.id) === String(classId));
      const statementsByStudent = ids.map(studentId => {
        const student = students.find(item => String(item.studentid) === String(studentId));
        const months = new Map();
        const studentInvoices = (invoices || []).filter(
          invoice => String(invoice.student_id) === String(studentId)
        );
        const historyInvoices = studentInvoices.filter(
          invoice => String(invoice.invoice_date).slice(0, 10) >= range.start
        );
        historyInvoices.forEach(invoice => {
          const monthKey = String(invoice.invoice_date).slice(0, 7);
          if (!months.has(monthKey))
            months.set(monthKey, {
              key: monthKey,
              label: new Date(`${monthKey}-01T12:00:00`).toLocaleDateString('en-PK', {
                month: 'long',
                year: 'numeric',
              }),
              items: [],
            });
          const allPayments = (invoice.fee_payments || []).sort(
            (a, b) => new Date(a.paid_at) - new Date(b.paid_at)
          );
          const details = invoice.fee_invoice_details || [];
          const detailIds = new Set(details.map(detail => String(detail.id)));
          details.forEach(detail => {
            const payments = allPayments.filter(
              payment => String(payment.invoice_detail_id) === String(detail.id)
            );
            const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            months.get(monthKey).items.push({
              invoiceId: invoice.id,
              invoiceDate: invoice.invoice_date,
              dueDate: invoice.due_date,
              feeType: detail.fee_type || 'Fee item',
              description: detail.description,
              amount: Number(detail.amount || 0),
              payments: payments.map(payment => ({
                amount: Number(payment.amount || 0),
                paidAt: payment.paid_at,
                method: payment.payment_method,
                notes: payment.notes,
              })),
              paid,
              balance: Number(detail.amount || 0) - paid,
            });
          });
          const unallocated = allPayments.filter(
            payment =>
              !payment.invoice_detail_id || !detailIds.has(String(payment.invoice_detail_id))
          );
          if (unallocated.length) {
            const paid = unallocated.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            months.get(monthKey).items.push({
              invoiceId: invoice.id,
              invoiceDate: invoice.invoice_date,
              dueDate: invoice.due_date,
              feeType: 'Unallocated payment',
              description: 'Payment recorded against the invoice without a fee-item allocation.',
              amount: 0,
              payments: unallocated.map(payment => ({
                amount: Number(payment.amount || 0),
                paidAt: payment.paid_at,
                method: payment.payment_method,
                notes: payment.notes,
              })),
              paid,
              balance: -paid,
            });
          }
          const detailTotal = details.reduce((sum, detail) => sum + Number(detail.amount || 0), 0);
          const invoiceAdjustment = Number(invoice.total_amount || 0) - detailTotal;
          if (Math.abs(invoiceAdjustment) > 0.009) {
            months.get(monthKey).items.push({
              invoiceId: invoice.id,
              invoiceDate: invoice.invoice_date,
              dueDate: invoice.due_date,
              feeType: 'Invoice reconciliation',
              description: 'Difference between the saved invoice total and its fee-item total.',
              amount: invoiceAdjustment,
              payments: [],
              paid: 0,
              balance: invoiceAdjustment,
            });
          }
        });
        const monthList = Array.from(months.values()).map(month => ({
          ...month,
          totals: month.items.reduce(
            (total, item) => ({
              invoiced: total.invoiced + item.amount,
              paid: total.paid + item.paid,
              balance: total.balance + item.balance,
            }),
            { invoiced: 0, paid: 0, balance: 0 }
          ),
        }));
        const activity = monthList.reduce(
          (total, month) => ({
            invoiced: total.invoiced + month.totals.invoiced,
            paid: total.paid + month.totals.paid,
          }),
          { invoiced: 0, paid: 0 }
        );
        const currentInvoice = [...studentInvoices]
          .filter(invoice => invoice.status !== 'expired')
          .sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date))[0];
        const currentPaid = (currentInvoice?.fee_payments || []).reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );
        const currentOutstanding = currentInvoice
          ? Math.max(0, Number(currentInvoice.total_amount || 0) - currentPaid)
          : 0;
        return {
          student: { ...student, className: selectedClass?.name || '—' },
          months: monthList,
          totals: { ...activity, balance: currentOutstanding },
          currentInvoice: currentInvoice
            ? {
                id: currentInvoice.id,
                invoiceDate: currentInvoice.invoice_date,
                total: Number(currentInvoice.total_amount || 0),
                paid: currentPaid,
                outstanding: currentOutstanding,
              }
            : null,
        };
      });
      setStatements(statementsByStudent);
      toast({
        title: 'Student statement generated',
        description: `${statementsByStudent.length} student${statementsByStudent.length === 1 ? '' : 's'} included.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Could not generate statement',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="mb-8 flex items-start gap-4">
            <Button
              variant="outline"
              size="icon"
              className="mt-1 rounded-full border-slate-200 dark:border-slate-700 dark:bg-slate-900"
              onClick={() => router.push('/admin/report')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Student Fee Statement</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                A line-by-line record of invoices and payments for selected students.
              </p>
            </div>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end">
              <div>
                <Label>Class</Label>
                <select
                  value={classId}
                  onChange={event => loadStudents(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Select class</option>
                  {classes.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.id} — {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Invoice date from</Label>
                <Input
                  type="date"
                  value={range.start}
                  onChange={event => setRange(value => ({ ...value, start: event.target.value }))}
                  className="mt-1 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <Label>Invoice date to</Label>
                <Input
                  type="date"
                  value={range.end}
                  onChange={event => setRange(value => ({ ...value, end: event.target.value }))}
                  className="mt-1 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <Button
                onClick={generate}
                disabled={generating}
                className="h-10 rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-500"
              >
                {generating ? (
                  'Generating…'
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate statement
                  </>
                )}
              </Button>
            </div>
            {classId && (
              <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      Students{' '}
                      <span className="font-normal text-slate-500">
                        ({selectedIds.size} selected)
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Select one or more students from this class.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search student"
                        className="h-9 w-56 pl-9 dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={toggleVisible}
                      className="h-9 rounded-xl border-slate-200 dark:border-slate-700"
                    >
                      <CheckSquare className="mr-2 h-4 w-4" />
                      Select shown
                    </Button>
                  </div>
                </div>
                {loadingStudents ? (
                  <Loader small />
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500 dark:bg-slate-800">
                        <tr>
                          <th className="w-12 p-3"></th>
                          <th className="p-3">Student</th>
                          <th className="p-3">Father / Guardian</th>
                          <th className="p-3">Student ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleStudents.map(student => (
                          <tr
                            key={student.studentid}
                            className="border-t border-slate-100 dark:border-slate-800"
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(student.studentid)}
                                onChange={() => toggle(student.studentid)}
                              />
                            </td>
                            <td className="p-3 font-medium">{student.name}</td>
                            <td className="p-3 text-slate-500">{student.fathername || '—'}</td>
                            <td className="p-3 text-slate-500">{student.studentid}</td>
                          </tr>
                        ))}
                        {!visibleStudents.length && (
                          <tr>
                            <td colSpan="4" className="p-8 text-center text-slate-500">
                              No students found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
          {statements.length > 0 && (
            <section className="mt-6">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-bold">Statement preview</h2>
                  <p className="text-sm text-slate-500">
                    Invoice period: {formatDate(range.start)} to {formatDate(range.end)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => downloadStatementCsv(statements, range)}
                    className="rounded-xl border-slate-200 dark:border-slate-700"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                  <Button
                    onClick={() => downloadStatementPdf(statements, range)}
                    className="rounded-xl bg-slate-800 text-white hover:bg-slate-700"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
              {statements.map(statement => (
                <article
                  key={statement.student.studentid}
                  className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
                    <div>
                      <h3 className="font-bold">{statement.student.name}</h3>
                      <p className="text-sm text-slate-500">
                        {statement.student.studentid} · {statement.student.className} ·{' '}
                        {statement.student.fathername || 'Father / guardian not recorded'}
                      </p>
                      {statement.currentInvoice && (
                        <p className="mt-1 text-xs text-slate-500">
                          Outstanding based on current invoice #{statement.currentInvoice.id},
                          issued {formatDate(statement.currentInvoice.invoiceDate)}.
                        </p>
                      )}
                    </div>
                    {statement.currentInvoice && (
                      <div className="text-right text-sm">
                        <p className="text-slate-500">Outstanding at end date</p>
                        <b className="text-xl text-rose-600 dark:text-rose-400">
                          {money(statement.currentInvoice.outstanding)}
                        </b>
                      </div>
                    )}
                  </header>
                  {statement.months.length ? (
                    statement.months.map(month => (
                      <div
                        key={month.key}
                        className="border-b border-slate-200 last:border-b-0 dark:border-slate-800"
                      >
                        <div className="flex flex-col justify-between gap-2 bg-slate-100 px-5 py-3 text-sm font-semibold sm:flex-row dark:bg-slate-800">
                          <span>{month.label}</span>
                          <span className="text-slate-500">
                            Invoiced {money(month.totals.invoiced)} · Paid{' '}
                            {money(month.totals.paid)} · Invoice balances{' '}
                            {money(month.totals.balance)}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-[1000px] w-full text-left text-xs">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="p-3">Invoice</th>
                                <th className="p-3">Issued / Due</th>
                                <th className="p-3">Fee item</th>
                                <th className="p-3 text-right">Amount</th>
                                <th className="p-3">Payment date</th>
                                <th className="p-3">Method</th>
                                <th className="p-3">Note</th>
                                <th className="p-3 text-right">Paid</th>
                                <th className="p-3 text-right">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {month.items.flatMap(item =>
                                item.payments.length ? (
                                  item.payments.map((payment, index) => (
                                    <tr
                                      key={`${item.invoiceId}-${payment.paidAt}-${index}`}
                                      className="border-t border-slate-100 dark:border-slate-800"
                                    >
                                      <td className="p-3">{index === 0 ? item.invoiceId : ''}</td>
                                      <td className="p-3">
                                        {index === 0 ? (
                                          <>
                                            {formatDate(item.invoiceDate)}
                                            <br />
                                            <span className="text-slate-500">
                                              Due {formatDate(item.dueDate)}
                                            </span>
                                          </>
                                        ) : (
                                          ''
                                        )}
                                      </td>
                                      <td className="p-3">
                                        {index === 0 ? (
                                          <>
                                            <b>{item.feeType}</b>
                                            {item.description && (
                                              <>
                                                <br />
                                                <span className="text-slate-500">
                                                  {item.description}
                                                </span>
                                              </>
                                            )}
                                          </>
                                        ) : (
                                          ''
                                        )}
                                      </td>
                                      <td className="p-3 text-right">
                                        {index === 0 ? money(item.amount) : ''}
                                      </td>
                                      <td className="p-3">{formatDate(payment.paidAt)}</td>
                                      <td className="p-3 uppercase">{payment.method || 'cash'}</td>
                                      <td className="p-3 text-slate-500">{payment.notes || '—'}</td>
                                      <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">
                                        {money(payment.amount)}
                                      </td>
                                      <td className="p-3 text-right">
                                        {index === 0 ? money(item.balance) : ''}
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr
                                    key={`${item.invoiceId}-${item.feeType}`}
                                    className="border-t border-slate-100 dark:border-slate-800"
                                  >
                                    <td className="p-3">{item.invoiceId}</td>
                                    <td className="p-3">
                                      {formatDate(item.invoiceDate)}
                                      <br />
                                      <span className="text-slate-500">
                                        Due {formatDate(item.dueDate)}
                                      </span>
                                    </td>
                                    <td className="p-3">
                                      <b>{item.feeType}</b>
                                      {item.description && (
                                        <>
                                          <br />
                                          <span className="text-slate-500">{item.description}</span>
                                        </>
                                      )}
                                    </td>
                                    <td className="p-3 text-right">{money(item.amount)}</td>
                                    <td className="p-3">—</td>
                                    <td className="p-3">—</td>
                                    <td className="p-3">—</td>
                                    <td className="p-3 text-right">—</td>
                                    <td className="p-3 text-right">{money(item.balance)}</td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="p-8 text-center text-sm text-slate-500">
                      No invoices were issued for this student in the selected period.
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
