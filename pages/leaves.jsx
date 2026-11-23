import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, Clock3, FileText, Search, Send, UserRoundCheck } from 'lucide-react';
import Navbar from '../components/Navbar';
import Breadcrumbs from '../components/Breadcrumbs';
import Loader from '../components/Loader';
import { supabase } from '../utils/supabaseClient';
import { getClassAccess } from '../utils/classAccess';
import { useToast } from '../hooks/use-toast';

const pktDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-blue-950';
const panel = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950';

export default function LeavesPage() {
  const { toast } = useToast();
  const today = pktDate();
  const [access, setAccess] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [shortLeaves, setShortLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('leave');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ studentId: '', startDate: today, endDate: today, reason: '', application: '', status: 'approved', leftAt: new Date().toTimeString().slice(0, 5), notes: '' });

  async function loadSetup() {
    setLoading(true);
    try {
      const roleAccess = await getClassAccess();
      if (!['admin', 'superadmin', 'teacher'].includes(roleAccess.role)) throw Error('Staff access is required.');
      let query = supabase.from('classes').select('id,name').order('id');
      if (roleAccess.role === 'teacher') {
        if (!roleAccess.classIds.length) query = null;
        else query = query.in('id', roleAccess.classIds);
      }
      const result = query ? await query : { data: [], error: null };
      if (result.error) throw result.error;
      setAccess(roleAccess);
      setClasses(result.data || []);
      setClassId(String(result.data?.[0]?.id || ''));
    } catch (error) { toast({ variant: 'destructive', title: 'Unable to load leave desk', description: error.message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadSetup(); }, []);

  async function loadClassData() {
    if (!classId) { setStudents([]); setApplications([]); setShortLeaves([]); return; }
    try {
      const [studentResult, applicationsResult, shortResult] = await Promise.all([
        supabase.from('active_students').select('studentid,name,fathername').eq('class_id', classId).order('name'),
        supabase.from('student_leave_applications').select('*').eq('class_id', classId).order('start_date', { ascending: false }).limit(100),
        supabase.from('student_short_leaves').select('*').eq('class_id', classId).order('leave_date', { ascending: false }).limit(100),
      ]);
      for (const result of [studentResult, applicationsResult, shortResult]) if (result.error) throw result.error;
      setStudents(studentResult.data || []);
      setApplications(applicationsResult.data || []);
      setShortLeaves(shortResult.data || []);
    } catch (error) { toast({ variant: 'destructive', title: 'Unable to load class leave records', description: error.message }); }
  }
  useEffect(() => { void loadClassData(); }, [classId]);

  const visibleStudents = useMemo(() => students.filter(student => `${student.name} ${student.fathername} ${student.studentid}`.toLowerCase().includes(search.toLowerCase())), [students, search]);
  const studentName = id => students.find(student => student.studentid === id)?.name || id;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function save() {
    if (saving) return;
    if (!form.studentId || !form.reason.trim()) return toast({ variant: 'destructive', title: 'Complete the required fields', description: 'Select a student and enter the reason.' });
    setSaving(true);
    try {
      const rpc = tab === 'leave' ? 'save_student_leave' : 'save_student_short_leave';
      const args = tab === 'leave'
        ? { p_student_id: form.studentId, p_start_date: form.startDate, p_end_date: form.endDate, p_reason: form.reason, p_application_text: form.application, p_status: form.status }
        : { p_student_id: form.studentId, p_leave_date: form.startDate, p_left_at: form.leftAt, p_reason: form.reason, p_notes: form.notes };
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      const queued = Number(data?.queued || 0);
      toast({ title: tab === 'leave' ? 'Leave saved' : 'Short leave saved', description: queued ? `${queued} parent notice${queued === 1 ? '' : 's'} queued.` : 'Record saved.' });
      setForm(current => ({ ...current, studentId: '', reason: '', application: '', notes: '' }));
      await loadClassData();
    } catch (error) { toast({ variant: 'destructive', title: 'Could not save', description: error.message }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="min-h-screen bg-background"><Navbar /><div className="flex min-h-[60vh] items-center justify-center"><Loader /></div></div>;
  const className = classes.find(item => String(item.id) === String(classId))?.name;
  return <div className="min-h-screen bg-slate-50 pb-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100"><Navbar />
    <main className="mx-auto max-w-7xl space-y-5 px-4 pb-10 pt-24 sm:px-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Leave desk', href: '/leaves' }]} />
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-sm font-medium text-blue-600 dark:text-blue-300">Student welfare</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Leave desk</h1><p className="mt-1 text-sm text-muted-foreground">Record full-day leave applications and immediate short-leave notices in one place.</p></div>
        <label className="grid gap-1 text-sm font-semibold">Class<select className={`${field} min-w-[240px]`} value={classId} onChange={e => { setClassId(e.target.value); setForm(current => ({ ...current, studentId: '' })); }}>{!classes.length && <option value="">No assigned classes</option>}{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </section>
      {!classId ? <section className={panel}><p className="text-sm text-muted-foreground">You do not have an assigned class for leave management.</p></section> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className={`${panel} order-2 xl:order-1`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800"><div><h2 className="font-bold">Recent leave activity</h2><p className="text-sm text-muted-foreground">{className} · applications and early departures</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{applications.length + shortLeaves.length} records</span></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {applications.map(item => <article className="rounded-lg border border-slate-200 p-3 dark:border-slate-800" key={item.id}><div className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 text-blue-600" /><div className="min-w-0"><p className="font-semibold">{studentName(item.student_id)}</p><p className="text-xs text-muted-foreground">{item.start_date}{item.start_date !== item.end_date ? ` to ${item.end_date}` : ''} · <span className="capitalize">{item.status}</span></p><p className="mt-2 text-sm">{item.reason}</p>{item.application_text && <p className="mt-1 text-xs text-muted-foreground">Application: {item.application_text}</p>}</div></div></article>)}
            {shortLeaves.map(item => <article className="rounded-lg border border-amber-200 bg-amber-50/30 p-3 dark:border-amber-900 dark:bg-amber-950/20" key={item.id}><div className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-amber-600" /><div><p className="font-semibold">{studentName(item.student_id)}</p><p className="text-xs text-muted-foreground">Short leave · {item.leave_date} · {format(new Date(item.left_at), 'hh:mm a')}</p><p className="mt-2 text-sm">{item.reason}</p></div></div></article>)}
            {!applications.length && !shortLeaves.length && <p className="py-8 text-center text-sm text-muted-foreground lg:col-span-2">No leave activity has been recorded for this class.</p>}
          </div>
        </section>
        <aside className={`${panel} order-1 xl:order-2`}>
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900"><button onClick={() => setTab('leave')} className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === 'leave' ? 'bg-white shadow-sm dark:bg-slate-800' : 'text-muted-foreground'}`}><FileText className="mr-1 inline h-4 w-4" />Full-day leave</button><button onClick={() => setTab('short')} className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === 'short' ? 'bg-white shadow-sm dark:bg-slate-800' : 'text-muted-foreground'}`}><Clock3 className="mr-1 inline h-4 w-4" />Short leave</button></div>
          <div className="mt-4 space-y-3"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={`${field} pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a student" /></div><label className="grid gap-1 text-sm font-semibold">Student<select className={field} value={form.studentId} onChange={e => set('studentId', e.target.value)}><option value="">Select student</option>{visibleStudents.map(student => <option key={student.studentid} value={student.studentid}>{student.name} · {student.studentid}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm font-semibold">{tab === 'leave' ? 'From' : 'Date'}<input className={field} type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></label>{tab === 'leave' ? <label className="grid gap-1 text-sm font-semibold">To<input className={field} type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} /></label> : <label className="grid gap-1 text-sm font-semibold">Left at<input className={field} type="time" value={form.leftAt} onChange={e => set('leftAt', e.target.value)} /></label>}</div>
            {tab === 'leave' && <label className="grid gap-1 text-sm font-semibold">Status<select className={field} value={form.status} onChange={e => set('status', e.target.value)}><option value="approved">Approved leave</option><option value="pending">Pending application</option><option value="rejected">Rejected</option></select></label>}
            <label className="grid gap-1 text-sm font-semibold">Reason<textarea className={`${field} min-h-20 resize-y`} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Reason for leave" /></label>
            <label className="grid gap-1 text-sm font-semibold">{tab === 'leave' ? 'Application details (optional)' : 'Additional notes (optional)'}<textarea className={`${field} min-h-16 resize-y`} value={tab === 'leave' ? form.application : form.notes} onChange={e => set(tab === 'leave' ? 'application' : 'notes', e.target.value)} placeholder="Supporting details" /></label>
            <button disabled={saving} onClick={save} className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"><Send className="mr-2 h-4 w-4" />{saving ? 'Saving…' : tab === 'leave' ? 'Save leave application' : 'Save & queue parent notice'}</button>{tab === 'leave' && <p className="text-xs text-muted-foreground"><UserRoundCheck className="mr-1 inline h-3.5 w-3.5" />Approved leave is visible in attendance. Parent notices are queued for each relevant school day.</p>}</div>
        </aside>
      </div>}
    </main>
  </div>;
}
