import { useEffect, useMemo, useState, useTransition } from 'react';
import { supabase } from '../utils/supabaseClient';
import { getClassAccess } from '../utils/classAccess';
import Navbar from '../components/Navbar';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import ActivityRichEditor from '../components/ActivityRichEditor';
import {
  CalendarDays,
  Check,
  Edit3,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { downloadActivityCalendar, downloadActivityReport } from '../utils/activityReports';

const blankForm = () => ({
  title: '',
  description: '',
  start_date: '',
  end_date: '',
  venue: '',
  responsible_name: '',
  responsible_profile: '',
  classIds: [],
});
const formatDate = value =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default function Activities() {
  const [activities, setActivities] = useState([]),
    [classes, setClasses] = useState([]),
    [profiles, setProfiles] = useState([]);
  const [access, setAccess] = useState(null),
    [isCommitteeMember, setIsCommitteeMember] = useState(false),
    [loading, setLoading] = useState(true);
  const [saving, startTransition] = useTransition();
  const [form, setForm] = useState(blankForm),
    [editingId, setEditingId] = useState(null),
    [startDate, setStartDate] = useState(''),
    [endDate, setEndDate] = useState('');
  const [notice, setNotice] = useState(''),
    [committeeProfileId, setCommitteeProfileId] = useState('');
  const canManage = access?.role === 'superadmin' || isCommitteeMember,
    isSuperadmin = access?.role === 'superadmin';
  const glassCard =
    'rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl';
  const label =
    'text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block';
  const input =
    'w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 rounded-md';

  useEffect(() => {
    initialise();
  }, []);

  async function initialise() {
    setLoading(true);
    try {
      const [classAccess, auth] = await Promise.all([getClassAccess(), supabase.auth.getUser()]);
      setAccess(classAccess);
      const userId = auth.data.user?.id;
      const [{ data: allClasses, error: classError }, { data: membership }] = await Promise.all([
        supabase.from('classes').select('id, name').order('id'),
        userId
          ? supabase
              .from('activity_committee_members')
              .select('profile_id')
              .eq('profile_id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (classError) throw classError;
      // Committee members may coordinate activities across the school even when
      // their normal account role is teacher. Other teachers only see their classes.
      const visibleClasses =
        classAccess.role === 'teacher' && !membership
          ? (allClasses || []).filter(item =>
              (classAccess.classIds || []).map(String).includes(String(item.id))
            )
          : allClasses || [];
      setClasses(visibleClasses);
      setIsCommitteeMember(Boolean(membership));
      if (classAccess.role === 'superadmin') await loadProfiles();
      await loadActivities(classAccess, visibleClasses);
    } catch (error) {
      setNotice(
        error.message || 'Unable to load activities. Run supabase/activities_workflow.sql first.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadProfiles() {
    const [{ data, error }, { data: members, error: memberError }] = await Promise.all([
      supabase.from('profiles').select('id, name, role, is_active').order('name'),
      supabase.from('activity_committee_members').select('profile_id'),
    ]);
    if (error || memberError) throw error || memberError;
    const memberIds = new Set((members || []).map(member => member.profile_id));
    setProfiles(
      (data || [])
        .filter(profile => profile.role?.toLowerCase() === 'teacher' && profile.is_active !== false)
        .map(profile => ({ ...profile, isCommittee: memberIds.has(profile.id) }))
    );
  }

  async function loadActivities(currentAccess = access, visibleClasses = classes) {
    const { data, error } = await supabase
      .from('school_activities')
      .select(
        'id, title, description, start_date, end_date, venue, responsible_name, responsible_profile, created_at, school_activity_classes(class_id, classes(id, name))'
      )
      .order('start_date', { ascending: true });
    if (error) throw error;
    const allowedIds = new Set((visibleClasses || []).map(item => String(item.id)));
    setActivities(
      (data || [])
        .map(item => {
          const assignments = item.school_activity_classes || [];
          return {
            ...item,
            classIds: assignments.map(a => a.class_id),
            classNames: assignments.map(a => a.classes?.name).filter(Boolean),
          };
        })
        .filter(
          item =>
            currentAccess?.role !== 'teacher' ||
            item.classIds.some(id => allowedIds.has(String(id)))
        )
    );
  }

  const filteredActivities = useMemo(
    () =>
      activities.filter(
        item =>
          (!startDate || (item.end_date || item.start_date) >= startDate) &&
          (!endDate || item.start_date <= endDate)
      ),
    [activities, startDate, endDate]
  );
  const updateForm = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const toggleClass = classId =>
    setForm(previous => ({
      ...previous,
      classIds: previous.classIds.includes(classId)
        ? previous.classIds.filter(id => id !== classId)
        : [...previous.classIds, classId],
    }));
  const resetForm = () => {
    setForm(blankForm());
    setEditingId(null);
  };

  async function saveActivity(event) {
    event.preventDefault();
    if (!canManage) return;
    if (!form.title.trim() || !form.start_date || !form.classIds.length)
      return setNotice('Add an activity title, start date and at least one class.');
    if (form.end_date && form.end_date < form.start_date)
      return setNotice('The end date cannot be before the start date.');
    startTransition(async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const payload = {
          title: form.title.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date,
          end_date: form.end_date || null,
          venue: form.venue.trim() || null,
          responsible_name: form.responsible_name.trim() || null,
          responsible_profile: form.responsible_profile || null,
        };
        let activityId = editingId;
        if (editingId) {
          const { error } = await supabase
            .from('school_activities')
            .update(payload)
            .eq('id', editingId);
          if (error) throw error;
          const { error: removeError } = await supabase
            .from('school_activity_classes')
            .delete()
            .eq('activity_id', editingId);
          if (removeError) throw removeError;
        } else {
          const { data, error } = await supabase
            .from('school_activities')
            .insert({ ...payload, created_by: auth.user?.id || null })
            .select('id')
            .single();
          if (error) throw error;
          activityId = data.id;
        }
        const { error: classError } = await supabase
          .from('school_activity_classes')
          .insert(form.classIds.map(class_id => ({ activity_id: activityId, class_id })));
        if (classError) throw classError;
        setNotice(
          editingId ? 'Activity updated.' : 'Activity created and assigned to its classes.'
        );
        resetForm();
        await loadActivities();
      } catch (error) {
        setNotice(error.message || 'Unable to save this activity.');
      }
    });
  }

  function editActivity(activity) {
    setEditingId(activity.id);
    setForm({
      title: activity.title || '',
      description: activity.description || '',
      start_date: activity.start_date || '',
      end_date: activity.end_date || '',
      venue: activity.venue || '',
      responsible_name: activity.responsible_name || '',
      responsible_profile: activity.responsible_profile || '',
      classIds: activity.classIds || [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function addCommitteeMember() {
    if (!committeeProfileId) return;
    try {
      const { error } = await supabase
        .from('activity_committee_members')
        .insert({ profile_id: committeeProfileId });
      if (error) throw error;
      setCommitteeProfileId('');
      await loadProfiles();
      setNotice('Committee member added.');
    } catch (error) {
      setNotice(error.message || 'Unable to add committee member.');
    }
  }
  async function removeCommitteeMember(profileId) {
    try {
      const { error } = await supabase
        .from('activity_committee_members')
        .delete()
        .eq('profile_id', profileId);
      if (error) throw error;
      await loadProfiles();
      setNotice('Committee member removed.');
    } catch (error) {
      setNotice(error.message || 'Unable to remove committee member.');
    }
  }
  async function makeCalendar() {
    try {
      await downloadActivityCalendar({
        activities: filteredActivities,
        classes,
        startDate,
        endDate,
      });
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />
      <main className="container mx-auto max-w-6xl p-4 md:p-8 space-y-7">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Activities</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              School events, class assignments and calendars in one place.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={initialise}
            disabled={loading}
            className="rounded-full border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        {notice && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            {notice}
          </div>
        )}
        {canManage && (
          <section className={glassCard}>
            <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/10 flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Plus className="h-4 w-4 text-blue-500" />
                {editingId ? 'Edit activity' : 'Create activity'}
              </h2>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
            <form onSubmit={saveActivity} className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <label className={label}>Activity title</label>
                <Input
                  required
                  value={form.title}
                  onChange={e => updateForm('title', e.target.value)}
                  className={input}
                  placeholder="e.g. Science Exhibition"
                />
              </div>
              <div className="md:col-span-3">
                <label className={label}>Start date</label>
                <Input
                  required
                  type="date"
                  value={form.start_date}
                  onChange={e => updateForm('start_date', e.target.value)}
                  className={`${input} dark:[color-scheme:dark]`}
                />
              </div>
              <div className="md:col-span-3">
                <label className={label}>End date</label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={e => updateForm('end_date', e.target.value)}
                  className={`${input} dark:[color-scheme:dark]`}
                />
              </div>
              <div className="md:col-span-1 flex items-end">
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="md:col-span-12">
                <label className={label}>Activity details</label>
                <ActivityRichEditor
                  value={form.description}
                  onChange={value => updateForm('description', value)}
                  placeholder="Write the purpose, programme, instructions or checklist…"
                />
              </div>
              <div className="md:col-span-3">
                <label className={label}>Venue</label>
                <Input
                  value={form.venue}
                  onChange={e => updateForm('venue', e.target.value)}
                  className={input}
                  placeholder="School auditorium"
                />
              </div>
              <div className="md:col-span-3">
                <label className={label}>Responsible person</label>
                <Input
                  value={form.responsible_name}
                  onChange={e => updateForm('responsible_name', e.target.value)}
                  className={input}
                  placeholder="Name / coordinator"
                />
              </div>
              <fieldset className="md:col-span-12">
                <legend className={label}>Classes involved</legend>
                <div className="flex flex-wrap gap-2">
                  {classes.map(item => (
                    <label
                      key={item.id}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${form.classIds.includes(item.id) ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5'}`}
                    >
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={form.classIds.includes(item.id)}
                        onChange={() => toggleClass(item.id)}
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </form>
          </section>
        )}
        {isSuperadmin && (
          <section className={`${glassCard} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <h2 className="font-semibold">Event management committee</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Only these members and superadmins can create or edit activities.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                className={`${input} h-10 px-3`}
                value={committeeProfileId}
                onChange={e => setCommitteeProfileId(e.target.value)}
              >
                <option value="">Select staff member…</option>
                {profiles
                  .filter(profile => !profile.isCommittee)
                  .map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name || profile.id} {profile.role ? `(${profile.role})` : ''}
                    </option>
                  ))}
              </select>
              <Button
                type="button"
                onClick={addCommitteeMember}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add member
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {profiles
                .filter(profile => profile.isCommittee)
                .map(profile => (
                  <span
                    key={profile.id}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                  >
                    {profile.name || profile.id}
                    <button
                      onClick={() => removeCommitteeMember(profile.id)}
                      aria-label={`Remove ${profile.name || 'member'}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              {!profiles.some(profile => profile.isCommittee) && (
                <span className="text-sm text-gray-500">No committee members yet.</span>
              )}
            </div>
          </section>
        )}
        <section className={`${glassCard} p-5`}>
          <div className="flex flex-col lg:flex-row gap-4 lg:items-end justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>From</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className={`${input} dark:[color-scheme:dark]`}
                />
              </div>
              <div>
                <label className={label}>To</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className={`${input} dark:[color-scheme:dark]`}
                />
              </div>
            </div>
            <Button
              onClick={makeCalendar}
              disabled={!startDate || !endDate}
              className="bg-gray-900 hover:bg-black dark:bg-slate-200 dark:text-slate-900"
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              Download calendar PDF
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
            The landscape report starts with an all-class colour-coded calendar, followed by one
            calendar page for every visible class.
          </p>
        </section>
        <section className={glassCard}>
          <div className="p-4 border-b border-gray-200 dark:border-white/10">
            <h2 className="font-semibold">Scheduled activities</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {filteredActivities.length} activity{filteredActivities.length === 1 ? '' : 'ies'} in
              view.
            </p>
          </div>
          {loading ? (
            <div className="flex justify-center p-14">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : filteredActivities.length ? (
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {filteredActivities.map(activity => (
                <article
                  key={activity.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center gap-4 hover:bg-gray-50/70 dark:hover:bg-white/[.02]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-lg">{activity.title}</h3>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        {activity.classNames.join(', ') || 'No classes'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                      {formatDate(activity.start_date)}
                      {activity.end_date && activity.end_date !== activity.start_date
                        ? ` — ${formatDate(activity.end_date)}`
                        : ''}
                      {activity.venue ? ` · ${activity.venue}` : ''}
                      {activity.responsible_name ? ` · ${activity.responsible_name}` : ''}
                    </p>
                    {activity.description && (
                      <div
                        className="activity-rich-content mt-3 text-sm text-gray-700 dark:text-slate-300"
                        dangerouslySetInnerHTML={{ __html: activity.description }}
                      />
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadActivityReport(activity)}
                    >
                      <FileText className="h-4 w-4 mr-1.5" />
                      Brief
                    </Button>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => editActivity(activity)}>
                        <Edit3 className="h-4 w-4 mr-1.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="p-14 text-center text-gray-500 dark:text-slate-400">
              No activities match this period.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
