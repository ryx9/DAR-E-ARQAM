import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import Navbar from '../components/Navbar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import ActivityRichEditor from '../components/ActivityRichEditor';
import { printOfficeOrder } from '../utils/officeOrderReports';
import { FileText, Loader2, Pencil, Plus, Printer, RefreshCw, Send, Users, X } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const newOrderNumber = () => `OO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
const blankForm = () => ({
  order_number: newOrderNumber(),
  title: '',
  issued_on: today(),
  content: '',
  recipientIds: [],
});
const formatDate = value =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default function OfficeOrders() {
  const [orders, setOrders] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const isSuperadmin = profile?.role?.toLowerCase() === 'superadmin';
  const activeOrder = useMemo(
    () => orders.find(order => String(order.id) === String(activeId)) || orders[0] || null,
    [orders, activeId]
  );
  const selectedRecipients = new Set(form.recipientIds.map(String));
  const card =
    'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[.04]';
  const field =
    'w-full rounded-md border-gray-200 bg-gray-50 text-gray-900 dark:border-white/10 dark:bg-white/10 dark:text-slate-100';

  useEffect(() => {
    void initialise();
  }, []);

  async function initialise() {
    setLoading(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = auth.user?.id;
      const [{ data: ownProfile, error: profileError }, { data: staff, error: staffError }] =
        await Promise.all([
          userId
            ? supabase.from('profiles').select('id, role, name').eq('id', userId).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('profiles').select('id, name, mobilenumber, role, is_active').order('name'),
        ]);
      if (profileError || staffError) throw profileError || staffError;
      setProfile(ownProfile);
      setTeachers(
        (staff || []).filter(
          item => item.role?.toLowerCase() === 'teacher' && item.is_active !== false
        )
      );
      await loadOrders(ownProfile);
    } catch (error) {
      setNotice(
        error.message || 'Unable to load office orders. Run database/office_orders.sql first.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders(currentProfile = profile) {
    const { data, error } = await supabase
      .from('office_orders')
      .select(
        'id, order_number, title, content, issued_on, created_at, office_order_recipients(profile_id, profiles(id, name, mobilenumber, is_active))'
      )
      .order('issued_on', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    const allOrders = (data || []).map(order => ({
      ...order,
      recipientIds: (order.office_order_recipients || []).map(row => row.profile_id),
      recipients: (order.office_order_recipients || []).map(row => row.profiles).filter(Boolean),
    }));
    const visible =
      currentProfile?.role?.toLowerCase() === 'superadmin'
        ? allOrders
        : allOrders.filter(order =>
            order.recipientIds.map(String).includes(String(currentProfile?.id))
          );
    setOrders(visible);
    setActiveId(current => current || visible[0]?.id || null);
  }

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const toggleRecipient = id =>
    setForm(current => ({
      ...current,
      recipientIds: current.recipientIds.map(String).includes(String(id))
        ? current.recipientIds.filter(value => String(value) !== String(id))
        : [...current.recipientIds, id],
    }));
  const reset = () => {
    setForm(blankForm());
    setEditingId(null);
  };

  function editOrder(order) {
    setEditingId(order.id);
    setForm({
      order_number: order.order_number || '',
      title: order.title || '',
      issued_on: order.issued_on || today(),
      content: order.content || '',
      recipientIds: order.recipientIds || [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveOrder(event) {
    event.preventDefault();
    if (!isSuperadmin) return;
    if (!form.order_number.trim() || !form.title.trim() || !form.content.trim()) {
      setNotice('Add an order number, title and formatted order text.');
      return;
    }
    if (!form.recipientIds.length) {
      setNotice('Assign at least one active teacher.');
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        order_number: form.order_number.trim(),
        title: form.title.trim(),
        issued_on: form.issued_on,
        content: form.content,
      };
      let orderId = editingId;
      if (editingId) {
        const { error } = await supabase.from('office_orders').update(payload).eq('id', editingId);
        if (error) throw error;
        const { error: removeError } = await supabase
          .from('office_order_recipients')
          .delete()
          .eq('office_order_id', editingId);
        if (removeError) throw removeError;
      } else {
        const { data, error } = await supabase
          .from('office_orders')
          .insert({ ...payload, created_by: auth.user?.id || null })
          .select('id')
          .single();
        if (error) throw error;
        orderId = data.id;
      }
      const { error: recipientError } = await supabase
        .from('office_order_recipients')
        .insert(form.recipientIds.map(profile_id => ({ office_order_id: orderId, profile_id })));
      if (recipientError) throw recipientError;

      let queued = 0;
      if (!editingId) {
        const recipients = teachers.filter(
          item => form.recipientIds.map(String).includes(String(item.id)) && item.mobilenumber
        );
        if (recipients.length) {
          const { error: messageError } = await supabase.from('messages').insert(
            recipients.map(teacher => ({
              number: teacher.mobilenumber,
              sent: false,
              text: `*New Office Order*\n\nDear ${teacher.name || 'Teacher'}, a new office order has been issued.\n\n*${payload.order_number}* — ${payload.title}\nIssued: ${formatDate(payload.issued_on)}\n\nPlease sign in to review the full order.`,
            }))
          );
          if (messageError) throw messageError;
          queued = recipients.length;
        }
      }
      setNotice(
        editingId
          ? 'Office order updated.'
          : `Office order created. ${queued} WhatsApp alert${queued === 1 ? '' : 's'} queued.`
      );
      reset();
      await loadOrders(profile);
      setActiveId(orderId);
    } catch (error) {
      setNotice(error.message || 'Unable to save the office order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 text-gray-900 transition-colors dark:from-[#0b1220] dark:to-[#05070c] dark:text-slate-100">
      <Navbar />
      <main className="container mx-auto max-w-7xl space-y-6 p-4 pt-24 md:p-8 md:pt-28">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Office orders</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Official directions for the teachers assigned to each order.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={initialise}
            disabled={loading}
            className="rounded-full"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </header>
        {notice && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900 dark:border-purple-900/60 dark:bg-purple-950/30 dark:text-purple-200">
            {notice}
          </div>
        )}

        {isSuperadmin && (
          <section className={card}>
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[.04]">
              <div className="flex items-center gap-2 font-semibold">
                <Plus className="h-4 w-4 text-purple-600" />
                {editingId ? 'Edit office order' : 'Create office order'}
              </div>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>
            <form onSubmit={saveOrder} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-12">
              <div className="md:col-span-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Order number
                </label>
                <Input
                  required
                  value={form.order_number}
                  onChange={event => update('order_number', event.target.value)}
                  className={field}
                />
              </div>
              <div className="md:col-span-6">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Order title
                </label>
                <Input
                  required
                  value={form.title}
                  onChange={event => update('title', event.target.value)}
                  placeholder="e.g. Term examination invigilation duties"
                  className={field}
                />
              </div>
              <div className="md:col-span-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Issue date
                </label>
                <Input
                  required
                  type="date"
                  value={form.issued_on}
                  onChange={event => update('issued_on', event.target.value)}
                  className={field}
                />
              </div>
              <div className="md:col-span-12">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Office order text
                </label>
                <ActivityRichEditor
                  value={form.content}
                  onChange={value => update('content', value)}
                  placeholder="Write the order, instructions, duties, tables and lists…"
                />
              </div>
              <fieldset className="md:col-span-12">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Assigned active teachers
                </legend>
                <div className="flex flex-wrap gap-2">
                  {teachers.map(teacher => (
                    <label
                      key={teacher.id}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${selectedRecipients.has(String(teacher.id)) ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5'}`}
                    >
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={selectedRecipients.has(String(teacher.id))}
                        onChange={() => toggleRecipient(teacher.id)}
                      />
                      {teacher.name || teacher.id}
                    </label>
                  ))}
                </div>
                {!teachers.length && (
                  <p className="text-sm text-gray-500">No active teacher profiles are available.</p>
                )}
              </fieldset>
              <div className="md:col-span-12 flex justify-end">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-purple-700 text-white hover:bg-purple-800"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {editingId ? 'Save changes' : 'Create and queue alerts'}
                </Button>
              </div>
            </form>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className={`${card} h-fit overflow-hidden`}>
            <div className="border-b border-gray-200 p-4 dark:border-white/10">
              <div className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4 text-purple-600" />
                Available orders
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {isSuperadmin ? 'All issued orders' : 'Orders assigned to you'}
              </p>
            </div>
            {loading ? (
              <div className="flex justify-center p-10">
                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-white/10">
                {orders.length ? (
                  orders.map(order => (
                    <button
                      key={order.id}
                      onClick={() => setActiveId(order.id)}
                      className={`w-full p-4 text-left transition-colors ${String(activeOrder?.id) === String(order.id) ? 'bg-purple-50 dark:bg-purple-950/30' : 'hover:bg-gray-50 dark:hover:bg-white/[.03]'}`}
                    >
                      <p className="text-xs font-bold text-purple-700 dark:text-purple-300">
                        {order.order_number}
                      </p>
                      <p className="mt-1 font-semibold">{order.title}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(order.issued_on)} · {order.recipients.length} teacher
                        {order.recipients.length === 1 ? '' : 's'}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="p-6 text-sm text-gray-500">No office orders are available.</p>
                )}
              </div>
            )}
          </aside>
          <article className={`${card} min-w-0 overflow-hidden`}>
            {activeOrder ? (
              <>
                <div className="flex flex-col justify-between gap-4 border-b border-gray-200 bg-gray-50/70 p-5 sm:flex-row sm:items-start dark:border-white/10 dark:bg-white/[.04]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                      {activeOrder.order_number} · {formatDate(activeOrder.issued_on)}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">{activeOrder.title}</h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Assigned to{' '}
                      {activeOrder.recipients
                        .map(person => person.name)
                        .filter(Boolean)
                        .join(', ') || 'selected teachers'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => printOfficeOrder(activeOrder)}>
                      <Printer className="mr-2 h-4 w-4" />
                      Print PDF
                    </Button>
                    {isSuperadmin && (
                      <Button variant="outline" onClick={() => editOrder(activeOrder)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  className="office-order-content p-6"
                  dangerouslySetInnerHTML={{ __html: activeOrder.content }}
                />
              </>
            ) : (
              <div className="p-12 text-center text-gray-500">
                <Users className="mx-auto mb-3 h-8 w-8 text-purple-400" />
                Choose an office order to read it.
              </div>
            )}
          </article>
        </section>
      </main>
      <style jsx global>{`
        .office-order-content h1 {
          font-size: 1.7rem;
          font-weight: 700;
          color: #432c88;
          margin: 1rem 0;
        }
        .office-order-content h2 {
          font-size: 1.35rem;
          font-weight: 700;
          color: #432c88;
          margin: 1rem 0;
        }
        .office-order-content h3 {
          font-size: 1.1rem;
          font-weight: 700;
          color: #432c88;
          margin: 0.9rem 0;
        }
        .office-order-content p {
          margin: 0.65rem 0;
          line-height: 1.7;
        }
        .office-order-content ul,
        .office-order-content ol {
          margin: 0.75rem 0;
          padding-left: 1.65rem;
        }
        .office-order-content li {
          margin: 0.3rem 0;
        }
        .office-order-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          table-layout: fixed;
        }
        .office-order-content th,
        .office-order-content td {
          border: 1px solid #d8d0ea;
          padding: 0.55rem 0.7rem;
          text-align: left;
          vertical-align: top;
          overflow-wrap: anywhere;
        }
        .office-order-content th {
          background: #432c88;
          color: #fff;
        }
        .office-order-content blockquote {
          border-left: 4px solid #ffe900;
          background: #faf9ff;
          padding: 0.6rem 0.9rem;
          color: #4b5563;
        }
        .office-order-content hr {
          border: 0;
          border-top: 1px solid #cfc5e4;
          margin: 1rem 0;
        }
      `}</style>
    </div>
  );
}
