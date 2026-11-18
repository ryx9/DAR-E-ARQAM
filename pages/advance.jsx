import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import PayrollPage, { PayrollHeading } from '../components/payroll/PayrollPage';
import { panel, field, primary } from '../components/payroll/payrollStyles';
import {
  Banknote,
  Wallet,
  History,
  Calendar,
  Loader2,
  Send,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';

// Reusable UI Components to match the design system
const GlassCard = ({ children, className = '' }) => (
  <div className={panel + ' ' + className}>{children}</div>
);

export default function RequestAdvancePage() {
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState('advance');
  const [reason, setReason] = useState('');
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [advances, setAdvances] = useState([]);
  const clickGuardRef = useRef(false);

  // Fetch logged-in user
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Fetch user advances + payments to compute balance
  const fetchAdvances = async () => {
    if (!user) return;

    const { data: advData, error: advErr } = await supabase
      .from('staff_advances')
      .select('*')
      .eq('staff_id', user.id)
      .order('requested_at', { ascending: false });

    if (advErr) {
      console.error(advErr);
      return;
    }

    if (!advData.length) {
      setAdvances([]);
      return;
    }

    const advanceIds = advData.map(a => a.id);
    const { data: payData, error: payErr } = await supabase
      .from('staff_advance_payments')
      .select('*')
      .in('advance_id', advanceIds);

    if (payErr) {
      console.error(payErr);
      return;
    }

    const advancesWithBalance = advData.map(a => {
      const totalPaid = payData
        .filter(p => p.advance_id === a.id)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      return {
        ...a,
        total_paid_back: totalPaid,
        balance: Number(a.amount || 0) - totalPaid,
      };
    });

    // Only keep advances where balance > 0
    setAdvances(advancesWithBalance);
  };

  useEffect(() => {
    fetchAdvances();
  }, [user]);

  // Handle advance request
  const handleRequestAdvance = async e => {
    e.preventDefault();
    if (submitting || clickGuardRef.current) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !reason.trim()) {
      alert('Please enter a valid amount and a brief reason.');
      return;
    }

    clickGuardRef.current = true;
    setTimeout(() => (clickGuardRef.current = false), 1500);

    try {
      setSubmitting(true);

      const { error } = await supabase.from('staff_advances').insert([
        {
          staff_id: user.id,
          request_kind: kind,
          amount: amt,
          reason: reason.trim(),
          status: 'pending',
        },
      ]);

      if (error) {
        alert('Error requesting advance: ' + error.message);
      } else {
        alert('Advance request submitted successfully');
        setAmount('');
        setReason('');
        fetchAdvances();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Helper for Status Badge
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

  // Helper for currency format
  const formatCurrency = val => Number(val || 0).toLocaleString('en-PK');

  // Helper for date
  const formatDate = dateString => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <PayrollPage>
      <PayrollHeading
        icon={Wallet}
        title="Advances and loans"
        description="Submit a request or check its status and repayment balance."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Request Form */}
        <div className="lg:col-span-1">
          <GlassCard className="p-6 sticky top-24">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-6">
              <Banknote className="h-5 w-5 text-blue-500" />
              New Request
            </h2>

            <form onSubmit={handleRequestAdvance} className="space-y-5">
              <label className="grid gap-2 text-sm">
                Request type
                <select className={field} value={kind} onChange={e => setKind(e.target.value)}>
                  <option value="advance">Salary advance</option>
                  <option value="loan">Employee loan</option>
                </select>
              </label>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Amount (Rs.)
                </label>
                <div className="relative group">
                  <span className="absolute left-3 top-2.5 text-gray-500 dark:text-slate-500 font-semibold group-focus-within:text-blue-500 transition-colors">
                    Rs.
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className={field + ' w-full pl-10'}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Reason
                </label>
                <textarea
                  className={field + ' w-full resize-y'}
                  rows={4}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Briefly explain why you need this advance..."
                  disabled={submitting}
                ></textarea>
              </div>

              <button type="submit" disabled={submitting} className={primary + ' w-full'}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Submit Request
                  </>
                )}
              </button>
            </form>
          </GlassCard>
        </div>

        {/* Right Column: Active Advances List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-purple-500" />
              Active Requests
            </h2>
            <span className="text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-full">
              {advances.length} requests
            </span>
          </div>

          {!advances || advances.length === 0 ? (
            <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
              <div className="bg-gray-100 dark:bg-white/10 p-4 rounded-full mb-3">
                <Wallet className="h-8 w-8 text-gray-400 dark:text-slate-500" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-slate-200">
                No Active Advances
              </h3>
              <p className="text-gray-500 dark:text-slate-400 max-w-xs mt-1 text-sm">
                You don't have any pending or active advance requests at the moment.
              </p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {advances.map(adv => {
                const percentage = Math.min(100, (adv.total_paid_back / adv.amount) * 100);

                return (
                  <GlassCard
                    key={adv.id}
                    className="p-5 flex flex-col justify-between hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                  >
                    <div>
                      {/* Card Header: Date & Badge */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(adv.requested_at)}
                        </div>
                        {getStatusBadge(adv.status)}
                      </div>

                      {/* Amount Display */}
                      <div className="mb-4">
                        <span className="block text-xs uppercase tracking-wider text-gray-500 dark:text-slate-400">
                          {adv.request_kind || 'advance'} requested
                        </span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                          Rs. {formatCurrency(adv.amount)}
                        </span>
                      </div>

                      {/* Progress Bar (Visualizing Repayment) */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-green-600 dark:text-green-400">
                            Paid: {formatCurrency(adv.total_paid_back)}
                          </span>
                          <span className="text-gray-500 dark:text-slate-400">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="text-right text-xs text-red-500 dark:text-red-400 font-medium mt-1">
                          Balance: Rs. {formatCurrency(adv.balance)}
                        </div>
                      </div>
                    </div>

                    {/* Footer: Reason */}
                    <div className="pt-3 border-t border-gray-100 dark:border-white/5">
                      <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2 italic">
                        "{adv.reason || 'No reason provided'}"
                      </p>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PayrollPage>
  );
}
