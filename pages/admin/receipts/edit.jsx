'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../utils/supabaseClient';
import Navbar from '../../../components/Navbar';
import Loader from '../../../components/Loader';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useToast } from '../../../hooks/use-toast';
import { ArrowLeft, Save, ShieldAlert } from 'lucide-react';

const localDate = value => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

function EditReceiptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const paymentIds = searchParams.get('payment_ids')?.split(',').filter(Boolean) || [];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [payments, setPayments] = useState([]);
  const [receiptDate, setReceiptDate] = useState('');
  const [student, setStudent] = useState(null);
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    const isSuperAdmin = localStorage.getItem('UserRole')?.toLowerCase() === 'superadmin';
    setAllowed(isSuperAdmin);
    if (isSuperAdmin) fetchReceipt();
    else setLoading(false);
  }, []);

  const fetchReceipt = async () => {
    if (!paymentIds.length) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('fee_payments')
        .select(
          `
          id, invoice_id, invoice_detail_id, amount, payment_method, notes, paid_at,
          fee_invoice_details ( id, fee_type, amount ),
          fee_invoices ( id, total_amount, students ( studentid, name, fathername ) )
        `
        )
        .in('id', paymentIds)
        .order('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Receipt not found');

      const invoiceId = data[0].invoice_id;
      if (data.some(payment => payment.invoice_id !== invoiceId)) {
        throw new Error('The selected payments do not belong to one receipt');
      }
      setPayments(
        data.map(payment => ({
          ...payment,
          amount: Number(payment.amount || 0),
          notes: payment.notes || '',
        }))
      );
      setReceiptDate(localDate(data[0].paid_at));
      setInvoice(data[0].fee_invoices);
      setStudent(data[0].fee_invoices?.students);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to load receipt',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePayment = (id, field, value) => {
    setPayments(current =>
      current.map(payment => (payment.id === id ? { ...payment, [field]: value } : payment))
    );
  };

  const handleSave = async () => {
    if (!receiptDate) {
      toast({ title: 'Receipt date is required', variant: 'destructive' });
      return;
    }
    if (
      payments.some(
        payment =>
          payment.amount === '' ||
          Number(payment.amount) < 0 ||
          Number.isNaN(Number(payment.amount))
      )
    ) {
      toast({ title: 'Enter a valid amount for every fee head', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Midday avoids a local date being displayed as the previous day in the existing date-only reports.
      const paidAt = new Date(`${receiptDate}T12:00:00`).toISOString();
      const { error } = await supabase.from('fee_payments').upsert(
        payments.map(payment => ({
          id: payment.id,
          invoice_id: payment.invoice_id,
          invoice_detail_id: payment.invoice_detail_id,
          amount: Number(payment.amount),
          payment_method: payment.payment_method,
          notes: payment.notes || null,
          paid_at: paidAt,
        }))
      );
      if (error) throw error;

      const { data: allPayments, error: paymentsError } = await supabase
        .from('fee_payments')
        .select('amount')
        .eq('invoice_id', payments[0].invoice_id);
      if (paymentsError) throw paymentsError;
      const totalPaid = (allPayments || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const status =
        totalPaid >= Number(invoice?.total_amount || 0)
          ? 'paid'
          : totalPaid > 0
            ? 'partial'
            : 'unpaid';
      const { error: statusError } = await supabase
        .from('fee_invoices')
        .update({ status })
        .eq('id', payments[0].invoice_id);
      if (statusError) throw statusError;

      toast({ title: 'Receipt updated' });
      router.push('/admin/receipts');
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to update receipt',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader />
      </div>
    );

  if (!allowed)
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="text-center bg-white dark:bg-slate-900 rounded-xl p-8 shadow border">
            <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold">Superadmin access required</h1>
            <Button className="mt-5" onClick={() => router.push('/admin/receipts')}>
              Back to receipts
            </Button>
          </div>
        </div>
      </>
    );

  if (!payments.length)
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="text-center">
            <p className="mb-4">Receipt not found.</p>
            <Button onClick={() => router.push('/admin/receipts')}>Back to receipts</Button>
          </div>
        </div>
      </>
    );

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Edit Fee Receipt</h1>
              <p className="text-sm text-slate-500">
                {student?.name} · Invoice #{invoice?.id}
              </p>
            </div>
          </div>
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="max-w-xs space-y-2">
              <Label>Receipt date</Label>
              <Input
                type="date"
                value={receiptDate}
                onChange={event => setReceiptDate(event.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-3">Fee head</th>
                    <th className="text-left p-3">Amount</th>
                    <th className="text-left p-3">Payment method</th>
                    <th className="text-left p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(payment => (
                    <tr
                      key={payment.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="p-3 font-medium">
                        {payment.fee_invoice_details?.fee_type || 'General payment'}
                      </td>
                      <td className="p-3 min-w-[130px]">
                        <Input
                          type="number"
                          min="0"
                          value={payment.amount}
                          onChange={event =>
                            updatePayment(payment.id, 'amount', event.target.value)
                          }
                        />
                      </td>
                      <td className="p-3 min-w-[145px]">
                        <select
                          value={payment.payment_method || 'cash'}
                          onChange={event =>
                            updatePayment(payment.id, 'payment_method', event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3"
                        >
                          <option value="cash">Cash</option>
                          <option value="jazzcash">JazzCash</option>
                          <option value="easypaisa">EasyPaisa</option>
                          <option value="adjustment">Adjustment</option>
                        </select>
                      </td>
                      <td className="p-3 min-w-[180px]">
                        <Input
                          value={payment.notes}
                          onChange={event => updatePayment(payment.id, 'notes', event.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  <Loader small />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> Save receipt
                  </>
                )}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export default function EditReceiptPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader />
        </div>
      }
    >
      <EditReceiptContent />
    </Suspense>
  );
}
