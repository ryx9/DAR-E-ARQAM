import { FileText, Search } from 'lucide-react';
import { field, card, panel, primary as button, secondary } from './payrollStyles';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../utils/supabaseClient';
import { downloadPayrollReport } from '../../utils/payroll/report';
import { payrollUrl } from './PayrollModule';
import AttendanceSummary from './AttendanceSummary';
import SalaryRepayment from './SalaryRepayment';
const money = n =>
  Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function SalaryPayments({ period }) {
  const today = new Date().toLocaleDateString('sv-SE');
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [payments, setPayments] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [revision, setRevision] = useState({ amount: '', reason: '' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState({
    amount: '',
    paid_on: today,
    method: 'Cash',
    reference: '',
  });
  const [batchAmounts, setBatchAmounts] = useState({});
  const [batchIds, setBatchIds] = useState([]);
  const [batch, setBatch] = useState({ paid_on: today, method: 'Cash', reference: '' });
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');
  async function loadLedger(run) {
    setLoading(true);
    setProblem('');
    try {
      if (!run) {
        const result = await supabase
          .from('payroll_runs')
          .select('*')
          .eq('period', period + '-01')
          .maybeSingle();
        if (result.error) throw result.error;
        run = result.data;
      }
      if (!run) return;
      const result = await supabase
        .from('payroll_run_items')
        .select('*')
        .eq('run_id', run.id)
        .order('employee_name');
      if (result.error) throw result.error;
      const ids = result.data.map(r => r.id);
      const [history, changes, paid] = await Promise.all([
        supabase
          .from('payroll_audit')
          .select('*')
          .eq('run_id', run.id)
          .order('created_at', { ascending: false }),
        supabase.from('payroll_adjustments').select('*').in('item_id', ids),
        supabase.from('payroll_payments').select('*').in('item_id', ids),
      ]);
      if (history.error || changes.error || paid.error)
        throw history.error || changes.error || paid.error;
      setAudit(history.data);
      setAdjustments(changes.data);
      setPayments(paid.data);
      setItems(result.data);
      setSelected(run);
      setBatchAmounts({});
      setBatchIds([]);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadLedger();
  }, [period]);
  async function visibility(run) {
    setBusy(true);
    const { error } = await supabase.rpc('payroll_set_employee_access', {
      p_run_id: run.id,
      p_open: !run.visible_to_employees,
    });
    if (error) setNotice(error.message);
    else {
      const opened = !run.visible_to_employees;
      const updated = {
        ...run,
        visible_to_employees: opened,
        employee_access_opened_at: opened
          ? new Date().toISOString()
          : run.employee_access_opened_at,
        employee_access_closed_at: opened ? null : new Date().toISOString(),
      };
      setSelected(updated);
      setNotice(
        updated.visible_to_employees
          ? 'Salary view opened for this month.'
          : 'Salary view closed for this month.'
      );
    }
    setBusy(false);
  }
  async function saveAdjustment(event) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true);
    const { error } = await supabase.rpc('payroll_add_adjustment', {
      p_item_id: detail.id,
      p_amount: Number(revision.amount),
      p_reason: revision.reason,
    });
    if (error) setNotice(error.message);
    else {
      setRevision({ amount: '', reason: '' });
      const saved = detail;
      await loadLedger(selected);
      setDetail(saved);
      setNotice('Adjustment recorded. The original posted figures remain in the history.');
    }
    setBusy(false);
  }
  const outstanding = item =>
    Math.max(
      0,
      Number(item.net_pay) +
        adjustments
          .filter(a => a.item_id === item.id)
          .reduce((sum, a) => sum + Number(a.amount), 0) -
        payments.filter(p => p.item_id === item.id).reduce((sum, p) => sum + Number(p.amount), 0)
    );
  async function saveBatch(event) {
    event.preventDefault();
    const selectedPayments = items
      .filter(item => batchIds.includes(item.id) && outstanding(item) > 0)
      .map(item => ({
        item_id: item.id,
        expected_balance: outstanding(item).toFixed(2),
        amount: Number(batchAmounts[item.id] ?? outstanding(item).toFixed(2)),
      }));
    if (!selectedPayments.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('payroll_pay_selected', {
      p_payments: selectedPayments,
      p_date: batch.paid_on,
      p_method: batch.method,
      p_reference: batch.reference,
    });
    if (error) setNotice(error.message);
    else {
      await loadLedger(selected);
      setNotice(`${data} payments recorded. No money was transferred by the ERP.`);
    }
    setBusy(false);
  }
  async function savePayment(event) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true);
    const { error } = await supabase.rpc('payroll_pay_selected', {
      p_payments: [
        {
          item_id: detail.id,
          expected_balance: outstanding(detail).toFixed(2),
          amount: Number(payment.amount),
        },
      ],
      p_date: payment.paid_on,
      p_method: payment.method,
      p_reference: payment.reference,
    });
    if (error) setNotice(error.message);
    else {
      setPayment({ amount: '', paid_on: '', method: 'Cash', reference: '' });
      const saved = detail;
      await loadLedger(selected);
      setDetail(saved);
      setNotice('Payment recorded. This does not transfer money.');
    }
    setBusy(false);
  }

  const visibleItems = items.filter(
    item =>
      item.employee_name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (balanceFilter === 'all' || outstanding(item) > 0 === (balanceFilter === 'outstanding'))
  );
  const batchDue = items.filter(item => batchIds.includes(item.id) && outstanding(item) > 0);
  const batchTotal = batchDue.reduce(
    (sum, item) => sum + Number(batchAmounts[item.id] ?? outstanding(item)),
    0
  );
  const settledTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const dueTotal = items.reduce((sum, item) => sum + outstanding(item), 0);
  const allVisible =
    visibleItems.length > 0 && visibleItems.every(item => batchIds.includes(item.id));

  if (loading) return <p>Loading salary ledger…</p>;
  if (problem)
    return (
      <p role="alert">
        {problem} <button onClick={() => loadLedger()}>Reload ledger</button>
      </p>
    );
  if (!selected)
    return (
      <p>
        No finalised salaries for {period}.{' '}
        <Link className="underline" href={payrollUrl('finalise', period)}>
          View pre-approved salaries
        </Link>
      </p>
    );
  return (
    <div className="space-y-5">
      {notice && <p role="status">{notice}</p>}
      <section className={panel + ' overflow-hidden'} aria-label="Payroll payment overview">
        <header className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-bold">Finalised payroll · {selected.period.slice(0, 7)}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {items.length} employees · Finalised payroll ledger
            </p>
          </div>
        </header>
        <dl className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200 bg-slate-50 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="min-w-0 p-4 sm:p-5">
            <dt className="text-sm text-slate-500 dark:text-slate-400">Settled</dt>
            <dd className="mt-1 break-words text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300 sm:text-xl">
              Rs {money(settledTotal)}
            </dd>
          </div>
          <div className="min-w-0 p-4 sm:p-5">
            <dt className="text-sm text-slate-500 dark:text-slate-400">Outstanding</dt>
            <dd className="mt-1 break-words text-lg font-bold tabular-nums sm:text-xl">
              Rs {money(dueTotal)}
            </dd>
          </div>
        </dl>
      </section>
      <section
        className={panel + ' flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5'}
        aria-label="Teacher portal access"
      >
        <div>
          <h2 className="font-bold">Teacher portal access</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selected.visible_to_employees
              ? `Open now${selected.employee_access_opened_at ? ` · published ${new Date(selected.employee_access_opened_at).toLocaleString()}` : ''}`
              : 'Closed · teachers cannot see this salary period or its figures.'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Drafts and pre-approvals are never visible in the teacher portal.
          </p>
        </div>
        <button
          className={selected.visible_to_employees ? secondary : button}
          disabled={busy}
          onClick={() => visibility(selected)}
        >
          {selected.visible_to_employees ? 'Close staff access' : 'Publish to staff portal'}
        </button>
      </section>
      <details className={card}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold">
          <FileText size={17} className="text-indigo-600 dark:text-indigo-400" />
          Reports and register
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            className={secondary}
            target="_blank"
            rel="noreferrer"
            href={`/admin/payroll-register?run=${selected.id}`}
          >
            Open payroll register ↗
          </a>
          <button
            type="button"
            className={secondary}
            disabled={!items.length}
            onClick={() =>
              downloadPayrollReport(
                items
                  .filter(i => !batchIds.length || batchIds.includes(i.id))
                  .map(item => item.source_snapshot),
                selected.period.slice(0, 7),
                'attendance'
              )
            }
          >
            Attendance PDF ({batchIds.length || items.length})
          </button>
          <button
            type="button"
            className={secondary}
            disabled={!items.length}
            onClick={() =>
              downloadPayrollReport(
                items
                  .filter(i => !batchIds.length || batchIds.includes(i.id))
                  .map(item => ({
                    ...item.source_snapshot,
                    settlement: {
                      adjustments: adjustments.filter(a => a.item_id === item.id),
                      payments: payments.filter(p => p.item_id === item.id),
                    },
                  })),
                selected.period.slice(0, 7),
                'final'
              )
            }
          >
            Finalised salary PDF ({batchIds.length || items.length})
          </button>
        </div>
      </details>
      <section className={panel + ' min-w-0 overflow-hidden'}>
        <header className="flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="font-bold">Employee balances</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Select employees for a batch or open an individual payment.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <label className="relative min-w-0">
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                className={field + ' w-full pl-9'}
                aria-label="Find employees"
                placeholder="Find employees"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <select
              className={field}
              aria-label="Balance status"
              value={balanceFilter}
              onChange={e => setBalanceFilter(e.target.value)}
            >
              <option value="all">All balances</option>
              <option value="outstanding">Outstanding</option>
              <option value="settled">Fully settled</option>
            </select>
          </div>
        </header>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>
                  <label>
                    <input
                      aria-label="Select all shown employees"
                      type="checkbox"
                      checked={allVisible}
                      onChange={e =>
                        setBatchIds(
                          e.target.checked
                            ? [...new Set([...batchIds, ...visibleItems.map(i => i.id)])]
                            : batchIds.filter(id => !visibleItems.some(item => item.id === id))
                        )
                      }
                    />{' '}
                    Batch
                  </label>
                </th>
                <th>Employee</th>
                <th className="hidden md:table-cell">Salary</th>
                <th className="hidden md:table-cell">Deductions</th>
                <th className="hidden md:table-cell">Payable</th>
                <th className="hidden md:table-cell">Settled</th>
                <th>Outstanding</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => {
                const paid = payments
                  .filter(p => p.item_id === item.id)
                  .reduce((sum, p) => sum + Number(p.amount), 0);
                const payable =
                  Number(item.net_pay) +
                  adjustments
                    .filter(a => a.item_id === item.id)
                    .reduce((sum, a) => sum + Number(a.amount), 0);
                return (
                  <tr key={item.id} className="border-t dark:border-slate-800">
                    <td>
                      <input
                        aria-label={`Select ${item.employee_name} for batch payment`}
                        type="checkbox"
                        checked={batchIds.includes(item.id)}
                        onChange={e =>
                          setBatchIds(
                            e.target.checked
                              ? [...batchIds, item.id]
                              : batchIds.filter(id => id !== item.id)
                          )
                        }
                      />
                      {batchIds.includes(item.id) && outstanding(item) > 0 && (
                        <input
                          form="batch-payment"
                          className={field + ' ml-2 w-24'}
                          type="number"
                          required
                          step=".01"
                          min=".01"
                          max={outstanding(item).toFixed(2)}
                          aria-label={'Payment for ' + item.employee_name}
                          value={batchAmounts[item.id] ?? outstanding(item).toFixed(2)}
                          onChange={e =>
                            setBatchAmounts({ ...batchAmounts, [item.id]: e.target.value })
                          }
                        />
                      )}
                    </td>
                    <td className="min-w-24 break-words font-semibold">{item.employee_name}</td>
                    <td className="hidden md:table-cell">{money(item.monthly_salary)}</td>
                    <td className="hidden md:table-cell">
                      {money(
                        Number(item.attendance_deduction) +
                          Number(item.advance_deduction) +
                          Number(item.loan_deduction)
                      )}
                    </td>
                    <td className="hidden md:table-cell">{money(payable)}</td>
                    <td className="hidden md:table-cell">{money(paid)}</td>
                    <td>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${outstanding(item) > 0 ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}
                      >
                        {outstanding(item) > 0 ? 'Rs ' + money(outstanding(item)) : 'Fully settled'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="font-bold text-indigo-600"
                        onClick={() => {
                          setDetail(item);
                          setPayment({
                            amount: outstanding(item).toFixed(2),
                            paid_on: today,
                            method: 'Cash',
                            reference: '',
                          });
                          requestAnimationFrame(() =>
                            document.getElementById('payment-detail')?.scrollIntoView()
                          );
                        }}
                      >
                        Details / payment
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibleItems.length && (
          <p className="p-4 text-sm text-slate-500">No employees match these filters.</p>
        )}
        <form
          id="batch-payment"
          onSubmit={saveBatch}
          className="flex flex-wrap items-end gap-3 border-t bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50 sm:p-5"
        >
          <div className="w-full">
            <h3 className="font-semibold">Record batch payment</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {batchDue.length} employees with a balance · Rs {money(batchTotal)} to record
            </p>
          </div>
          <label className="grid gap-1 text-xs">
            Date
            <input
              required
              type="date"
              className={field}
              value={batch.paid_on}
              onChange={e => setBatch({ ...batch, paid_on: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Method
            <input
              required
              className={field}
              value={batch.method}
              onChange={e => setBatch({ ...batch, method: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Reference
            <input
              className={field}
              value={batch.reference}
              onChange={e => setBatch({ ...batch, reference: e.target.value })}
            />
          </label>
          <button
            className={button}
            disabled={
              busy || !batchIds.some(id => items.some(i => i.id === id && outstanding(i) > 0))
            }
          >
            Record batch
          </button>
        </form>
      </section>
      <AttendanceSummary
        rows={items.map(i => i.source_snapshot)}
        period={selected.period.slice(0, 7)}
      />
      <details className={card}>
        <summary className="font-bold">Payroll history</summary>
        <div className="mt-3 max-h-48 space-y-2 overflow-auto text-sm text-slate-500">
          {audit.map(entry => (
            <p key={entry.id}>
              {new Date(entry.created_at).toLocaleString()} · {entry.action.replaceAll('_', ' ')} ·{' '}
              {JSON.stringify(entry.details)}
            </p>
          ))}
        </div>
      </details>
      {detail && (
        <section id="payment-detail" className={`${card} scroll-mt-24 space-y-4`}>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{detail.employee_name}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Outstanding Rs {money(outstanding(detail))}
              </p>
            </div>
            <button className={secondary} onClick={() => setDetail(null)}>
              Close details
            </button>
          </header>
          {(detail.source_snapshot?.loan_deductions || []).map(a => (
            <p className="text-sm text-slate-500" key={`loan-${a.id}`}>
              Loan #{a.id}: {money(a.amount)} deducted · balance at review{' '}
              {money(a.balance_at_review)}
            </p>
          ))}
          {(detail.source_snapshot?.advance_deductions || []).map(a => (
            <p className="text-sm text-slate-500" key={a.id}>
              Advance #{a.id}: {money(a.amount)} deducted · balance at review{' '}
              {money(a.balance_at_review)}
            </p>
          ))}
          <p className="text-sm text-slate-500">
            Salary {money(detail.monthly_salary)} · attendance deduction{' '}
            {money(detail.attendance_deduction)} · advance repayment{' '}
            {money(detail.advance_deduction)} · loan repayment {money(detail.loan_deduction)} · net{' '}
            {money(detail.net_pay)}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              className="text-sm font-bold text-indigo-600"
              target="_blank"
              rel="noreferrer"
              href={`/admin/payroll-report?item=${detail.id}&type=attendance`}
            >
              Attendance log ↗
            </a>
            <a
              className="text-sm font-bold text-indigo-600"
              target="_blank"
              rel="noreferrer"
              href={`/admin/payroll-report?item=${detail.id}&type=review`}
            >
              Tentative payroll document ↗
            </a>
            <a
              className="text-sm font-bold text-indigo-600"
              target="_blank"
              rel="noreferrer"
              href={`/admin/payroll-report?item=${detail.id}&type=final`}
            >
              Final payment document ↗
            </a>
          </div>
          <SalaryRepayment
            key={detail.id}
            item={detail}
            outstanding={outstanding(detail)}
            onRecorded={async () => {
              const item = detail;
              await loadLedger(selected);
              setDetail(item);
            }}
          />
          {!detail.source_snapshot?.workflow_final && (
            <form onSubmit={saveAdjustment} className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs">
                Revision (+ or −)
                <input
                  required
                  step="0.01"
                  type="number"
                  className={field}
                  value={revision.amount}
                  onChange={e => setRevision({ ...revision, amount: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Reason
                <input
                  required
                  className={field}
                  value={revision.reason}
                  onChange={e => setRevision({ ...revision, reason: e.target.value })}
                />
              </label>
              <button className={button} disabled={busy}>
                Record revision
              </button>
            </form>
          )}
          <div className="text-sm text-slate-500">
            {adjustments
              .filter(a => a.item_id === detail.id)
              .map(a => (
                <p key={a.id}>
                  {money(a.amount)} · {a.reason}
                </p>
              ))}
          </div>
          {outstanding(detail) > 0 && (
            <form onSubmit={savePayment} className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs">
                Amount
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  className={field}
                  value={payment.amount}
                  onChange={e => setPayment({ ...payment, amount: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Payment date
                <input
                  required
                  type="date"
                  className={field}
                  value={payment.paid_on}
                  onChange={e => setPayment({ ...payment, paid_on: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Method
                <input
                  required
                  className={field}
                  value={payment.method}
                  onChange={e => setPayment({ ...payment, method: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Reference
                <input
                  className={field}
                  value={payment.reference}
                  onChange={e => setPayment({ ...payment, reference: e.target.value })}
                />
              </label>
              <button className={button} disabled={busy}>
                Record payment
              </button>
            </form>
          )}
          <div className="text-sm text-slate-500">
            {payments
              .filter(p => p.item_id === detail.id)
              .map(p => (
                <p key={p.id}>
                  {p.paid_on} · {p.method} · {money(p.amount)} {p.reference && `· ${p.reference}`}
                </p>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
