'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../utils/supabaseClient';
import Navbar from '../../../components/Navbar';
import Loader from '../../../components/Loader';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../components/ui/dialog';
import { useToast } from '../../../hooks/use-toast';
import { printReceipt } from '../../../utils/printReceipt';
import {
  ArrowLeft,
  Printer,
  CreditCard,
  Ban,
  ArrowRight,
  History,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Wallet,
  Search,
  FileQuestion,
  Banknote,
  Smartphone,
  UserRound,
} from 'lucide-react';

const todayLocal = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export default function PayInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoice_id');
  const { toast } = useToast();

  // --- State ---
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [invoice, setInvoice] = useState(null);
  const [student, setStudent] = useState(null);
  const [details, setDetails] = useState([]);

  // Blocking State
  const [newerInvoiceId, setNewerInvoiceId] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Data Maps
  const [paidHistoryMap, setPaidHistoryMap] = useState({});
  const [paymentInputs, setPaymentInputs] = useState({});
  const [notes, setNotes] = useState('');

  // Payment Method State
  const [paymentMethod, setPaymentMethod] = useState('cash'); // Default: Cash
  const [paymentDate, setPaymentDate] = useState(todayLocal());

  // Manual Entry State
  const [manualIdInput, setManualIdInput] = useState('');

  // Notification Toggle State (Checked by default)
  const [sendMessageToParent, setSendMessageToParent] = useState(true);

  // SuperAdmin State
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // --- Check SuperAdmin Role from localStorage ---
  useEffect(() => {
    const role = localStorage.getItem('UserRole');
    setIsSuperAdmin(role === 'superadmin');
  }, []);

  // --- Fetch Data ---
  useEffect(() => {
    if (!invoiceId) {
      setLoading(false);
      setNotFound(false);
      return;
    }
    setNotFound(false);
    fetchInvoiceData();
  }, [invoiceId]);

  const fetchInvoiceData = async () => {
    try {
      setLoading(true);

      const { data: invData, error: invError } = await supabase
        .from('fee_invoices')
        .select('*')
        .eq('id', invoiceId)
        .maybeSingle();

      if (invError) throw invError;

      if (!invData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setInvoice(invData);

      if (invData.student_id) {
        // Updated Supabase join: select classes(id, name)
        const { data: stuData } = await supabase
          .from('students')
          .select('*, classes(id, name)')
          .eq('studentid', invData.student_id)
          .single();
        setStudent(stuData);

        const { data: newerData } = await supabase
          .from('fee_invoices')
          .select('id, invoice_date')
          .eq('student_id', invData.student_id)
          .gt('invoice_date', invData.invoice_date)
          .neq('status', 'expired')
          .order('invoice_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (newerData) {
          setNewerInvoiceId(newerData.id);
          setLoading(false);
          return;
        }
      }

      const { data: detData, error: detError } = await supabase
        .from('fee_invoice_details')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('id');
      if (detError) throw detError;
      setDetails(detData);

      const { data: payHistory, error: payError } = await supabase
        .from('fee_payments')
        .select('invoice_detail_id, amount')
        .eq('invoice_id', invoiceId);
      if (payError) throw payError;

      const historyMap = {};
      payHistory.forEach(p => {
        if (p.invoice_detail_id) {
          historyMap[p.invoice_detail_id] = (historyMap[p.invoice_detail_id] || 0) + p.amount;
        }
      });
      setPaidHistoryMap(historyMap);

      const initialInputs = {};
      detData.forEach(d => {
        initialInputs[d.id] = 0;
      });
      setPaymentInputs(initialInputs);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error fetching data', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- Calculations ---
  const handleAmountChange = (detailId, val) => {
    if (parseFloat(val) < 0) return;
    const numVal = val === '' ? 0 : parseFloat(val);
    setPaymentInputs(prev => ({ ...prev, [detailId]: numVal }));
  };

  let totalPayingNow = 0;
  let isAnyItemOverpaying = false;

  const calculatedDetails = details.map(item => {
    const totalAmount = item.amount || 0;
    const alreadyPaid = paidHistoryMap[item.id] || 0;
    const remainingBalance = totalAmount - alreadyPaid;
    const payingNow = paymentInputs[item.id] || 0;

    const isOver = payingNow > remainingBalance + 0.1;
    if (isOver) isAnyItemOverpaying = true;
    totalPayingNow += payingNow;

    return {
      ...item,
      totalAmount,
      alreadyPaid,
      remainingBalance,
      payingNow,
      isOver,
      isFullyPaid: remainingBalance <= 0,
    };
  });

  const grandTotal = invoice?.total_amount || 0;
  const totalPreviouslyPaid = Object.values(paidHistoryMap).reduce((a, b) => a + b, 0);
  const globalBalance = grandTotal - totalPreviouslyPaid;

  // --- Handlers ---
  const handleManualIdSubmit = e => {
    e.preventDefault();
    if (!manualIdInput.trim()) return;
    router.push(`?invoice_id=${manualIdInput.trim()}`);
  };

  const handlePaymentSubmit = async () => {
    if (submitting || totalPayingNow <= 0 || isAnyItemOverpaying) return;
    setSubmitting(true);

    try {
      const paidAt = isSuperAdmin
        ? new Date(`${paymentDate}T12:00:00`).toISOString()
        : new Date().toISOString();
      const paymentInserts = [];
      calculatedDetails.forEach(item => {
        if (item.payingNow > 0) {
          paymentInserts.push({
            invoice_id: invoiceId,
            invoice_detail_id: item.id,
            amount: item.payingNow,
            payment_method: paymentMethod,
            notes: notes,
            paid_at: paidAt,
          });
        }
      });

      if (paymentInserts.length > 0) {
        const { error: payError } = await supabase.from('fee_payments').insert(paymentInserts);
        if (payError) throw payError;
      }

      const totalPaidAfter = totalPreviouslyPaid + totalPayingNow;
      let newStatus = 'unpaid';
      if (totalPaidAfter >= grandTotal) newStatus = 'paid';
      else if (totalPaidAfter > 0) newStatus = 'partial';

      await supabase.from('fee_invoices').update({ status: newStatus }).eq('id', invoiceId);

      // SET STUDENT TO ACTIVE IF STATUS WAS invoice_generated AND ANY PAYMENT RECEIVED
      if (totalPayingNow > 0 && student?.studentid && student?.status === 'invoice_generated') {
        const { error: activeStatusError } = await supabase
          .from('students')
          .update({ status: 'active' })
          .eq('studentid', student.studentid);

        if (activeStatusError) {
          console.error('Failed to update student status to active:', activeStatusError);
        }
      }

      // CLEAR STUDENT IF FULLY PAID
      if (totalPaidAfter >= grandTotal && student?.studentid) {
        const { error: studentUpdateError } = await supabase
          .from('students')
          .update({ Clear: true })
          .eq('studentid', student.studentid);

        if (studentUpdateError) {
          console.error('Failed to update student clear status:', studentUpdateError);
        }
      }

      // GENERATE & INSERT WHATSAPP MESSAGE (Conditional)
      if (sendMessageToParent) {
        let receiptText = `*FEE PAYMENT RECEIPT*\n`;
        receiptText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        receiptText += `👤 *Student:* ${student?.name}\n`;
        receiptText += `🆔 *DAS NUMBER:* ${student?.studentid}\n`;
        receiptText += `📄 *Invoice #:* ${invoiceId}\n\n`;

        receiptText += `*FEE BREAKDOWN (PAID)*\n`;
        receiptText += `-------------------------\n`;

        calculatedDetails.forEach(item => {
          if (item.payingNow > 0) {
            receiptText += `🔹 ${item.fee_type}: *${item.payingNow.toLocaleString()} PKR*\n`;
          }
        });

        receiptText += `-------------------------\n`;
        receiptText += `✅ *Total Received:* ${totalPayingNow.toLocaleString()} PKR\n`;
        receiptText += `💳 *Method:* ${paymentMethod.toUpperCase()}\n\n`;

        const newBalance = globalBalance - totalPayingNow;
        receiptText += ` *Remaining Balance:* ${newBalance.toLocaleString()} PKR\n\n`;
        receiptText += `_ACCOUNTS OFFICE_ \n DAR-E-ARQAM SCHOOL`;

        const parentPhone = student?.mobilenumber || '00000000000';

        const { error: msgError } = await supabase.from('messages').insert({
          student_id: student?.studentid,
          class_id: student?.class_id,
          text: receiptText,
          number: parentPhone,
        });

        if (msgError) {
          console.error('Message Table Insert Error:', msgError);
          toast({
            title: 'Note',
            description: 'Payment recorded, but failed to queue the WhatsApp notification.',
            variant: 'default',
          });
        }
      }

      setSubmitting(false);

      // Automatically trigger printing without modal confirmation
      printReceipt({
        student,
        invoiceId,
        items: calculatedDetails,
        totalPaidNow: totalPayingNow,
        balanceAfterPayment: globalBalance - totalPayingNow,
        receiptDate: paidAt,
      });

      setTimeout(() => router.push('/admin/invoices'), 1000);
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSubmitting(false);
    }
  };

  // --- Styles ---
  // Solidified dark mode backgrounds to prevent text blending issues
  const pageBackground = `min-h-screen pb-20 transition-colors duration-300
    bg-gray-50 dark:bg-slate-950
    text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-500/30`;

  const cardClass = `relative overflow-hidden rounded-xl transition-all duration-300
    bg-white border border-gray-200 shadow-sm
    dark:bg-slate-900 dark:border-slate-800 dark:shadow-none`;

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <Loader />
      </div>
    );

  // --- NOT FOUND VIEW ---
  if (notFound) {
    return (
      <>
        <Navbar />
        <div className={pageBackground + ' flex items-center justify-center pt-20'}>
          <div
            className={`${cardClass} max-w-lg w-full text-center space-y-6 p-8 border-orange-200 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-500/30`}
          >
            <div className="w-20 h-20 bg-orange-100 dark:bg-orange-500/20 rounded-full flex items-center justify-center mx-auto border border-orange-200 dark:border-orange-500/30">
              <FileQuestion className="w-10 h-10 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Invoice Not Found
              </h1>
              <p className="text-gray-600 dark:text-orange-200">
                We couldn't locate an invoice with ID <strong>#{invoiceId}</strong>. It may have
                been deleted or the ID is incorrect.
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <Button
                size="lg"
                onClick={() => router.push('/admin/fee/pay')}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                Try Another ID
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push('/admin/invoices')}
                className="text-slate-700 dark:text-slate-300"
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- MANUAL ENTRY VIEW ---
  if (!invoiceId) {
    return (
      <>
        <Navbar />
        <div className={pageBackground + ' flex items-center justify-center pt-20'}>
          <div className={`${cardClass} max-w-md w-full text-center space-y-6 p-8`}>
            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto border border-blue-100 dark:border-blue-800">
              <Search className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Find Invoice
              </h1>
              <p className="text-gray-600 dark:text-blue-300 text-sm">
                Please enter the Invoice ID to proceed.
              </p>
            </div>
            <form onSubmit={handleManualIdSubmit} className="space-y-4 pt-2">
              <div className="space-y-2 text-left">
                <Label className="text-xs uppercase font-bold text-gray-500 dark:text-slate-400">
                  Invoice ID
                </Label>
                <Input
                  autoFocus
                  placeholder="e.g. 1024"
                  value={manualIdInput}
                  onChange={e => setManualIdInput(e.target.value)}
                  className="flex h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-lg tracking-wider text-black placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus-visible:ring-blue-500"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                disabled={!manualIdInput}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12"
              >
                Search Invoice <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // --- BLOCKING UI VIEW ---
  if (newerInvoiceId) {
    return (
      <div className={pageBackground + ' flex items-center justify-center pt-20'}>
        <div
          className={`${cardClass} max-w-lg w-full text-center space-y-6 p-8 border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-500/30`}
        >
          <div className="w-20 h-20 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto border border-red-200 dark:border-red-500/30">
            <Ban className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Obsolete Invoice
            </h1>
            <p className="text-gray-600 dark:text-red-200">
              Invoice <strong>#{invoiceId}</strong> has been superseded. A newer invoice has already
              been generated.
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              size="lg"
              onClick={() => router.replace(`/admin/fee/pay?invoice_id=${newerInvoiceId}`)}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              Go to Latest Invoice (#{newerInvoiceId}) <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="text-slate-700 dark:text-slate-300"
            >
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const paymentMethods = [
    { id: 'cash', label: 'Cash', icon: Banknote },
    { id: 'jazzcash', label: 'JazzCash', icon: Smartphone },
    { id: 'easypaisa', label: 'Easypaisa', icon: Smartphone },
    ...(isSuperAdmin ? [{ id: 'adjustment', label: 'Adjustment', icon: Wallet }] : []),
  ];

  return (
    <>
      <Navbar />
      <main className={pageBackground}>
        <div className="mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-7">
          <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => router.back()}
                className="rounded-full border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Record payment</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Invoice #{invoiceId} · Select the fee items being paid.
                </p>
              </div>
            </div>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${sendMessageToParent ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              <input
                type="checkbox"
                checked={sendMessageToParent}
                onChange={e => setSendMessageToParent(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              <BellRing className="h-4 w-4" />
              <span className="font-semibold">Send parent receipt</span>
            </label>
          </header>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">
            <section className="order-2 min-w-0 space-y-6 md:col-span-2">
              <div className={`${cardClass} overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <h2 className="font-bold">Payment allocation</h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Enter an amount only against the fee items received today.
                    </p>
                  </div>
                  <CreditCard className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-xs md:min-w-[720px] md:text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                      <tr>
                        <th className="p-4">Fee item</th>
                        <th className="p-4 text-right">Billed</th>
                        <th className="p-4 text-right">Previously paid</th>
                        <th className="p-4 text-right">Due</th>
                        <th className="w-44 bg-indigo-50 p-4 text-right text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                          Receive now
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculatedDetails.map(item => (
                        <tr
                          key={item.id}
                          className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${item.isFullyPaid ? 'bg-slate-50/70 dark:bg-slate-900/40' : ''}`}
                        >
                          <td className="p-4">
                            <div className="font-semibold">{item.fee_type}</div>
                            {item.description && (
                              <div className="mt-0.5 text-xs text-slate-500">
                                {item.description}
                              </div>
                            )}
                            {item.isFullyPaid && (
                              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Paid
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-300">
                            {item.totalAmount.toLocaleString()}
                          </td>
                          <td className="p-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {item.alreadyPaid ? item.alreadyPaid.toLocaleString() : '—'}
                          </td>
                          <td className="p-4 text-right font-mono font-semibold">
                            {item.remainingBalance.toLocaleString()}
                          </td>
                          <td
                            className={`bg-indigo-50/50 p-3 dark:bg-indigo-500/[0.04] ${item.isOver ? 'bg-rose-50 dark:bg-rose-500/10' : ''}`}
                          >
                            <Input
                              type="number"
                              min="0"
                              disabled={item.remainingBalance <= 0}
                              value={paymentInputs[item.id] === 0 ? '' : paymentInputs[item.id]}
                              onChange={e => handleAmountChange(item.id, e.target.value)}
                              placeholder={
                                item.remainingBalance > 0
                                  ? item.remainingBalance.toString()
                                  : 'Paid'
                              }
                              className={`h-10 text-right font-mono dark:border-slate-700 dark:bg-slate-800 ${item.isOver ? 'border-rose-500 text-rose-600' : ''}`}
                            />
                            {item.isOver && (
                              <p className="mt-1 text-right text-xs text-rose-600">
                                Exceeds due amount
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <aside className="contents">
              <section className={`${cardClass} order-1 h-full p-5`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold">{student?.name || 'Unknown student'}</h2>
                    <p className="text-sm text-slate-500">
                      ID {student?.studentid} · {student?.classes?.name || student?.class_id || '—'}
                    </p>
                  </div>
                </div>
                <dl className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Father / guardian</dt>
                    <dd className="font-medium text-right">{student?.fathername || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Invoice date</dt>
                    <dd className="font-medium">{invoice?.invoice_date || '—'}</dd>
                  </div>
                </dl>
              </section>
              <section
                className={`${cardClass} order-1 h-full p-5 text-slate-900 dark:text-slate-100`}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Invoice balance
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Invoice total</span>
                    <b>{grandTotal.toLocaleString()}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      <History className="h-3.5 w-3.5" />
                      Previously paid
                    </span>
                    <b className="text-emerald-700 dark:text-emerald-300">
                      −{totalPreviouslyPaid.toLocaleString()}
                    </b>
                  </div>
                  <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                    <div className="flex items-end justify-between">
                      <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                        Balance due
                      </span>
                      <b className="text-2xl">PKR {globalBalance.toLocaleString()}</b>
                    </div>
                  </div>
                </div>
              </section>
              <Dialog
                open={checkoutOpen}
                onOpenChange={open => {
                  if (!submitting) setCheckoutOpen(open);
                }}
              >
                <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <DialogHeader>
                    <DialogTitle>Complete payment</DialogTitle>
                    <DialogDescription>
                      Invoice #{invoiceId} · {student?.name} · PKR {totalPayingNow.toLocaleString()}
                    </DialogDescription>
                  </DialogHeader>
                  <section>
                    <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Payment method
                    </Label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {paymentMethods.map(option => {
                        const Icon = option.icon;
                        const active = paymentMethod === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setPaymentMethod(option.id)}
                            className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold transition ${active ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
                          >
                            <Icon className="h-4 w-4" />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section>
                    <Label
                      htmlFor="notes"
                      className="text-xs font-bold uppercase tracking-widest text-slate-500"
                    >
                      Transaction note
                    </Label>
                    <Input
                      id="notes"
                      placeholder="Optional note for this receipt"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      className="mt-2 dark:border-slate-700 dark:bg-slate-800"
                    />
                    {isSuperAdmin && (
                      <>
                        <Label
                          htmlFor="paymentDate"
                          className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500"
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                          Payment date
                        </Label>
                        <Input
                          id="paymentDate"
                          type="date"
                          value={paymentDate}
                          onChange={e => setPaymentDate(e.target.value)}
                          className="mt-2 dark:border-slate-700 dark:bg-slate-800"
                        />
                      </>
                    )}
                  </section>
                  <div className="flex gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <Button
                      variant="outline"
                      disabled={submitting}
                      onClick={() => setCheckoutOpen(false)}
                      className="dark:border-slate-700 dark:bg-slate-800"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handlePaymentSubmit}
                      disabled={
                        submitting ||
                        totalPayingNow <= 0 ||
                        isAnyItemOverpaying ||
                        (isSuperAdmin && !paymentDate)
                      }
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      {submitting ? 'Recording payment…' : 'Confirm & print receipt'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <section className="order-3 flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 sm:flex-row sm:items-center sm:justify-between md:col-span-2 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-300">
                    Collection today
                  </p>
                  <p
                    className={`mt-2 text-3xl font-black ${isAnyItemOverpaying ? 'text-rose-600' : 'text-indigo-700 dark:text-indigo-300'}`}
                  >
                    PKR {totalPayingNow.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Choose payment method and add comments at checkout.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => setCheckoutOpen(true)}
                  disabled={submitting || totalPayingNow <= 0 || isAnyItemOverpaying}
                  className="h-12 w-full rounded-xl bg-indigo-600 px-8 font-bold text-white hover:bg-indigo-500 disabled:bg-slate-400 sm:w-auto"
                >
                  Continue to checkout <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
