'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabaseClient';
import { printReceipt } from '../../utils/printReceipt';
import Navbar from '../../components/Navbar';
import Loader from '../../components/Loader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Search,
  FileText,
  Calendar,
  RefreshCcw,
  Filter,
  Printer,
  Banknote,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

function FeeReceiptsContent() {
  const router = useRouter();
  const { toast } = useToast();

  // --- State ---
  const [loading, setLoading] = useState(true);
  const [printingId, setPrintingId] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Pagination
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    classId: '',
    startDate: '',
    endDate: '',
  });

  const [debouncedSearch, setDebouncedSearch] = useState('');

  // --- Initialization ---
  useEffect(() => {
    fetchClasses();
    setIsSuperAdmin(localStorage.getItem('UserRole')?.toLowerCase() === 'superadmin');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
      if (filters.search !== debouncedSearch) setPage(0);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    fetchReceipts();
  }, [page, filters.classId, filters.startDate, filters.endDate, debouncedSearch]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('id, name');
    setClasses(data || []);
  };

  // --- 1. FETCH & GROUP PAYMENTS ---
  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const hasDeepFilter = debouncedSearch || filters.classId;
      const joinType = hasDeepFilter ? '!inner' : '';

      let query = supabase
        .from('fee_payments')
        .select(
          `
          *,
          fee_invoice_details (
            fee_type
          ),
          fee_invoices${joinType} (
            id,
            invoice_date,
            students${joinType} (
              studentid,
              name,
              fathername,
              class_id,
              classes ( name )
            )
          )
        `,
          { count: 'exact' }
        )
        .order('paid_at', { ascending: false })
        .range(from, to);

      if (filters.startDate) query = query.gte('paid_at', filters.startDate);
      if (filters.endDate) query = query.lte('paid_at', filters.endDate);

      if (filters.classId) {
        query = query.eq('fee_invoices.students.class_id', filters.classId);
      }

      if (debouncedSearch) {
        const isNumeric = !isNaN(debouncedSearch) && !isNaN(parseFloat(debouncedSearch));
        if (isNumeric) {
          query = query.or(
            `id.eq.${debouncedSearch},fee_invoices.students.name.ilike.%${debouncedSearch}%`
          );
        } else {
          query = query.ilike('fee_invoices.students.name', `%${debouncedSearch}%`);
        }
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // --- GROUPING LOGIC FOR SAME DATE AND INVOICE ---
      const groupedMap = new Map();
      const groupedData = [];

      (data || []).forEach(rcpt => {
        const dateStr = new Date(rcpt.paid_at).toLocaleDateString();
        const key = `${rcpt.invoice_id}_${dateStr}`;

        if (!groupedMap.has(key)) {
          const newGroup = {
            ...rcpt,
            amount: rcpt.amount || 0,
            feeLabels: new Set([rcpt.fee_invoice_details?.fee_type || 'General Payment']),
            paymentMethods: new Set([rcpt.payment_method || 'Cash']),
            groupedPayments: [rcpt],
          };
          groupedMap.set(key, newGroup);
          groupedData.push(newGroup);
        } else {
          const existing = groupedMap.get(key);
          existing.amount += rcpt.amount || 0;
          existing.feeLabels.add(rcpt.fee_invoice_details?.fee_type || 'General Payment');
          existing.paymentMethods.add(rcpt.payment_method || 'Cash');
          existing.groupedPayments.push(rcpt);
        }
      });

      groupedData.forEach(g => {
        g.displayFeeLabel = Array.from(g.feeLabels).join(', ');
        g.displayMethod = Array.from(g.paymentMethods).join(', ');
      });

      setReceipts(groupedData);
      setTotalCount(count || 0);
    } catch (error) {
      console.error(error);
      toast({ title: 'Failed to load receipts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, filters.classId, filters.startDate, filters.endDate, debouncedSearch]);

  // --- 2. PRINT LOGIC ---
  const handlePrintReceipt = async groupedPayment => {
    setPrintingId(groupedPayment.id);
    try {
      const invoiceId = groupedPayment.invoice_id;
      if (!invoiceId) throw new Error('Invoice data missing');

      // A. Fetch Invoice Total Amount
      const { data: invoiceData, error: invError } = await supabase
        .from('fee_invoices')
        .select('total_amount')
        .eq('id', invoiceId)
        .single();

      if (invError) throw invError;

      // B. Fetch ALL historical payments ordered chronologically to compute running balance
      const { data: allPayments, error: payError } = await supabase
        .from('fee_payments')
        .select('id, amount, paid_at')
        .eq('invoice_id', invoiceId)
        .order('paid_at', { ascending: true })
        .order('id', { ascending: true });

      if (payError) throw payError;

      // C. Build a map of cumulative paid up to and including each payment id
      //    so we can derive the remaining balance after each individual payment
      let cumulative = 0;
      const cumulativeMap = new Map();
      allPayments.forEach(p => {
        cumulative += p.amount || 0;
        cumulativeMap.set(p.id, cumulative);
      });

      const invoiceTotal = invoiceData.total_amount || 0;
      const totalPaidHistory = cumulative;
      const balance = Math.max(0, invoiceTotal - totalPaidHistory);

      // D. Generate line items with part-wise amount and remaining balance after each part
      const studentData = groupedPayment.fee_invoices?.students || {};

      // Sort grouped payments chronologically (by id as proxy within same-day group)
      const sortedGrouped = [...groupedPayment.groupedPayments].sort((a, b) => a.id - b.id);

      const receiptItems = sortedGrouped.map(p => {
        const feeReason = p.fee_invoice_details?.fee_type || 'General Fee Payment';
        const paidUpToThis = cumulativeMap.get(p.id) ?? 0;
        const remainingAfterThis = Math.max(0, invoiceTotal - paidUpToThis);
        return {
          fee_type: `${feeReason} (${p.payment_method || 'Cash'})`,
          payingNow: p.amount || 0, // this part's specific amount
          remainingBalance: remainingAfterThis, // balance remaining after this part
        };
      });

      // E. Execute Print — pass paid_at as receiptDate (A)
      printReceipt({
        student: studentData,
        invoiceId: invoiceId,
        paymentId: groupedPayment.groupedPayments.map(p => p.id).join(', '),
        items: receiptItems,
        totalPaidNow: groupedPayment.amount,
        balanceAfterPayment: balance,
        receiptDate: groupedPayment.paid_at, // A: actual payment date
      });

      toast({ title: 'Receipt generated' });
    } catch (error) {
      console.error('Print Error:', error);
      toast({
        title: 'Failed to generate receipt',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setPrintingId(null);
    }
  };

  const getInitials = name => {
    return name
      ? name
          .split(' ')
          .map(n => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase()
      : '??';
  };

  const handleDeleteReceipt = async groupedPayment => {
    if (!isSuperAdmin) return;
    if (
      !confirm(
        `Delete ${groupedPayment.groupedPayments.length} payment record(s) from this receipt? This cannot be undone.`
      )
    )
      return;

    setDeletingId(groupedPayment.id);
    try {
      const paymentIds = groupedPayment.groupedPayments.map(payment => payment.id);
      const invoiceId = groupedPayment.invoice_id;
      const { error } = await supabase.from('fee_payments').delete().in('id', paymentIds);
      if (error) throw error;

      // Keep the invoice status correct after its payments have changed.
      const [
        { data: invoice, error: invoiceError },
        { data: remainingPayments, error: paymentsError },
      ] = await Promise.all([
        supabase.from('fee_invoices').select('total_amount').eq('id', invoiceId).single(),
        supabase.from('fee_payments').select('amount').eq('invoice_id', invoiceId),
      ]);
      if (invoiceError) throw invoiceError;
      if (paymentsError) throw paymentsError;

      const paid = (remainingPayments || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const status =
        paid >= Number(invoice.total_amount || 0) ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      const { error: statusError } = await supabase
        .from('fee_invoices')
        .update({ status })
        .eq('id', invoiceId);
      if (statusError) throw statusError;

      toast({ title: 'Receipt deleted' });
      fetchReceipts();
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to delete receipt',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  // --- Styling Constants ---
  const pageBackground =
    'min-h-screen bg-slate-50 dark:bg-[#0f172a] dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-slate-900 dark:via-[#0a0f1d] dark:to-black text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-500/30 transition-colors duration-300';
  const panelStyle =
    'bg-white border border-slate-200 shadow-sm rounded-xl dark:bg-white/5 dark:backdrop-blur-md dark:border-white/10 dark:shadow-none transition-all duration-300';
  const inputStyle =
    'bg-white border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500 placeholder:text-slate-400 dark:bg-white/5 dark:border-white/10 dark:text-slate-100 dark:focus:ring-white/20 dark:focus:border-white/20 transition-all duration-300';
  const thStyle =
    'px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 sticky top-0 z-20 border-b border-slate-200 dark:border-white/10';

  return (
    <>
      <Navbar />
      <div className={pageBackground}>
        <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {/* --- HEADER --- */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white dark:bg-white/10 dark:text-white shadow-sm">
                  <FileText className="h-5 w-5" />
                </span>
                <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Payment Receipts
                </h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium ml-1">
                View transaction history and generate print receipts.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => router.push('/admin/fee/pay')}
                className="bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-md dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:shadow-emerald-900/20"
              >
                <Banknote className="w-4 h-4 mr-2" />
                Pay Fee
              </Button>

              <Button
                variant="ghost"
                onClick={fetchReceipts}
                className="h-10 w-10 p-0 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-300 shadow-sm"
              >
                <RefreshCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* --- MAIN CARD --- */}
          <div className={`${panelStyle} flex flex-col overflow-hidden`}>
            {/* FILTERS */}
            <div className="p-5 border-b border-slate-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-center bg-slate-50/50 dark:bg-transparent">
              {/* Search */}
              <div className="lg:col-span-6 relative group">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 dark:group-focus-within:text-white transition-colors" />
                <Input
                  placeholder="Search student name or payment ID..."
                  className={`pl-10 h-10 ${inputStyle}`}
                  value={filters.search}
                  onChange={e => setFilters({ ...filters, search: e.target.value })}
                />
              </div>

              {/* Class Filter */}
              <div className="lg:col-span-2">
                <select
                  className={`h-10 w-full rounded-md px-3 text-sm outline-none cursor-pointer ${inputStyle}`}
                  value={filters.classId}
                  onChange={e => {
                    setFilters({ ...filters, classId: e.target.value });
                    setPage(0);
                  }}
                >
                  <option value="" className="text-slate-900 dark:text-slate-900">
                    All Classes
                  </option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id} className="text-slate-900 dark:text-slate-900">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filters */}
              <div className="lg:col-span-4 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="date"
                    className={`h-10 text-xs ${inputStyle} [color-scheme:light] dark:[color-scheme:dark]`}
                    value={filters.startDate}
                    onChange={e => {
                      setFilters({ ...filters, startDate: e.target.value });
                      setPage(0);
                    }}
                  />
                </div>
                <div className="relative flex-1">
                  <Input
                    type="date"
                    className={`h-10 text-xs ${inputStyle} [color-scheme:light] dark:[color-scheme:dark]`}
                    value={filters.endDate}
                    onChange={e => {
                      setFilters({ ...filters, endDate: e.target.value });
                      setPage(0);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto min-h-[500px] relative bg-white dark:bg-transparent">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={`${thStyle} w-32`}>ID(s)</th>
                    <th className={thStyle}>Student Information</th>
                    <th className={thStyle}>Payment For</th>
                    <th className={`${thStyle} text-right`}>Total Paid</th>
                    <th className={`${thStyle} text-center`}>Method</th>
                    <th className={`${thStyle} text-right pr-8`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="h-64">
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                          <Loader small={false} />
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Loading records...
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : receipts.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center opacity-60">
                          <Filter className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="text-lg font-medium text-slate-500 dark:text-slate-400">
                            No payments found
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    receipts.map(rcpt => {
                      const student = rcpt.fee_invoices?.students;
                      const className = student?.classes?.name;

                      return (
                        <tr
                          key={rcpt.id}
                          className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-150"
                        >
                          {/* MULTIPLE IDs */}
                          <td className="px-6 py-5 text-xs font-mono text-slate-500 dark:text-slate-400">
                            <div className="flex flex-wrap gap-1">
                              {rcpt.groupedPayments.map(p => (
                                <span key={p.id}>#{p.id}</span>
                              ))}
                            </div>
                          </td>

                          {/* Student Info */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300 flex items-center justify-center text-sm font-bold border border-slate-200 dark:border-white/5">
                                {getInitials(student?.name)}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                                  {student?.name || 'Unknown'}
                                </span>
                                <span className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                                    {className || 'N/A'}
                                  </span>
                                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                  <span>{student?.fathername}</span>
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Payment For / Date */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col text-sm">
                              <span className="text-slate-700 dark:text-slate-200 font-medium">
                                {rcpt.displayFeeLabel}
                              </span>
                              <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                {new Date(rcpt.paid_at).toLocaleDateString()}
                              </span>
                            </div>
                          </td>

                          {/* Amount (SUMMED) */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-base text-slate-900 dark:text-white">
                                {Number(rcpt.amount).toLocaleString()}
                              </span>
                              <span className="text-[10px] uppercase font-bold text-slate-400">
                                PKR
                              </span>
                            </div>
                          </td>

                          {/* Method */}
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/5">
                              {rcpt.displayMethod}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 text-right pr-8">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePrintReceipt(rcpt)}
                                disabled={printingId === rcpt.id}
                                className="h-8 text-xs font-medium border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                              >
                                {printingId === rcpt.id ? (
                                  <Loader small />
                                ) : (
                                  <>
                                    <Printer className="w-3.5 h-3.5 mr-1.5" /> Receipt
                                  </>
                                )}
                              </Button>
                              {isSuperAdmin && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      router.push(
                                        `/admin/receipts/edit?payment_ids=${rcpt.groupedPayments.map(payment => payment.id).join(',')}`
                                      )
                                    }
                                    className="h-8 px-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-400/30 dark:text-blue-300 dark:hover:bg-blue-950"
                                    title="Edit receipt"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteReceipt(rcpt)}
                                    disabled={deletingId === rcpt.id}
                                    className="h-8 px-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-400/30 dark:text-red-400 dark:hover:bg-red-950"
                                    title="Delete receipt"
                                  >
                                    {deletingId === rcpt.id ? (
                                      <Loader small />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* --- PAGINATION --- */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium order-2 sm:order-1">
                Showing raw entries{' '}
                <span className="text-slate-900 dark:text-white font-bold">
                  {receipts.length > 0 ? page * ITEMS_PER_PAGE + 1 : 0}
                </span>{' '}
                -{' '}
                <span className="text-slate-900 dark:text-white font-bold">
                  {Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)}
                </span>{' '}
                of <span className="text-slate-900 dark:text-white font-bold">{totalCount}</span>
              </div>

              <div className="flex items-center gap-2 order-1 sm:order-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  className="h-8 text-xs bg-white hover:bg-slate-100 border-slate-300 text-slate-700 dark:bg-white/10 dark:hover:bg-white/20 dark:border-transparent dark:text-white"
                >
                  Previous
                </Button>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded min-w-[3rem] text-center dark:bg-white/10 dark:text-white dark:border-white/5">
                  {page + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * ITEMS_PER_PAGE >= totalCount || loading}
                  className="h-8 text-xs bg-white hover:bg-slate-100 border-slate-300 text-slate-700 dark:bg-white/10 dark:hover:bg-white/20 dark:border-transparent dark:text-white"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function FeeReceiptsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
          <Loader />
        </div>
      }
    >
      <FeeReceiptsContent />
    </Suspense>
  );
}
