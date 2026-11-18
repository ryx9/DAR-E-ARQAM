import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, CalendarDays, FileText, Loader2, MapPin, UserRound } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { Button } from '../../components/ui/button';
import { getClassAccess } from '../../utils/classAccess';
import { supabase } from '../../utils/supabaseClient';
import { downloadActivityReport } from '../../utils/activityReports';

const statuses = {
  planned: ['Planned', 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'],
  confirmed: ['Confirmed', 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'],
  in_progress: [
    'In progress',
    'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  ],
  completed: [
    'Completed',
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  ],
  cancelled: ['Cancelled', 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'],
};
const date = value =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

export default function ActivityDetail() {
  const router = useRouter();
  const [activity, setActivity] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const card =
    'rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl';
  useEffect(() => {
    if (router.isReady) load();
  }, [router.isReady, router.query.id]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const access = await getClassAccess();
      const { data, error: fetchError } = await supabase
        .from('school_activities')
        .select(
          'id,title,status,description,start_date,end_date,venue,responsible_name,created_at,school_activity_classes(class_id,classes(id,name))'
        )
        .eq('id', router.query.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) throw new Error('This activity could not be found.');
      const assigned = data.school_activity_classes || [];
      const item = {
        ...data,
        classIds: assigned.map(row => row.class_id),
        classNames: assigned.map(row => row.classes?.name).filter(Boolean),
      };
      if (
        access.role === 'teacher' &&
        !item.classIds.some(id => (access.classIds || []).map(String).includes(String(id)))
      )
        throw new Error('This activity is not assigned to one of your classes.');
      setActivity(item);
    } catch (caught) {
      setError(caught.message || 'Unable to load this activity.');
    } finally {
      setLoading(false);
    }
  }

  if (loading)
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b1220]">
        <Navbar />
        <div className="flex justify-center py-32">
          <Loader2 className="h-9 w-9 animate-spin text-blue-500" />
        </div>
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b1220]">
        <Navbar />
        <main className="container mx-auto max-w-4xl p-6">
          <Button variant="ghost" asChild>
            <Link href="/activities">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All activities
            </Link>
          </Button>
          <div className={`${card} mt-5 p-8 text-center`}>
            <h1 className="text-xl font-semibold">Activity unavailable</h1>
            <p className="mt-2 text-gray-500">{error}</p>
          </div>
        </main>
      </div>
    );
  const [statusLabel, statusClass] = statuses[activity.status] || statuses.planned;
  const schedule = `${date(activity.start_date)}${activity.end_date && activity.end_date !== activity.start_date ? ` — ${date(activity.end_date)}` : ''}`;
  const info = [
    [CalendarDays, 'Schedule', schedule],
    [MapPin, 'Venue', activity.venue || 'To be confirmed'],
    [UserRound, 'Responsible person', activity.responsible_name || 'Not specified'],
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100">
      <Navbar />
      <main className="container mx-auto max-w-5xl p-4 md:p-8 space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/activities">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All activities
          </Link>
        </Button>
        <section className={`${card} overflow-hidden`}>
          <div className="border-l-4 border-indigo-500 bg-gradient-to-r from-indigo-50 to-white p-6 dark:from-indigo-950/30 dark:to-transparent md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:justify-between">
              <div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight">{activity.title}</h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                  Activity record · Created {date(activity.created_at?.slice(0, 10))}
                </p>
              </div>
              <Button
                onClick={() => downloadActivityReport(activity)}
                className="h-10 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <FileText className="mr-2 h-4 w-4" />
                Download brief
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-px bg-gray-200 dark:bg-white/10 sm:grid-cols-3">
            {info.map(([Icon, label, value]) => (
              <div key={label} className="bg-white p-5 dark:bg-slate-950/20">
                <Icon className="mb-2 h-5 w-5 text-blue-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {label}
                </p>
                <p className="mt-1 text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>
        <section className={`${card} p-6 md:p-8`}>
          <h2 className="text-lg font-semibold">Classes involved</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {activity.classNames.map(name => (
              <span
                key={name}
                className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
              >
                {name}
              </span>
            ))}
          </div>
        </section>
        <section className={`${card} p-6 md:p-8`}>
          <h2 className="text-lg font-semibold">Activity details</h2>
          {activity.description ? (
            <div
              className="activity-rich-content mt-5 text-[15px] leading-7 text-gray-700 dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: activity.description }}
            />
          ) : (
            <p className="mt-3 text-sm text-gray-500">No activity details were added.</p>
          )}
        </section>
      </main>
    </div>
  );
}
