import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../utils/supabaseClient';
import { loadClassSubjects } from '../../utils/subjects';
import { queueSubjectTeacherAlerts } from '../../utils/staffNotifications';
import { canAccessClass, getClassAccess } from '../../utils/classAccess';
import { Button } from '../../components/ui/button';
import Navbar from '../../components/Navbar';
import AssessmentNav from '../../components/AssessmentNav';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../../components/ui/select';
import {
  CheckCircle2,
  XCircle,
  Plus,
  Calendar as CalendarIcon,
  BookOpen,
  Filter,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Save,
  X,
} from 'lucide-react';

interface ClassData {
  id: number;
  name: string;
}

interface Test {
  id: number;
  test_name: string;
  test_type: string;
  subject: string;
  date: string;
  class_name: string;
  has_marks?: boolean;
}

interface DatesheetBatch {
  id: number;
  title: string;
  exam_start_date: string;
  exam_end_date: string;
  testIds: number[];
  classIds: number[];
}

const PAGE_SIZE = 20;

export default function MarksDashboard() {
  const [classSubjects, setClassSubjects] = useState<
    Record<string, { id: number; name: string }[]>
  >({});
  const [subjectError, setSubjectError] = useState('');
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [datesheets, setDatesheets] = useState<DatesheetBatch[]>([]);
  const [selectedDatesheet, setSelectedDatesheet] = useState('');
  const [showAddTest, setShowAddTest] = useState(false);
  const [addingTest, setAddingTest] = useState(false);
  const [newTest, setNewTest] = useState({
    subject: '',
    test_name: '',
    test_type: 'Monthly',
    date: new Date().toISOString().slice(0, 10),
  });

  // Auth State
  const [isAdmin, setIsAdmin] = useState(false);

  // Filters
  const [selectedClass, setSelectedClass] = useState<string>('');
  const subjectOptions = classSubjects[selectedClass] || [];
  useEffect(() => {
    setNewTest(current => ({ ...current, subject: '' }));
    setSubjectError('');
    loadClassSubjects()
      .then(setClassSubjects)
      .catch(error => setSubjectError(error.message));
  }, [selectedClass]);
  const [selectedType, setSelectedType] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Inline Editing State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Test>>({});

  /* ---------------- Check Role & Fetch Classes ---------------- */
  useEffect(() => {
    // Check local storage for admin roles
    const role = localStorage.getItem('UserRole');
    if (role === 'admin' || role === 'superadmin') {
      setIsAdmin(true);
    }

    const loadClasses = async () => {
      const access = await getClassAccess();
      if (access.role === 'teacher' && !access.classIds?.length) {
        setClasses([]);
        return;
      }
      let query = supabase.from('classes').select('id, name').order('name');
      if (access.role === 'teacher') query = query.in('id', access.classIds || []);
      const { data } = await query;
      if (data) {
        setClasses(data);
        const allowed = new Set(data.map(item => String(item.id)));
        const { data: batches } = await supabase
          .from('datesheet_batches')
          .select(
            'id,title,exam_start_date,exam_end_date,datesheet_batch_classes(class_id),datesheet_batch_tests(test_id)'
          )
          .order('exam_start_date', { ascending: false });
        setDatesheets(
          (batches || [])
            .filter(batch =>
              (batch.datesheet_batch_classes || []).some(row => allowed.has(String(row.class_id)))
            )
            .map(batch => ({
              id: batch.id,
              title: batch.title,
              exam_start_date: batch.exam_start_date,
              exam_end_date: batch.exam_end_date,
              classIds: (batch.datesheet_batch_classes || []).map(row => Number(row.class_id)),
              testIds: (batch.datesheet_batch_tests || []).map(row => Number(row.test_id)),
            }))
        );
      }
    };
    loadClasses();
  }, []);

  /* ---------------- Fetch Tests (Paginated) ---------------- */
  const fetchTests = useCallback(
    async (pageIndex: number) => {
      if (!selectedClass) {
        setTests([]);
        setTotalCount(0);
        return;
      }
      if (!canAccessClass(await getClassAccess(), selectedClass)) {
        setTests([]);
        setTotalCount(0);
        return;
      }

      setLoading(true);

      try {
        const from = pageIndex * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const selectedBatch = datesheets.find(batch => String(batch.id) === selectedDatesheet);
        if (selectedBatch && !selectedBatch.testIds.length) {
          setTests([]);
          setTotalCount(0);
          return;
        }
        let query = supabase
          .from('tests')
          .select('id, test_name, test_type, subject, date, class_name', { count: 'exact' })
          .eq('class_id', selectedClass)
          .order('date', { ascending: false })
          .range(from, to);

        if (selectedBatch) query = query.in('id', selectedBatch.testIds);

        if (selectedType && selectedType !== 'all') {
          query = query.eq('test_type', selectedType);
        }

        const { data: testsData, count, error } = await query;

        if (error) throw error;

        setTotalCount(count || 0);

        if (!testsData || testsData.length === 0) {
          setTests([]);
          return;
        }

        const testIds = testsData.map(t => t.id);

        const { data: marksData, error: marksError } = await supabase
          .from('marks')
          .select('test_id')
          .in('test_id', testIds);

        if (marksError) throw marksError;

        const marksMap = (marksData || []).reduce((acc: Record<number, number>, m: any) => {
          acc[m.test_id] = (acc[m.test_id] || 0) + 1;
          return acc;
        }, {});

        setTests(
          testsData.map(t => ({
            ...t,
            has_marks: (marksMap[t.id] ?? 0) > 0,
          }))
        );
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    },
    [selectedClass, selectedType, selectedDatesheet, datesheets]
  );

  /* ---------------- Auto-Fetch on Class or Page Change ---------------- */
  useEffect(() => {
    fetchTests(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, currentPage, selectedDatesheet]);

  const chooseDatesheet = (value: string) => {
    setSelectedDatesheet(value);
    setCurrentPage(0);
    setShowAddTest(false);
    if (!value) return;
    const batch = datesheets.find(item => String(item.id) === value);
    if (batch) setSelectedClass(String(batch.classIds[0] || ''));
  };

  const applyFilters = () => {
    if (currentPage !== 0) setCurrentPage(0);
    else fetchTests(0);
  };

  /* ---------------- Admin Actions ---------------- */
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this test? This action cannot be undone.'))
      return;
    if (!canAccessClass(await getClassAccess(), selectedClass)) return;

    setLoading(true);
    const { error } = await supabase
      .from('tests')
      .delete()
      .eq('id', id)
      .eq('class_id', selectedClass);
    if (!error) {
      fetchTests(currentPage);
    } else {
      console.error('Error deleting test:', error);
      setLoading(false);
    }
  };

  const startEditing = (test: Test) => {
    setEditingId(test.id);
    setEditForm({
      test_name: test.test_name,
      subject: test.subject,
      test_type: test.test_type,
      date: test.date,
    });
  };

  const handleSaveEdit = async (id: number) => {
    if (!subjectOptions.some(s => s.name === editForm.subject)) {
      setSubjectError(
        'Choose a subject assigned to this class in Timetable → Subjects & class assignments.'
      );
      return;
    }
    if (!canAccessClass(await getClassAccess(), selectedClass)) return;
    setLoading(true);
    const { error } = await supabase
      .from('tests')
      .update({
        test_name: editForm.test_name,
        subject: editForm.subject,
        test_type: editForm.test_type,
        date: editForm.date,
      })
      .eq('id', id)
      .eq('class_id', selectedClass);

    if (!error) {
      setEditingId(null);
      fetchTests(currentPage);
    } else {
      console.error('Error updating test:', error);
      setLoading(false);
    }
  };

  const addTestToDatesheet = async () => {
    if (!subjectOptions.some(s => s.name === newTest.subject)) {
      setSubjectError('Choose a subject assigned to this class.');
      return;
    }
    const batch = datesheets.find(item => String(item.id) === selectedDatesheet);
    if (!batch || !selectedClass || !newTest.subject.trim() || !newTest.date) return;
    if (!batch.classIds.includes(Number(selectedClass))) return;
    if (!canAccessClass(await getClassAccess(), selectedClass)) return;

    setAddingTest(true);
    try {
      const className = classes.find(item => String(item.id) === selectedClass)?.name || '';
      const testName = newTest.test_name.trim() || `${batch.title} – ${newTest.subject.trim()}`;
      const { data: test, error: testError } = await supabase
        .from('tests')
        .insert({
          subject: newTest.subject.trim(),
          test_name: testName,
          test_type: newTest.test_type,
          date: newTest.date,
          class_id: Number(selectedClass),
          class_name: className,
        })
        .select('id')
        .single();
      if (testError) throw testError;

      const { error: linkError } = await supabase
        .from('datesheet_batch_tests')
        .insert({ batch_id: batch.id, test_id: test.id });
      if (linkError) throw linkError;
      try {
        await queueSubjectTeacherAlerts(
          selectedClass,
          newTest.subject.trim(),
          teacher =>
            `*New Test Created*\n\nDear ${teacher.name || 'Teacher'}, a test was added for your scheduled subject.\n\nClass: ${className || selectedClass}\nSubject: ${newTest.subject.trim()}\nTest: ${testName}\nDate: ${newTest.date}`
        );
      } catch (error) {
        console.error('Unable to queue new test alerts:', error);
        setSubjectError('Test added to the datesheet. Teacher alerts could not be queued.');
      }

      setDatesheets(current =>
        current.map(item =>
          item.id === batch.id ? { ...item, testIds: [...item.testIds, Number(test.id)] } : item
        )
      );
      setNewTest({
        subject: '',
        test_name: '',
        test_type: 'Monthly',
        date: new Date().toISOString().slice(0, 10),
      });
      setShowAddTest(false);
      setCurrentPage(0);
      await fetchTests(0);
    } catch (error) {
      console.error('Error adding a test to datesheet:', error);
    } finally {
      setAddingTest(false);
    }
  };

  /* ---------------- Pagination Handlers ---------------- */
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const handlePrevPage = () => setCurrentPage(p => Math.max(0, p - 1));
  const handleNextPage = () => setCurrentPage(p => Math.min(totalPages - 1, p + 1));

  /* ---------------- Helper: Date Formatter ---------------- */
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };
  const activeDatesheet = datesheets.find(batch => String(batch.id) === selectedDatesheet);
  const canAddTestToDatesheet = Boolean(
    activeDatesheet && selectedClass && activeDatesheet.classIds.includes(Number(selectedClass))
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-8">
        <AssessmentNav />
        {subjectError && (
          <p
            role="alert"
            className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            {subjectError}
          </p>
        )}

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Marks Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Select a datesheet, enter marks, then move directly to its result reports.
            </p>
          </div>
          {isAdmin ? (
            <Link href="/admin/datesheet-builder">
              <Button className="w-full sm:w-auto rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow hover:shadow-blue-500/20 transition-all">
                <Plus className="mr-2 h-4 w-4" /> Plan datesheet
              </Button>
            </Link>
          ) : (
            <Button
              disabled={!canAddTestToDatesheet}
              onClick={() => setShowAddTest(current => !current)}
              className="w-full rounded-full bg-blue-600 text-white shadow transition-all hover:bg-blue-700 hover:shadow-blue-500/20 sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" /> Add test to datesheet
            </Button>
          )}
        </div>

        {/* Filters Card */}
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl p-5">
          <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">
            <div className="w-full md:w-auto flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Datesheet
              </label>
              <Select
                value={selectedDatesheet}
                onValueChange={value => chooseDatesheet(value === 'all' ? '' : value)}
              >
                <SelectTrigger className="w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10">
                  <SelectValue placeholder="Standalone tests" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Standalone tests</SelectItem>
                  {datesheets.map(batch => (
                    <SelectItem key={batch.id} value={String(batch.id)}>
                      {batch.title} · {batch.exam_start_date} to {batch.exam_end_date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-auto flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Select Class
              </label>
              <Select
                value={selectedClass || 'all'}
                onValueChange={v => setSelectedClass(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10">
                  <SelectValue placeholder="Choose a class..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes
                    .filter(c => !activeDatesheet || activeDatesheet.classIds.includes(c.id))
                    .map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-auto flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Test Type
              </label>
              <Select onValueChange={v => setSelectedType(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10">
                  <SelectValue placeholder="Filter by type (Optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Midterm-1">Midterm-1</SelectItem>
                  <SelectItem value="Midterm-2">Midterm-2</SelectItem>
                  <SelectItem value="Terminal-1">Terminal-1</SelectItem>
                  <SelectItem value="Terminal-2">Terminal-2</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={applyFilters}
              disabled={!selectedClass || loading}
              className="w-full md:w-auto rounded-full bg-gray-900 text-white hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white transition-all"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Filter className="mr-2 h-4 w-4" />
              )}
              Apply Filters
            </Button>
          </div>
        </div>

        {showAddTest && activeDatesheet && (
          <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/20">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Add a paper to {activeDatesheet.title}</h2>
                <p className="text-sm text-gray-600 dark:text-slate-300">
                  This adds one test for the selected class and keeps it inside this datesheet.
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowAddTest(false)}>
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <select
                value={newTest.subject}
                onChange={event =>
                  setNewTest(current => ({ ...current, subject: event.target.value }))
                }
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/10"
              >
                <option value="">Select class subject</option>
                {subjectOptions.map(s => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              {(!subjectOptions.length || subjectError) && (
                <p role="status" className="text-sm text-amber-700">
                  {subjectError ||
                    'No subjects assigned. Ask an admin to configure this class in Timetable → Subjects & class assignments.'}
                </p>
              )}
              <input
                value={newTest.test_name}
                onChange={event =>
                  setNewTest(current => ({ ...current, test_name: event.target.value }))
                }
                placeholder="Paper name (optional)"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/10"
              />
              <input
                type="date"
                value={newTest.date}
                onChange={event =>
                  setNewTest(current => ({ ...current, date: event.target.value }))
                }
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/10"
              />
              <div className="flex gap-2">
                <select
                  value={newTest.test_type}
                  onChange={event =>
                    setNewTest(current => ({ ...current, test_type: event.target.value }))
                  }
                  className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/10"
                >
                  {['Midterm-1', 'Midterm-2', 'Terminal-1', 'Terminal-2', 'Monthly'].map(type => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <Button
                  onClick={addTestToDatesheet}
                  disabled={addingTest || !newTest.subject.trim() || !newTest.date}
                  className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                >
                  {addingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add paper'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Tests List / Table */}
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl shadow-sm dark:shadow-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" /> Active Tests
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-full">
              Total: {totalCount}
            </span>
          </div>

          <div className="relative min-h-[300px]">
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            )}

            {!loading && tests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-8 w-8 text-gray-400 mb-3" />
                <p className="text-gray-500 text-sm">
                  {selectedClass ? 'No tests found.' : 'Please select a class.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto flex flex-col justify-between h-full">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 uppercase text-xs font-semibold border-b">
                    <tr>
                      <th className="px-6 py-4">Test Details</th>
                      <th className="px-6 py-4 hidden md:table-cell">Type</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {tests.map(t => {
                      const isEditing = editingId === t.id;

                      return (
                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          {/* Column 1: Test Details */}
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <div className="space-y-2">
                                <input
                                  value={editForm.test_name || ''}
                                  onChange={e =>
                                    setEditForm({ ...editForm, test_name: e.target.value })
                                  }
                                  className="w-full text-sm border border-gray-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800"
                                  placeholder="Test Name"
                                />
                                <select
                                  value={editForm.subject || ''}
                                  onChange={e =>
                                    setEditForm({ ...editForm, subject: e.target.value })
                                  }
                                  className="w-full text-xs border border-gray-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-gray-500"
                                >
                                  <option value="">Choose assigned subject</option>
                                  {subjectOptions.map(s => (
                                    <option key={s.id} value={s.name}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <>
                                <div className="font-semibold text-gray-900 dark:text-slate-200">
                                  {t.test_name}
                                </div>
                                <div className="text-xs font-normal text-gray-500 mt-0.5">
                                  {t.subject}
                                </div>
                                <span className="md:hidden mt-2 inline-block bg-gray-100 dark:bg-white/10 text-[10px] px-2 py-0.5 rounded-full">
                                  {t.test_type}
                                </span>
                              </>
                            )}
                          </td>

                          {/* Column 2: Test Type */}
                          <td className="px-6 py-4 hidden md:table-cell">
                            {isEditing ? (
                              <select
                                value={editForm.test_type || ''}
                                onChange={e =>
                                  setEditForm({ ...editForm, test_type: e.target.value })
                                }
                                className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-sm"
                              >
                                <option value="Midterm-1">Midterm-1</option>
                                <option value="Midterm-2">Midterm-2</option>
                                <option value="Terminal-1">Terminal-1</option>
                                <option value="Terminal-2">Terminal-2</option>
                                <option value="Monthly">Monthly</option>
                              </select>
                            ) : (
                              <span className="bg-gray-100 dark:bg-white/10 text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-white/10 font-medium">
                                {t.test_type}
                              </span>
                            )}
                          </td>

                          {/* Column 3: Date */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.date || ''}
                                onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                                className="w-28 text-sm border border-gray-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800"
                                placeholder="YYYY-MM-DD"
                              />
                            ) : (
                              <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                                <CalendarIcon className="w-4 h-4 text-gray-400" />
                                {formatDate(t.date)}
                              </div>
                            )}
                          </td>

                          {/* Column 4: Status */}
                          <td className="px-6 py-4 text-center">
                            {t.has_marks ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="w-4 h-4 text-amber-500 mx-auto" />
                            )}
                          </td>

                          {/* Column 5: Actions */}
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleSaveEdit(t.id)}
                                  className="h-8 w-8 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                >
                                  <Save className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                  className="h-8 w-8 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                {isAdmin && !selectedDatesheet && (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => startEditing(t)}
                                      className="h-8 w-8 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleDelete(t.id)}
                                      className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                <Link href={`/marks/${t.id}`}>
                                  <Button size="sm" variant="outline" className="rounded-full ml-2">
                                    {t.has_marks ? 'Edit' : 'Enter'}
                                  </Button>
                                </Link>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="p-4 border-t border-gray-200 dark:border-white/10 flex items-center justify-between bg-gray-50 dark:bg-white/5 mt-auto">
                    <p className="text-sm text-gray-500">
                      Showing page <span className="font-medium">{currentPage + 1}</span> of{' '}
                      <span className="font-medium">{totalPages}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={currentPage === 0}
                      >
                        <ChevronLeft className="w-4 h-4" /> Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages - 1}
                      >
                        Next <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
