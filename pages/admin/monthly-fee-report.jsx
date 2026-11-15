import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Navbar from '../../components/Navbar';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { supabase } from '../../utils/supabaseClient';
import { useToast } from '../../hooks/use-toast';
import {
  downloadMonthlyFeePdf,
  monthLabel,
  monthsBetween,
  paymentAgeGroups,
} from '../../utils/monthlyFeeReport';

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
async function paginate(build) {
  let rows = [],
    offset = 0;
  while (true) {
    const { data, error } = await build().range(offset, offset + 999);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) return rows;
    offset += 1000;
  }
}

export default function MonthlyFeeReport() {
  const router = useRouter(),
    { toast } = useToast();
  const [classes, setClasses] = useState([]),
    [classId, setClassId] = useState('all');
  const [start, setStart] = useState(`${today().slice(0, 7)}-01`),
    [end, setEnd] = useState(today());
  const [report, setReport] = useState(null),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    supabase
      .from('classes')
      .select('id, name')
      .order('id')
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

  const generate = async () => {
    if (!start || !end || start > end)
      return toast({ title: 'Choose a valid date range', variant: 'destructive' });
    const months = monthsBetween(start, end);
    if (months.length > 36)
      return toast({ title: 'Choose a period of 36 months or less', variant: 'destructive' });
    setLoading(true);
    setReport(null);
    try {
      const selectedClasses =
        classId === 'all' ? classes : classes.filter(c => String(c.id) === classId);
      const ids = selectedClasses.map(c => c.id);
      if (!ids.length) throw new Error('No classes available.');
      const students = await paginate(() =>
        supabase
          .from('active_students')
          .select('studentid, name, fathername, class_id')
          .in('class_id', ids)
          .order('studentid')
      );
      const rows = students.map(s => ({ ...s, months: {} }));
      const byId = new Map(rows.map(s => [String(s.studentid), s]));
      const studentIds = rows.map(s => s.studentid);
      for (let i = 0; i < studentIds.length; i += 150) {
        const chunk = studentIds.slice(i, i + 150);
        const paymentHistory = await paginate(() =>
          supabase
            .from('fee_payments')
            .select('id, paid_at, fee_invoices!inner(student_id)')
            .in('fee_invoices.student_id', chunk)
            .lt(
              'paid_at',
              new Date(new Date(`${end}T00:00:00+05:00`).getTime() + 86400000).toISOString()
            )
            .order('id')
        );
        paymentHistory.forEach(payment => {
          const inv = Array.isArray(payment.fee_invoices)
            ? payment.fee_invoices[0]
            : payment.fee_invoices;
          const row = byId.get(String(inv?.student_id));
          if (
            row &&
            payment.paid_at &&
            (!row.lastPaymentAt || new Date(payment.paid_at) > new Date(row.lastPaymentAt))
          )
            row.lastPaymentAt = payment.paid_at;
        });
        const invoices = await paginate(() =>
          supabase
            .from('fee_invoices')
            .select('id, student_id, invoice_date, total_amount')
            .in('student_id', chunk)
            .gte('invoice_date', start)
            .lte('invoice_date', end)
            .order('id')
        );
        invoices.forEach(inv => {
          const row = byId.get(String(inv.student_id));
          if (!row) return;
          const key = String(inv.invoice_date).slice(0, 7);
          row.months[key] ||= {};
          row.months[key].invoice = (row.months[key].invoice || 0) + Number(inv.total_amount || 0);
        });
        const payments = await paginate(() =>
          supabase
            .from('fee_payments')
            .select('id, paid_at, amount, fee_invoices!inner(student_id)')
            .in('fee_invoices.student_id', chunk)
            .gte('paid_at', `${start}T00:00:00+05:00`)
            .lt(
              'paid_at',
              new Date(new Date(`${end}T00:00:00+05:00`).getTime() + 86400000).toISOString()
            )
            .order('id')
        );
        payments.forEach(payment => {
          const inv = Array.isArray(payment.fee_invoices)
            ? payment.fee_invoices[0]
            : payment.fee_invoices;
          const row = byId.get(String(inv?.student_id));
          if (!row || !payment.paid_at) return;
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Karachi',
            year: 'numeric',
            month: '2-digit',
          }).formatToParts(new Date(payment.paid_at));
          const key = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
          row.months[key] ||= {};
          row.months[key].payment = (row.months[key].payment || 0) + Number(payment.amount || 0);
        });
      }
      setReport({ rows, months, classes: selectedClasses, start, end });
    } catch (error) {
      toast({
        title: 'Could not generate report',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:p-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <div>
            <button
              onClick={() => router.push('/admin/report')}
              className="mb-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400"
            >
              ← Fee reports
            </button>
            <h1 className="text-2xl font-bold">Monthly Fee Overview</h1>
            <p className="mt-1 text-sm text-slate-500">
              Compare each student's invoices and payments across the selected months.
            </p>
          </div>
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4">
            <label className="text-sm font-medium">
              Class
              <select
                value={classId}
                onChange={e => setClassId(e.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="all">All classes</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              From
              <Input
                className="mt-2 dark:bg-slate-800"
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              To
              <Input
                className="mt-2 dark:bg-slate-800"
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
              />
            </label>
            <Button
              className="self-end bg-indigo-600 text-white hover:bg-indigo-700"
              disabled={loading}
              onClick={generate}
            >
              {loading ? 'Generating…' : 'Generate report'}
            </Button>
          </section>
          {report && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Invoices use invoice date; payments use payment date. Invoices may include carried
                  balances. “—” means no record.
                </p>
                <Button
                  variant="outline"
                  disabled={!report.rows.length}
                  onClick={() => downloadMonthlyFeePdf(report)}
                >
                  Download PDF
                </Button>
              </div>
              {report.classes.map(cls => {
                const rows = report.rows.filter(s => String(s.class_id) === String(cls.id));
                if (!rows.length) return null;
                return (
                  <section
                    key={cls.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  >
                    <h2 className="border-b border-slate-200 p-4 font-bold dark:border-slate-800">
                      {cls.name} · {rows.length} students
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full whitespace-nowrap text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th rowSpan="2" className="p-3">
                              ID
                            </th>
                            <th rowSpan="2" className="p-3">
                              Student
                            </th>
                            <th rowSpan="2" className="p-3">
                              Father / guardian
                            </th>
                            {report.months.map(month => (
                              <th
                                key={month}
                                colSpan="2"
                                className="border-l border-slate-200 p-2 text-center dark:border-slate-700"
                              >
                                {monthLabel(month)}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {report.months.flatMap(month => [
                              <th key={`${month}-i`} className="p-2 text-right">
                                Invoice
                              </th>,
                              <th key={`${month}-p`} className="p-2 text-right">
                                Payment
                              </th>,
                            ])}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(row => (
                            <tr
                              key={row.studentid}
                              className="border-t border-slate-100 dark:border-slate-800"
                            >
                              <td className="p-3">{row.studentid}</td>
                              <td className="p-3 font-medium">{row.name}</td>
                              <td className="p-3">{row.fathername || '—'}</td>
                              {report.months.flatMap(month => [
                                <td key={`${month}-i`} className="p-2 text-right">
                                  {row.months[month]?.invoice == null
                                    ? '—'
                                    : row.months[month].invoice.toLocaleString()}
                                </td>,
                                <td
                                  key={`${month}-p`}
                                  className="p-2 text-right text-emerald-700 dark:text-emerald-400"
                                >
                                  {row.months[month]?.payment == null
                                    ? '—'
                                    : row.months[month].payment.toLocaleString()}
                                </td>,
                              ])}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
              {!report.rows.length && (
                <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 dark:bg-slate-900">
                  No active students found.
                </p>
              )}
              {report.rows.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="text-lg font-bold">Time since last payment</h2>
                  <p className="mt-1 text-xs text-slate-500">Calendar months since the latest recorded payment as of {report.end}. Students who paid in the end month are omitted.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {paymentAgeGroups(report.rows, report.end).map((members, index) => (
                      <div key={index} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <h3 className="font-semibold">{['1 month', '2 months', '3 months or more', 'No recorded payment'][index]} <span className="text-slate-500">({members.length})</span></h3>
                        {members.length ? <ul className="mt-2 space-y-2 text-sm">{members.map(student => <li key={student.studentid}>{student.name}<span className="block text-xs text-slate-500">{report.classes.find(c => String(c.id) === String(student.class_id))?.name || '—'} · {student.lastPaymentAt ? new Date(student.lastPaymentAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' }) : 'Never recorded'}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No students</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
