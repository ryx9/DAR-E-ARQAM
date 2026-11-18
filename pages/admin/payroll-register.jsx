import { FileText } from 'lucide-react';
import PayrollPage, { PayrollHeading } from '../../components/payroll/PayrollPage';
import { card, primary, secondary } from '../../components/payroll/payrollStyles';
import { payrollUrl } from '../../components/payroll/PayrollModule';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { downloadPayrollRegister } from '../../utils/payroll/report';
import { supabase } from '../../utils/supabaseClient';
const money = n =>
  Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function PayrollRegister() {
  const router = useRouter(),
    [run, setRun] = useState(null),
    [items, setItems] = useState([]),
    [payments, setPayments] = useState([]),
    [revisions, setRevisions] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (!router.isReady) return;
    if (localStorage.getItem('UserRole') !== 'superadmin') {
      setError('Only superadmins can view this report.');
      return;
    }
    async function load() {
      const [r, i] = await Promise.all([
        supabase.from('payroll_runs').select('*').eq('id', router.query.run).single(),
        supabase
          .from('payroll_run_items')
          .select('*')
          .eq('run_id', router.query.run)
          .order('employee_name'),
      ]);
      if (r.error || i.error) {
        setError((r.error || i.error).message);
        return;
      }
      const ids = (i.data || []).map(item => item.id);
      const [p, a] = ids.length
        ? await Promise.all([
            supabase.from('payroll_payments').select('*').in('item_id', ids),
            supabase.from('payroll_adjustments').select('*').in('item_id', ids),
          ])
        : [{ data: [] }, { data: [] }];
      if (p.error || a.error) {
        setError((p.error || a.error).message);
        return;
      }
      setRun(r.data);
      setItems(i.data || []);
      setPayments(p.data || []);
      setRevisions(a.data || []);
    }
    load();
  }, [router.isReady, router.query.run]);
  if (error) return <p className="p-8">{error}</p>;
  if (!run) return <p className="p-8">Loading report…</p>;
  return (
    <PayrollPage printable>
      <div className="print:hidden">
        <PayrollHeading icon={FileText} title="Payroll register" />
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link className={secondary} href={payrollUrl('payments', run.period.slice(0, 7))}>
          ← Payroll
        </Link>
        <button
          className={primary}
          onClick={() =>
            downloadPayrollRegister(
              document.getElementById('salary-register'),
              run.period.slice(0, 7)
            )
          }
        >
          Download register PDF
        </button>
        <button className={secondary} onClick={() => window.print()}>
          Print register
        </button>
      </div>
      <article
        className={
          card + ' overflow-x-auto print:border-0 print:bg-white print:p-0 print:shadow-none'
        }
      >
        <h2 className="text-2xl font-bold">Payroll register · {run.period.slice(0, 7)}</h2>
        <p className="mt-2 text-sm">
          Dar-e-Arqam School · Posted {new Date(run.posted_at).toLocaleString()}
        </p>
        <div className="mt-6 overflow-auto">
          <table id="salary-register" className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Salary</th>
                <th>Attendance</th>
                <th>Advance</th>
                <th>Loan</th>
                <th>Revisions</th>
                <th>Payable</th>
                <th>Settled</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const adjustment = revisions
                    .filter(r => r.item_id === item.id)
                    .reduce((sum, r) => sum + Number(r.amount), 0),
                  paid = payments
                    .filter(p => p.item_id === item.id)
                    .reduce((sum, p) => sum + Number(p.amount), 0),
                  payable = Number(item.net_pay) + adjustment;
                return (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">{item.employee_name}</td>
                    <td>{money(item.monthly_salary)}</td>
                    <td>{money(item.attendance_deduction)}</td>
                    <td>{money(item.advance_deduction)}</td>
                    <td>{money(item.loan_deduction)}</td>
                    <td>{money(adjustment)}</td>
                    <td>{money(payable)}</td>
                    <td>{money(paid)}</td>
                    <td>{money(payable - paid)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-3">Totals</td>
                <td>{money(items.reduce((sum, item) => sum + Number(item.monthly_salary), 0))}</td>
                <td>
                  {money(items.reduce((sum, item) => sum + Number(item.attendance_deduction), 0))}
                </td>
                <td>
                  {money(items.reduce((sum, item) => sum + Number(item.advance_deduction), 0))}
                </td>
                <td>{money(items.reduce((sum, item) => sum + Number(item.loan_deduction), 0))}</td>
                <td>{money(revisions.reduce((sum, r) => sum + Number(r.amount), 0))}</td>
                <td>
                  {money(
                    items.reduce((sum, item) => sum + Number(item.net_pay), 0) +
                      revisions.reduce((sum, r) => sum + Number(r.amount), 0)
                  )}
                </td>
                <td>{money(payments.reduce((sum, p) => sum + Number(p.amount), 0))}</td>
                <td>
                  {money(
                    items.reduce((sum, item) => sum + Number(item.net_pay), 0) +
                      revisions.reduce((sum, r) => sum + Number(r.amount), 0) -
                      payments.reduce((sum, p) => sum + Number(p.amount), 0)
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-4 text-sm">
          Payment records indicate entries made in the ERP; they do not confirm a transfer.
        </p>
      </article>
    </PayrollPage>
  );
}
