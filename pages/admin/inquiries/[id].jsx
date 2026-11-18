import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, FileText, Loader2, Printer, Save, Users } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { supabase } from '../../../utils/supabaseClient';
import { parseFee, printFeeQuote, printTestSlip } from '../../../utils/printUtils';
import { updateInquiry } from '../../../utils/inquiryService';
import { BADGE_STYLES } from '../../../utils/constants';

const STAGES = ['Inquiry', 'Test Scheduled', 'Test Clear', 'Admission'];

export default function InquiryWorkspace() {
  const router = useRouter();
  const id = String(router.query.id || '');
  const [family, setFamily] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchStage, setBatchStage] = useState('');
  const [batchTestDate, setBatchTestDate] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: inquiry, error } = await supabase
        .from('inquiries')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      const { data: members, error: familyError } = await supabase
        .from('inquiries')
        .select('*')
        .eq('mobilenumber', inquiry.mobilenumber)
        .order('id');
      if (familyError) throw familyError;
      setFamily(members || [inquiry]);
      setSelectedIds([]);
      selectMember((members || [inquiry]).find(row => String(row.id) === id) || inquiry);
    } catch (error) {
      setNotice(error.message || 'Unable to load inquiry.');
    } finally {
      setLoading(false);
    }
  };
  const selectMember = member => {
    const fee = parseFee(member.quoted_fee);
    setActiveId(String(member.id));
    setDraft({
      ...member,
      date: member.date ? String(member.date).slice(0, 10) : '',
      test_date: member.test_date ? String(member.test_date).slice(0, 16) : '',
      quoted_fee: {
        admission: fee.admission,
        monthly: fee.monthly,
        annual: fee.annual,
        stationery: fee.stationery,
      },
    });
  };
  useEffect(() => {
    if (router.isReady) load();
  }, [router.isReady, id]);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const save = async () => {
    if (!draft?.name?.trim() || !draft?.fathername?.trim() || !draft?.mobilenumber?.trim())
      return setNotice('Student name, guardian name and mobile number are required.');
    setSaving(true);
    try {
      const { id: recordId, created_at, follow_up_count, ...payload } = draft;
      const saved = await updateInquiry(recordId, {
        ...payload,
        quoted_fee: JSON.stringify(draft.quoted_fee),
        test_date: draft.test_date || null,
      });
      setFamily(current => current.map(row => (String(row.id) === String(saved.id) ? saved : row)));
      selectMember(saved);
      setNotice('Inquiry record saved.');
    } catch (error) {
      setNotice(error.message || 'Unable to save this inquiry.');
    } finally {
      setSaving(false);
    }
  };
  const toggleSelected = memberId =>
    setSelectedIds(current =>
      current.includes(String(memberId))
        ? current.filter(value => value !== String(memberId))
        : [...current, String(memberId)]
    );
  const updateFamilyStage = async () => {
    if (!batchStage) return setNotice('Choose a stage for the family first.');
    if (!selectedIds.length) return setNotice('Select one or more siblings for the batch action.');
    if (batchStage === 'Test Scheduled' && !batchTestDate)
      return setNotice('Choose a test date and time before scheduling the family.');
    setBatchSaving(true);
    try {
      const payload = { status: batchStage };
      if (batchStage === 'Test Scheduled') payload.test_date = batchTestDate;
      const { error } = await supabase.from('inquiries').update(payload).in('id', selectedIds);
      if (error) throw error;
      const updated = family.map(member =>
        selectedIds.includes(String(member.id)) ? { ...member, ...payload } : member
      );
      setFamily(updated);
      const current = updated.find(member => String(member.id) === activeId);
      if (current) selectMember(current);
      setBatchStage('');
      setBatchTestDate('');
      setNotice(
        `${selectedIds.length} selected record${selectedIds.length === 1 ? '' : 's'} moved to ${batchStage}.`
      );
      setSelectedIds([]);
    } catch (error) {
      setNotice(error.message || 'Unable to update the family stage.');
    } finally {
      setBatchSaving(false);
    }
  };
  const total = Object.values(draft?.quoted_fee || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
  const brightField =
    'mt-1 border-slate-300 bg-white text-slate-900 shadow-sm dark:border-slate-300 dark:bg-white dark:text-slate-900';
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
      </div>
    );
  if (!draft)
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-3xl p-8">
          <Link href="/admin/inquiries" className="text-indigo-600 hover:underline">
            Back to inquiries
          </Link>
          <p className="mt-6 text-rose-600">{notice || 'Inquiry not found.'}</p>
        </main>
      </>
    );
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 pb-6 pt-24 md:px-8 md:pb-8 lg:gap-4">
        <Link
          href="/admin/inquiries"
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Admissions pipeline
        </Link>
        <header className="shrink-0 rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-5 text-white shadow-xl shadow-indigo-500/20">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-200">
            Family workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold">{draft.fathername || 'Applicant family'}</h1>
          <p className="mt-1 text-sm text-indigo-100">
            {family.length} applicant{family.length === 1 ? '' : 's'} linked by {draft.mobilenumber}
          </p>
          <p className="mt-4 max-w-2xl text-sm text-indigo-100/90">
            Open one applicant to edit their details. Tick one or more family members only when a
            shared stage update should apply to them.
          </p>
        </header>
        {notice && (
          <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            {notice}
          </p>
        )}
        <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px] lg:items-start">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:self-start dark:border-white/10 dark:bg-white/[.03]">
            <div className="mb-3 flex items-center gap-2 px-2 text-sm font-bold">
              <Users className="h-4 w-4 text-indigo-600" />
              Family members
            </div>
            <div className="space-y-1">
              {family.map(member => (
                <div
                  key={member.id}
                  className={`flex items-center gap-2 rounded-xl px-2 py-1 transition ${String(member.id) === activeId ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(String(member.id))}
                    onChange={() => toggleSelected(member.id)}
                    className="h-4 w-4 shrink-0 accent-indigo-600"
                    aria-label={`Select ${member.name} for batch action`}
                  />
                  <button
                    onClick={() => selectMember(member)}
                    className="min-w-0 flex-1 rounded-lg px-1 py-2 text-left"
                  >
                    <p className="truncate text-sm font-bold">{member.name}</p>
                    <p
                      className={`mt-0.5 text-xs ${String(member.id) === activeId ? 'text-white/75' : 'text-slate-500'}`}
                    >
                      {member.class || 'Class not set'} · {member.status}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          </aside>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[.03]">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{draft.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage this applicant’s record, fee quote and progress.
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${BADGE_STYLES[draft.status]}`}
              >
                {draft.status}
              </span>
            </div>
            <div className="grid gap-6">
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Applicant and guardian
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['name', 'Student name'],
                    ['class', 'Applying for class'],
                    ['previous_school', 'Previous school'],
                    ['fathername', 'Guardian name'],
                    ['mobilenumber', 'WhatsApp mobile'],
                    ['address', 'Address'],
                  ].map(([key, label]) => (
                    <label key={key} className="text-xs font-semibold text-slate-600">
                      {label}
                      <Input
                        className={brightField}
                        value={draft[key] || ''}
                        onChange={e => update(key, e.target.value)}
                      />
                    </label>
                  ))}
                  <label className="text-xs font-semibold text-slate-600">
                    Application date
                    <Input
                      type="date"
                      className={brightField}
                      value={draft.date || ''}
                      onChange={e => update('date', e.target.value)}
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Session
                    <select
                      className={`${brightField} flex h-10 w-full rounded-md px-3 text-sm`}
                      value={draft.session || 'Fall'}
                      onChange={e => update('session', e.target.value)}
                    >
                      <option>Fall</option>
                      <option>Spring</option>
                    </select>
                  </label>
                </div>
              </section>
              <section className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Fee quote
                  </h3>
                  <span className="font-bold text-indigo-700">PKR {total.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['admission', 'Admission'],
                    ['monthly', 'Monthly'],
                    ['annual', 'Annual'],
                    ['stationery', 'Stationery'],
                  ].map(([key, label]) => (
                    <label key={key} className="text-xs font-semibold text-slate-600">
                      {label}
                      <Input
                        type="number"
                        min="0"
                        className={brightField}
                        value={draft.quoted_fee?.[key] ?? 0}
                        onChange={e =>
                          update('quoted_fee', {
                            ...draft.quoted_fee,
                            [key]: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Pipeline stage
                  <select
                    className={`${brightField} flex h-10 w-full rounded-md px-3 text-sm`}
                    value={draft.status}
                    onChange={e => update('status', e.target.value)}
                  >
                    {STAGES.map(stage => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                </label>
                {draft.status === 'Test Scheduled' && (
                  <label className="text-xs font-semibold text-slate-600">
                    Test date and time
                    <Input
                      type="datetime-local"
                      className={brightField}
                      value={draft.test_date || ''}
                      onChange={e => update('test_date', e.target.value)}
                    />
                  </label>
                )}
              </section>
            </div>
          </section>
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[.03]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-black text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                {selectedIds.length}
              </span>
              <div>
                <h2 className="font-bold">Action centre</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  Changes are made only to checked applicants.
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-3 border-y border-slate-100 py-3 text-xs font-bold dark:border-white/10">
              <button
                onClick={() => setSelectedIds(family.map(member => String(member.id)))}
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-300"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Clear selection
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Update checked
                </p>
                <select
                  value={batchStage}
                  onChange={e => setBatchStage(e.target.value)}
                  className="mt-2 flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Choose a stage…</option>
                  {STAGES.map(stage => (
                    <option key={stage}>{stage}</option>
                  ))}
                </select>
              </div>
              {batchStage === 'Test Scheduled' && (
                <label className="block text-xs font-semibold text-slate-600">
                  Test date and time
                  <Input
                    type="datetime-local"
                    value={batchTestDate}
                    onChange={e => setBatchTestDate(e.target.value)}
                    className={brightField}
                  />
                </label>
              )}
              <Button
                disabled={batchSaving || !batchStage || !selectedIds.length}
                onClick={updateFamilyStage}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {batchSaving
                  ? 'Updating…'
                  : `Apply to ${selectedIds.length || 'no'} selected applicant${selectedIds.length === 1 ? '' : 's'}`}
              </Button>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-5 dark:border-white/10">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Open record
              </p>
              <Button
                disabled={saving}
                onClick={save}
                className="mt-3 w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving…' : `Save ${draft.name}`}
              </Button>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-5 dark:border-white/10">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Family documents
              </p>
              <Button
                onClick={() => printFeeQuote(family)}
                variant="outline"
                className="mt-3 w-full"
              >
                <FileText className="mr-2 h-4 w-4" />
                Print fee quote
              </Button>
              <Button
                onClick={() => printTestSlip(family.filter(row => row.test_date))}
                variant="outline"
                className="mt-2 w-full"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print test slips
              </Button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
