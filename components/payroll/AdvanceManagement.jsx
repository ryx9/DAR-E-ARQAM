import { readRequests, readLegacyLoans, legacyLoanBalance } from '../../utils/payroll/debts';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Banknote, CheckCircle2, XCircle, Clock } from 'lucide-react';
import PayrollPage, { PayrollHeading } from './PayrollPage';
import { panel, field, primary, secondary } from './payrollStyles';

export default function AdvanceManagement({ embedded = false }) {
  const [expandedId, setExpandedId] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [payments, setPayments] = useState([]);
  const [staffEmails, setStaffEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState('*');
  const [loading, setLoading] = useState(true);
  const [paymentInputs, setPaymentInputs] = useState({});
  const [checked, setChecked] = useState([]);
  const [processing, setProcessing] = useState(false);
  useEffect(() => setChecked([]), [selectedEmail, advances]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [requests, loans, pay, staff] = await Promise.all([
      readRequests(),
      readLegacyLoans(),
      supabase
        .from('staff_advance_payments_with_emails')
        .select('*')
        .order('paid_at', { ascending: false }),
      supabase.from('profiles').select('id,name'),
    ]);
    const names = new Map((staff.data || []).map(p => [p.id, p.name]));
    const legacy = (loans.data || []).map(loan => ({
      id: 'legacy-' + loan.id,
      debt_id: loan.id,
      staff_id: loan.profile_id,
      staff_email: names.get(loan.profile_id) || loan.profile_id,
      amount: loan.principal,
      reason: loan.reason,
      request_kind: 'loan',
      status: 'approved',
      requested_at: loan.loan_date,
      balance: legacyLoanBalance(loan),
      total_paid_back: Number(loan.principal) - legacyLoanBalance(loan),
    }));
    const records = [...(requests.data || []), ...legacy].sort((a, b) =>
      b.requested_at.localeCompare(a.requested_at)
    );
    setAdvances(records);
    setStaffEmails([...new Set(records.map(r => r.staff_email))].sort());
    setPayments([
      ...(pay.data || []),
      ...(loans.data || []).flatMap(loan =>
        (loan.payroll_loan_payments || []).map(p => ({ ...p, advance_id: 'legacy-' + loan.id }))
      ),
    ]);
    setLoadError((requests.error || loans.error || pay.error || staff.error)?.message || '');
    setLoading(false);
  };

  // --- Actions ---
  const handleApprove = async id => {
    const { data } = await supabase.auth.getUser();
    await decide(id, { status: 'approved', approved_at: new Date(), approved_by: data.user?.id });
  };
  async function decide(id, changes) {
    const { data, error } = await supabase
      .from('staff_advances')
      .update(changes)
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');
    if (error || !data?.length) alert(error?.message || 'This request has already been reviewed.');
    await fetchData();
  }
  const handleReject = id => decide(id, { status: 'rejected' });
  const handleAddPayment = async advanceId => {
    const debt = advances.find(a => a.id === advanceId);
    const amount = Number(paymentInputs[advanceId]);
    const { error } = await supabase.rpc('payroll_manual_repayment', {
      p_item: null,
      p_kind: debt.debt_id ? 'legacy_loan' : 'request',
      p_debt: debt.debt_id || advanceId,
      p_amount: amount,
      p_date: new Date().toLocaleDateString('sv-SE'),
      p_expected: debt.balance,
    });
    if (error) {
      alert(error.message);
      await fetchData();
      return;
    }
    setPaymentInputs(prev => ({ ...prev, [advanceId]: '' }));
    fetchData();
  };

  // --- Filtering & Helpers ---
  const filteredAdvances = advances.filter(adv => {
    if (selectedEmail !== '*' && adv.staff_email !== selectedEmail) return false;
    if (statusFilter === 'completed') return adv.status === 'approved' && adv.balance <= 0;
    if (statusFilter === 'active') return adv.status === 'approved' && adv.balance > 0;
    if (statusFilter === 'pending') return adv.status === 'pending';
    if (statusFilter === 'rejected') return adv.status === 'rejected';
    return true;
  });

  const pending = filteredAdvances.filter(a => a.status === 'pending');
  const selected = pending.filter(a => checked.includes(a.id)).map(a => a.id);
  async function batchDecision(approve) {
    setProcessing(true);
    try {
      const { error } = await supabase.rpc('payroll_decide_requests', {
        p_ids: selected,
        p_approve: approve,
      });
      await fetchData();
      if (error) setLoadError(error.message);
    } finally {
      setProcessing(false);
    }
  }
  const formatCurrency = val => Number(val || 0).toLocaleString('en-PK');
  const formatDate = dateString => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = status => {
    const s = String(status || '').toLowerCase();
    if (s === 'approved')
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Approved
        </span>
      );
    if (s === 'rejected')
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 text-xs font-medium">
          <XCircle className="w-3.5 h-3.5" /> Rejected
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-medium">
        <Clock className="w-3.5 h-3.5" /> Pending
      </span>
    );
  };

  const content = (
    <div className="space-y-4">
      {loadError && <p role="alert">{loadError}</p>}
      <section className={panel} aria-label="Advance and loan requests">
        <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 p-4 dark:border-slate-800 md:p-5">
          <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium sm:max-w-xs">
            Employee
            <select
              className={field}
              value={selectedEmail}
              onChange={e => setSelectedEmail(e.target.value)}
            >
              <option value="*">All employees</option>
              {staffEmails.map(email => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Status
            <select
              className={field}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All requests</option>
              <option value="pending">Pending</option>
              <option value="active">Approved with balance</option>
              <option value="completed">Repaid</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>
        {pending.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={selected.length === pending.length}
                onChange={e => setChecked(e.target.checked ? pending.map(a => a.id) : [])}
              />
              Select all pending ({pending.length})
            </label>
            <button
              className={primary}
              disabled={!selected.length || processing}
              onClick={() => batchDecision(true)}
            >
              Approve selected ({selected.length})
            </button>
            <button
              className={secondary}
              disabled={!selected.length || processing}
              onClick={() => batchDecision(false)}
            >
              Reject selected
            </button>
          </div>
        )}
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500" aria-live="polite">
            Loading requests…
          </p>
        ) : !filteredAdvances.length ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No requests match the selected filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-b-2xl">
            <table>
              <thead>
                <tr>
                  {[
                    'Employee',
                    'Type',
                    'Requested',
                    'Status',
                    'Amount',
                    'Outstanding',
                    'Actions',
                  ].map(label => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAdvances.map(adv => {
                  const open = expandedId === adv.id;
                  const canRepay = adv.status === 'approved' && adv.balance > 0;
                  const advancePayments = payments.filter(p => p.advance_id === adv.id);
                  return (
                    <React.Fragment key={adv.id}>
                      <tr>
                        <td>
                          <div className="flex items-center gap-2">
                            {adv.status === 'pending' && (
                              <input
                                aria-label={'Select request ' + adv.id}
                                type="checkbox"
                                checked={checked.includes(adv.id)}
                                onChange={e =>
                                  setChecked(
                                    e.target.checked
                                      ? [...checked, adv.id]
                                      : checked.filter(id => id !== adv.id)
                                  )
                                }
                              />
                            )}
                            <span className="font-semibold">{adv.staff_email}</span>
                          </div>
                        </td>
                        <td className="capitalize">{adv.request_kind || 'advance'}</td>
                        <td className="whitespace-nowrap">{formatDate(adv.requested_at)}</td>
                        <td>{getStatusBadge(adv.status)}</td>
                        <td className="whitespace-nowrap tabular-nums">
                          Rs. {formatCurrency(adv.amount)}
                        </td>
                        <td className="whitespace-nowrap font-semibold tabular-nums">
                          {adv.status === 'approved' ? 'Rs. ' + formatCurrency(adv.balance) : '—'}
                        </td>
                        <td>
                          <button
                            className={secondary}
                            aria-expanded={open}
                            onClick={() => setExpandedId(open ? null : adv.id)}
                          >
                            {open ? 'Close' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7}>
                            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 md:grid-cols-2">
                              <div className="space-y-3">
                                <h3 className="font-bold">Request details</h3>
                                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                                  {adv.reason}
                                </p>
                                {adv.approved_by_email && (
                                  <p className="text-sm">Approved by {adv.approved_by_email}</p>
                                )}
                                {adv.status === 'pending' && (
                                  <div className="flex gap-2">
                                    <button
                                      className={primary}
                                      disabled={processing}
                                      onClick={() => handleApprove(adv.id)}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      className={secondary}
                                      disabled={processing}
                                      onClick={() => handleReject(adv.id)}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                                {canRepay && (
                                  <form
                                    className="flex flex-wrap items-end gap-2"
                                    onSubmit={e => {
                                      e.preventDefault();
                                      handleAddPayment(adv.id);
                                    }}
                                  >
                                    <label className="grid gap-1 text-sm font-medium">
                                      Repayment received outside salary
                                      <input
                                        className={field}
                                        type="number"
                                        required
                                        min="0.01"
                                        max={adv.balance}
                                        step="0.01"
                                        value={paymentInputs[adv.id] || ''}
                                        onChange={e =>
                                          setPaymentInputs(prev => ({
                                            ...prev,
                                            [adv.id]: e.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                    <button className={primary} type="submit">
                                      Record repayment
                                    </button>
                                  </form>
                                )}
                              </div>
                              <div className="space-y-2">
                                <h3 className="font-bold">Repayment history</h3>
                                <p className="text-sm">
                                  Total repaid · Rs. {formatCurrency(adv.total_paid_back)}
                                </p>
                                {advancePayments.length ? (
                                  <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
                                    {advancePayments.map(p => (
                                      <li
                                        key={p.id}
                                        className="flex flex-wrap justify-between gap-2 py-2"
                                      >
                                        <span>
                                          {formatDate(p.paid_at)}{' '}
                                          {p.added_by_email && ' · ' + p.added_by_email}
                                        </span>
                                        <strong>Rs. {formatCurrency(p.amount)}</strong>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-slate-500 dark:text-slate-400">
                                    No repayments recorded.
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
  if (embedded) return content;
  return (
    <PayrollPage>
      <PayrollHeading
        icon={Banknote}
        title="Advance and loan requests"
        description="Review employee requests and record repayments."
      />
      {content}
    </PayrollPage>
  );
}
