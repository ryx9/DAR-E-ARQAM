import { field, card, primary, secondary } from './payrollStyles';
import { readRequests, readLegacyLoans, legacyLoanBalance } from '../../utils/payroll/debts';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

export default function SalaryRepayment({ item, outstanding, onRecorded }) {
  const [debts, setDebts] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [requests, loans] = await Promise.all([
        readRequests(item.profile_id),
        readLegacyLoans(item.profile_id),
      ]);
      if (!active) return;
      setLoadError((requests.error || loans.error)?.message || '');
      setDebts(
        [
          ...(requests.data || []).map(d => ({
            ...d,
            kind: 'request',
            label: d.request_kind || 'advance',
          })),
          ...(loans.data || []).map(d => ({
            id: d.id,
            kind: 'legacy_loan',
            label: 'Loan',
            balance: legacyLoanBalance(d),
          })),
        ].filter(d => d.balance > 0)
      );
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [item.profile_id, refresh]);
  async function record(e, debt) {
    e.preventDefault();
    const form = e.currentTarget,
      values = new FormData(form);
    setBusy(true);
    try {
      const { error } = await supabase.rpc('payroll_manual_repayment', {
        p_item: item.id,
        p_kind: debt.kind,
        p_debt: debt.id,
        p_amount: Number(values.get('amount')),
        p_date: values.get('date'),
        p_expected: debt.balance,
      });
      if (error) throw error;
      form.reset();
      await onRecorded();
      setMessage('Repayment recorded against salary and debt.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
      setRefresh(v => v + 1);
    }
  }
  return (
    <section className={card + ' space-y-3'}>
      <h3 className="font-bold">Repay from salary</h3>
      <p className="text-sm">
        Each amount reduces the outstanding salary and the selected debt. Record cash paid
        separately.
      </p>
      {message && <p role="status">{message}</p>}
      {loading && <p>Loading advances and loans…</p>}
      {loadError && (
        <p role="alert">
          {loadError}{' '}
          <button className={secondary} onClick={() => setRefresh(v => v + 1)}>
            Retry
          </button>
        </p>
      )}
      {!loading && !loadError && !debts.length && <p>No outstanding approved advances or loans.</p>}
      {debts.map(d => (
        <form
          key={d.kind + d.id}
          className="flex flex-wrap items-center gap-2"
          onSubmit={e => record(e, d)}
        >
          <strong className="capitalize">
            {d.label} #{d.id} · Rs {d.balance}
          </strong>
          <input
            className={field + ' w-40'}
            aria-label="Repayment amount"
            name="amount"
            type="number"
            step=".01"
            min=".01"
            max={Math.min(outstanding, d.balance)}
            required
          />
          <input className={field} aria-label="Repayment date" name="date" type="date" required />
          <button className={primary} disabled={busy || outstanding <= 0}>
            Record repayment
          </button>
        </form>
      ))}
    </section>
  );
}
