import { FileText } from 'lucide-react';
import PayrollPage, { PayrollHeading } from '../../components/payroll/PayrollPage';
import { card, primary, secondary } from '../../components/payroll/payrollStyles';
import { payrollUrl } from '../../components/payroll/PayrollModule';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { downloadPayrollReport } from '../../utils/payroll/report';
import { supabase } from '../../utils/supabaseClient';
const punch = value => {
  if (typeof value !== 'number') return value ?? '';
  const minutes = Math.round((value % 1) * 1440);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};
const money = n =>
  Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function PayrollReport() {
  const router = useRouter();
  const [item, setItem] = useState(null);
  const [run, setRun] = useState(null);
  const [payments, setPayments] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!router.isReady) return;
    if (localStorage.getItem('UserRole') !== 'superadmin') {
      setError('Only superadmins can view payroll reports.');
      return;
    }
    async function load() {
      const { data: row, error: e } = await supabase
        .from('payroll_run_items')
        .select('*')
        .eq('id', router.query.item)
        .single();
      if (e) {
        setError(e.message);
        return;
      }
      const [r, p, a] = await Promise.all([
        supabase.from('payroll_runs').select('*').eq('id', row.run_id).single(),
        supabase.from('payroll_payments').select('*').eq('item_id', row.id).order('paid_on'),
        supabase.from('payroll_adjustments').select('*').eq('item_id', row.id).order('created_at'),
      ]);
      if (r.error || p.error || a.error) {
        setError((r.error || p.error || a.error).message);
        return;
      }
      setItem(row);
      setRun(r.data);
      setPayments(p.data || []);
      setAdjustments(a.data || []);
    }
    load();
  }, [router.isReady, router.query.item]);
  if (error) return <p className="p-8">{error}</p>;
  if (!item || !run) return <p className="p-8">Loading report…</p>;
  const type = router.query.type,
    snapshot = item.source_snapshot || {},
    paid = payments.reduce((sum, p) => sum + Number(p.amount), 0),
    revised = Number(item.net_pay) + adjustments.reduce((sum, a) => sum + Number(a.amount), 0);
  return (
    <PayrollPage printable>
      <div className="print:hidden">
        <PayrollHeading icon={FileText} title="Payroll report" />
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={payrollUrl('payments', run.period.slice(0, 7))} className={secondary}>
          ← Payroll
        </Link>
        <button
          onClick={() =>
            downloadPayrollReport(
              [{ ...snapshot, settlement: { adjustments, payments } }],
              run.period.slice(0, 7),
              type === 'attendance' ? 'attendance' : type === 'final' ? 'final' : 'review'
            )
          }
          className={primary}
        >
          Download PDF
        </button>
        <button onClick={() => window.print()} className={secondary}>
          Print report
        </button>
      </div>
      <article
        className={
          card + ' overflow-x-auto print:border-0 print:bg-white print:p-0 print:shadow-none'
        }
      >
        <header className="border-b border-slate-200 pb-4 dark:border-slate-700">
          <p className="font-bold">DAR-E-ARQAM SCHOOL</p>
          <h2 className="mt-2 text-2xl font-bold">
            {type === 'attendance'
              ? 'Employee attendance log'
              : type === 'review'
                ? 'Tentative payroll review'
                : 'Payroll payment summary'}
          </h2>
          <p className="mt-2">
            {item.employee_name} · {run.period.slice(0, 7)}
          </p>
          <p className="text-sm">Posted {new Date(run.posted_at).toLocaleString()}</p>
        </header>
        {type === 'attendance' ? (
          <table className="mt-6 w-full text-left text-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Punches</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot.days || []).map(day => (
                <tr key={day.date} className="border-b">
                  <td className="py-2">{day.date}</td>
                  <td>{day.status}</td>
                  <td>
                    {day.source
                      ? Array.from({ length: 5 }, (_, i) => [
                          day.source[`Clock In ${i + 1}`],
                          day.source[`Clock Out ${i + 1}`],
                        ])
                          .filter(pair =>
                            pair.some(
                              value => value !== '' && value !== null && value !== undefined
                            )
                          )
                          .map(pair => pair.map(punch).join(' – '))
                          .join(' / ')
                      : '—'}
                  </td>
                  <td>
                    {[
                      day.late && 'Late',
                      day.early && 'Early',
                      day.correction && `Corrected: ${day.correction.reason}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <table className="mt-6 w-full text-sm">
              <tbody>
                {[
                  ['Monthly salary', item.monthly_salary],
                  ['Attendance deduction', -Number(item.attendance_deduction)],
                  ['Advance repayment', -Number(item.advance_deduction)],
                  ['Loan repayment', -Number(item.loan_deduction)],
                  ['Posted payable', item.net_pay],
                  ['Revisions', revised - Number(item.net_pay)],
                  ['Amount payable', revised],
                  ['Paid', paid],
                  ['Outstanding', revised - paid],
                ].map(([label, value]) => (
                  <tr className="border-b" key={label}>
                    <th className="py-3 text-left">{label}</th>
                    <td className="text-right">{money(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm">
              {item.absences} absences · {item.lates} late · {item.early} early ·{' '}
              {item.calculated_days} calculated days · {item.waived_days} waived{' '}
              {item.waiver_reason && `(${item.waiver_reason})`}
            </p>
            {adjustments.map(a => (
              <p key={a.id} className="mt-2 text-sm">
                Revision: {money(a.amount)} · {a.reason}
              </p>
            ))}
            {type === 'review' && (
              <p className="mt-4 text-sm">
                Review copy. Posted figures are preserved; payment is recorded separately.
              </p>
            )}
            {type === 'final' && (
              <section className="mt-6">
                <h2 className="font-bold">Payment records</h2>
                {payments.length ? (
                  payments.map(p => (
                    <p key={p.id} className="mt-2 text-sm">
                      {p.paid_on} · {p.method} · {money(p.amount)} · {p.reference || 'No reference'}
                    </p>
                  ))
                ) : (
                  <p className="mt-2 text-sm">No payments recorded.</p>
                )}
              </section>
            )}
          </>
        )}
      </article>
    </PayrollPage>
  );
}
