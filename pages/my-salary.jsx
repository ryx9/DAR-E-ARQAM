import { useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import PayrollPage, { PayrollHeading } from '../components/payroll/PayrollPage';
import { card, primary, secondary } from '../components/payroll/payrollStyles';
import { supabase } from '../utils/supabaseClient';
const money = n =>
  Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function MySalary() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: runs, error: runError } = await supabase
        .from('payroll_runs')
        .select('id,period')
        .eq('visible_to_employees', true)
        .order('period', { ascending: false });
      if (runError) {
        if (alive) setError(runError.message);
        return;
      }
      if (!runs.length) {
        if (alive) setItems([]);
        return;
      }
      const { data, error: itemError } = await supabase
        .from('payroll_run_items')
        .select(
          'id,run_id,profile_id,monthly_salary,absences,lates,early,calculated_days,waived_days,waiver_reason,attendance_deduction,advance_deduction,loan_deduction,net_pay'
        )
        .eq('profile_id', user.id)
        .in(
          'run_id',
          runs.map(r => r.id)
        );
      if (itemError) {
        if (alive) setError(itemError.message);
        return;
      }
      const ids = (data || []).map(item => item.id);
      const [adjustments, payments] = ids.length
        ? await Promise.all([
            supabase.from('payroll_adjustments').select('item_id,amount,reason').in('item_id', ids),
            supabase
              .from('payroll_payments')
              .select('item_id,amount,paid_on,method,reference')
              .in('item_id', ids),
          ])
        : [{ data: [] }, { data: [] }];
      if (adjustments.error || payments.error) {
        if (alive) setError((adjustments.error || payments.error).message);
        return;
      }
      if (alive) {
        setError('');
        setItems(
          (data || [])
            .map(item => ({
              ...item,
              period: runs.find(run => run.id === item.run_id)?.period,
              adjustments: (adjustments.data || []).filter(a => a.item_id === item.id),
              payments: (payments.data || []).filter(p => p.item_id === item.id),
            }))
            .sort((a, b) => b.period.localeCompare(a.period))
        );
      }
    }
    load();
    const channel = supabase
      .channel('salary-visibility')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_runs' }, payload => {
        if (payload.new?.visible_to_employees === false)
          setItems(previous => previous.filter(item => item.run_id !== payload.new.id));
        load();
      })
      .subscribe();
    const timer = setInterval(load, 10000);
    window.addEventListener('focus', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
      supabase.removeChannel(channel);
    };
  }, []);
  const selected = items.find(item => item.id === selectedId);
  return (
    <PayrollPage>
      <PayrollHeading
        icon={Banknote}
        title="My salary"
        description="Pay periods made available by the school appear here."
      />
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            aria-pressed={item.id === selectedId}
            className={item.id === selectedId ? primary : secondary}
          >
            {item.period.slice(0, 7)}
          </button>
        ))}
      </div>
      {!items.length && (
        <p className={card + ' text-sm text-slate-500'}>
          No salary periods are currently available. Your school will publish a finalised period
          here when it is ready.
        </p>
      )}
      {selected && (
        <section className={card + ' space-y-3'}>
          <h2 className="text-xl font-bold">{selected.period.slice(0, 7)}</h2>
          {[
            ['Monthly salary', selected.monthly_salary],
            ['Attendance deduction', selected.attendance_deduction],
            ['Advance repayment', selected.advance_deduction],
            ['Loan repayment', selected.loan_deduction],
            ['Revisions', selected.adjustments.reduce((sum, a) => sum + Number(a.amount), 0)],
            [
              'Amount payable',
              Number(selected.net_pay) +
                selected.adjustments.reduce((sum, a) => sum + Number(a.amount), 0),
            ],
            [
              'Debt repaid from salary',
              selected.payments
                .filter(p => p.method === 'Debt repayment')
                .reduce((sum, p) => sum + Number(p.amount), 0),
            ],
            [
              'Cash / bank paid',
              selected.payments
                .filter(p => p.method !== 'Debt repayment')
                .reduce((sum, p) => sum + Number(p.amount), 0),
            ],
            ['Total settled', selected.payments.reduce((sum, p) => sum + Number(p.amount), 0)],
          ].map(([label, value]) => (
            <div className="flex justify-between border-b py-2 dark:border-slate-800" key={label}>
              <span>{label}</span>
              <strong>{money(value)}</strong>
            </div>
          ))}
          <p className="text-sm text-slate-500">
            {selected.absences} absence(s) · {selected.lates} late · {selected.early} early ·{' '}
            {selected.waived_days} deduction days waived
          </p>
          {selected.adjustments.map((a, i) => (
            <p key={i} className="text-sm">
              Revision: {money(a.amount)} · {a.reason}
            </p>
          ))}
          {selected.payments.map((p, i) => (
            <p key={i} className="text-sm">
              {p.paid_on} · {p.method} · {money(p.amount)}
            </p>
          ))}
        </section>
      )}
    </PayrollPage>
  );
}
