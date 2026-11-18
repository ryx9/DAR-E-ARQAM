'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabaseClient';
import Navbar from '../../components/Navbar';
import Loader from '../../components/Loader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Plus,
  Edit,
  Trash2,
  Filter,
  Search,
  ChevronDown,
  CheckCircle2,
  Check,
  XCircle,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  DollarSign,
  UserX,
  UserCheck,
  EyeOff,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../hooks/use-toast';
import {
  printBonafideCertificate,
  printMigrationCertificate,
  printSchoolLeavingCertificate,
} from '../../utils/studentCertificates';

export default function StudentsPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [classes, setClasses] = useState([]);

  const [filterClasses, setFilterClasses] = useState([]);
  const [filterClear, setFilterClear] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [selectedStudents, setSelectedStudents] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [targetClassId, setTargetClassId] = useState('');
  const [bulkClassLoading, setBulkClassLoading] = useState(false);

  const [feeAdjustAmount, setFeeAdjustAmount] = useState('');
  const [feeAdjustLoading, setFeeAdjustLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingClear, setLoadingClear] = useState(null);
  const [loadingLeave, setLoadingLeave] = useState(null);
  const [migrationStudent, setMigrationStudent] = useState(null);
  const [migrationBranch, setMigrationBranch] = useState('');
  const [feePaidTill, setFeePaidTill] = useState('');

  useEffect(() => {
    fetchClasses();
    fetchStudents();
  }, []);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('id', { ascending: true });
    setClasses(data || []);
  };

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase.from('students').select('*, classes(name)');
    setAllStudents(data || []);
    setLoading(false);
  };

  useEffect(() => {
    let filtered = [...allStudents];

    // Filter by active/inactive status
    if (showInactive) {
      filtered = filtered.filter(s => s.status === 'inactive');
    } else {
      filtered = filtered.filter(s => s.status !== 'inactive');
    }

    if (filterClasses.length > 0) {
      filtered = filtered.filter(s => filterClasses.includes(String(s.class_id)));
    }

    if (filterClear.length > 0) {
      filtered = filtered.filter(s => filterClear.includes(s.Clear ? 'TRUE' : 'FALSE'));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        s => s.name.toLowerCase().includes(q) || String(s.studentid).includes(q)
      );
    }

    filtered.sort((a, b) => {
      if (a.class_id === b.class_id) return a.name.localeCompare(b.name);
      return a.class_id - b.class_id;
    });

    setStudents(filtered);
  }, [filterClasses, filterClear, searchQuery, allStudents, showInactive]);

  const handleManageRedirect = (id = null) => {
    if (id) {
      router.push(`/admin/managestudent?id=${id}`);
    } else {
      router.push('/admin/managestudent');
    }
  };

  const handleDelete = async id => {
    if (!window.confirm('Are you sure? This cannot be undone.')) return;
    await supabase.from('students').delete().eq('studentid', id);
    toast({ title: 'Student deleted 🗑️' });
    fetchStudents();
  };

  const handleClearChange = async (id, value) => {
    setLoadingClear(id);
    await supabase.from('students').update({ Clear: value }).eq('studentid', id);
    setAllStudents(prev => prev.map(s => (s.studentid === id ? { ...s, Clear: value } : s)));
    setLoadingClear(null);
  };

  const handleLeave = async id => {
    if (
      !window.confirm("Mark this student as inactive (left)? They won't appear in the active list.")
    )
      return;
    setLoadingLeave(id);
    const { error } = await supabase
      .from('students')
      .update({ status: 'inactive' })
      .eq('studentid', id);
    if (error) {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    } else {
      setAllStudents(prev =>
        prev.map(s => (s.studentid === id ? { ...s, status: 'inactive' } : s))
      );
      toast({ title: 'Student marked as inactive 👋' });
    }
    setLoadingLeave(null);
  };

  const handleReactivate = async id => {
    setLoadingLeave(id);
    const { error } = await supabase
      .from('students')
      .update({ status: 'active' })
      .eq('studentid', id);
    if (error) {
      toast({ title: 'Failed to reactivate', variant: 'destructive' });
    } else {
      setAllStudents(prev => prev.map(s => (s.studentid === id ? { ...s, status: 'active' } : s)));
      toast({ title: 'Student reactivated ✅' });
    }
    setLoadingLeave(null);
  };

  const handleLeavingCertificate = async student => {
    if (!(await printSchoolLeavingCertificate(student))) {
      toast({ title: 'Please allow pop-ups to print the certificate.', variant: 'destructive' });
    }
  };

  const handleBonafideCertificate = async student => {
    if (!(await printBonafideCertificate(student))) {
      toast({ title: 'Please allow pop-ups to print the certificate.', variant: 'destructive' });
    }
  };

  const openMigrationCertificate = student => {
    setMigrationStudent(student);
    setMigrationBranch('');
    setFeePaidTill('');
  };

  const handleMigrationCertificate = async () => {
    if (!migrationBranch.trim() || !feePaidTill) {
      toast({
        title: 'Enter the destination branch and fee-clearance date.',
        variant: 'destructive',
      });
      return;
    }
    if (
      await printMigrationCertificate({
        student: migrationStudent,
        branch: migrationBranch.trim(),
        paidTill: feePaidTill,
      })
    ) {
      setMigrationStudent(null);
    } else {
      toast({ title: 'Please allow pop-ups to print the certificate.', variant: 'destructive' });
    }
  };

  const handleBulkStatus = async status => {
    if (selectedStudents.length === 0) return;
    setBulkLoading(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ Clear: status })
        .in('studentid', selectedStudents);
      if (error) throw error;
      setAllStudents(prev =>
        prev.map(s => (selectedStudents.includes(s.studentid) ? { ...s, Clear: status } : s))
      );
      toast({
        title: `Updated ${selectedStudents.length} students to ${status ? 'Cleared' : 'Pending'} ✅`,
      });
      setSelectedStudents([]);
    } catch (error) {
      console.error(error);
      toast({ title: 'Bulk update failed', variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkLeave = async () => {
    if (selectedStudents.length === 0) return;
    if (!window.confirm(`Mark ${selectedStudents.length} student(s) as inactive?`)) return;
    setBulkLoading(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ status: 'inactive' })
        .in('studentid', selectedStudents);
      if (error) throw error;
      setAllStudents(prev =>
        prev.map(s => (selectedStudents.includes(s.studentid) ? { ...s, status: 'inactive' } : s))
      );
      toast({ title: `${selectedStudents.length} student(s) marked as inactive 👋` });
      setSelectedStudents([]);
    } catch (error) {
      console.error(error);
      toast({ title: 'Bulk leave failed', variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkReactivate = async () => {
    if (selectedStudents.length === 0) return;
    setBulkLoading(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ status: 'active' })
        .in('studentid', selectedStudents);
      if (error) throw error;
      setAllStudents(prev =>
        prev.map(s => (selectedStudents.includes(s.studentid) ? { ...s, status: 'active' } : s))
      );
      toast({ title: `${selectedStudents.length} student(s) reactivated ✅` });
      setSelectedStudents([]);
    } catch (error) {
      console.error(error);
      toast({ title: 'Reactivation failed', variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkClassUpdate = async () => {
    if (!targetClassId || selectedStudents.length === 0) return;
    setBulkClassLoading(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ class_id: targetClassId })
        .in('studentid', selectedStudents);
      if (error) throw error;
      const targetClassObject = classes.find(c => String(c.id) === String(targetClassId));
      setAllStudents(prev =>
        prev.map(s =>
          selectedStudents.includes(s.studentid)
            ? { ...s, class_id: targetClassId, classes: { name: targetClassObject?.name } }
            : s
        )
      );
      toast({
        title: `Moved ${selectedStudents.length} students to ${targetClassObject?.name} 🎓`,
      });
      setSelectedStudents([]);
      setTargetClassId('');
    } catch (error) {
      console.error(error);
      toast({ title: 'Class update failed', variant: 'destructive' });
    } finally {
      setBulkClassLoading(false);
    }
  };

  const handleBulkFeeAdjust = async direction => {
    const amount = parseFloat(feeAdjustAmount);
    if (!feeAdjustAmount || isNaN(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (selectedStudents.length === 0) return;
    setFeeAdjustLoading(true);

    try {
      const { data: currentStudents, error: fetchError } = await supabase
        .from('students')
        .select('studentid, monthly_fee')
        .in('studentid', selectedStudents);

      if (fetchError) throw fetchError;

      const updates = currentStudents.map(s => ({
        studentid: s.studentid,
        monthly_fee: Math.max(0, (s.monthly_fee || 0) + (direction === '+' ? amount : -amount)),
      }));

      const results = await Promise.all(
        updates.map(({ studentid, monthly_fee }) =>
          supabase.from('students').update({ monthly_fee }).eq('studentid', studentid)
        )
      );

      const failed = results.find(r => r.error);
      if (failed) throw failed.error;

      const feeMap = Object.fromEntries(updates.map(u => [u.studentid, u.monthly_fee]));
      setAllStudents(prev =>
        prev.map(s =>
          feeMap[s.studentid] !== undefined ? { ...s, monthly_fee: feeMap[s.studentid] } : s
        )
      );

      toast({
        title: `${direction === '+' ? 'Increased' : 'Decreased'} fee by Rs. ${amount} for ${selectedStudents.length} student(s) 💰`,
      });
      setFeeAdjustAmount('');
    } catch (error) {
      console.error(error);
      toast({ title: 'Fee update failed', variant: 'destructive' });
    } finally {
      setFeeAdjustLoading(false);
    }
  };

  const getPromotionStatus = () => {
    if (!targetClassId || selectedStudents.length === 0) return null;
    const targetIndex = classes.findIndex(c => String(c.id) === String(targetClassId));
    const firstSelectedStudent = students.find(s => s.studentid === selectedStudents[0]);
    if (!firstSelectedStudent) return null;
    const currentIndex = classes.findIndex(
      c => String(c.id) === String(firstSelectedStudent.class_id)
    );
    if (targetIndex > currentIndex)
      return {
        label: 'Promote',
        color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
        icon: <TrendingUp className="w-3 h-3 mr-1" />,
      };
    if (targetIndex < currentIndex)
      return {
        label: 'Demote',
        color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
        icon: <TrendingDown className="w-3 h-3 mr-1" />,
      };
    return {
      label: 'Transfer',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
      icon: <ArrowRight className="w-3 h-3 mr-1" />,
    };
  };

  const promotionAction = getPromotionStatus();

  const toggleClassFilter = id => {
    setFilterClasses(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const inactiveCount = allStudents.filter(s => s.status === 'inactive').length;

  return (
    <>
      <Navbar />

      <div
        className="min-h-screen transition-colors duration-300
        bg-gradient-to-b from-gray-50 to-gray-200
        dark:from-[#0b1220] dark:to-[#05070c]
        text-gray-900 dark:text-slate-100"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {/* --- HEADER ROW --- */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Students</h1>
              <p className="text-gray-500 dark:text-slate-400 mt-1">
                Manage enrollments and fee clearance.
                {showInactive && (
                  <span className="ml-2 text-orange-500 dark:text-orange-400 font-medium">
                    Viewing inactive students
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative flex-grow sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-slate-500" />
                <Input
                  placeholder="Search name or ID..."
                  className="pl-10 h-10 rounded-lg
                  bg-white border-gray-200 text-gray-900
                  dark:bg-white/10 dark:border-white/10 dark:text-slate-100 dark:placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Toggle inactive/active view */}
              <Button
                onClick={() => {
                  setShowInactive(prev => !prev);
                  setSelectedStudents([]);
                }}
                variant="outline"
                className={`h-10 px-4 rounded-lg border transition-all gap-2 ${
                  showInactive
                    ? 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/30'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
              >
                {showInactive ? (
                  <>
                    <Eye className="w-4 h-4" /> Active Students
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4" /> Inactive
                    {inactiveCount > 0 && (
                      <span className="ml-1 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {inactiveCount}
                      </span>
                    )}
                  </>
                )}
              </Button>

              {!showInactive && (
                <Button
                  onClick={() => handleManageRedirect()}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow hover:shadow-blue-500/20 rounded-full sm:rounded-lg h-10 px-6 transition-all"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Student
                </Button>
              )}
            </div>
          </div>

          {/* --- INACTIVE BANNER --- */}
          <AnimatePresence>
            {showInactive && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/50"
              >
                <UserX className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  Showing <strong>{students.length}</strong> inactive (left) student
                  {students.length !== 1 ? 's' : ''}. These students are hidden from the active
                  list.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* --- FILTERS --- */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 mr-2 shrink-0">
                <Filter className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Class</span>
              </div>

              <button
                onClick={() => setFilterClasses([])}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  filterClasses.length === 0
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:border-white/20'
                }`}
              >
                All
              </button>

              {classes.map(c => {
                const isActive = filterClasses.includes(String(c.id));
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleClassFilter(String(c.id))}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:border-white/20'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>

            {!showInactive && (
              <div className="flex items-center gap-6 ml-1">
                <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 mr-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Status</span>
                </div>

                <label className="flex items-center gap-2 cursor-pointer group select-none">
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      filterClear.includes('TRUE')
                        ? 'bg-green-600 border-green-600'
                        : 'bg-white border-gray-300 group-hover:border-green-500 dark:bg-white/5 dark:border-white/20 dark:group-hover:border-green-400'
                    }`}
                  >
                    {filterClear.includes('TRUE') && <ChevronDown className="w-3 h-3 text-white" />}
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={filterClear.includes('TRUE')}
                      onChange={e =>
                        setFilterClear(prev =>
                          e.target.checked ? [...prev, 'TRUE'] : prev.filter(x => x !== 'TRUE')
                        )
                      }
                    />
                  </div>
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    Cleared
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group select-none">
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      filterClear.includes('FALSE')
                        ? 'bg-red-500 border-red-500'
                        : 'bg-white border-gray-300 group-hover:border-red-400 dark:bg-white/5 dark:border-white/20 dark:group-hover:border-red-400'
                    }`}
                  >
                    {filterClear.includes('FALSE') && (
                      <ChevronDown className="w-3 h-3 text-white" />
                    )}
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={filterClear.includes('FALSE')}
                      onChange={e =>
                        setFilterClear(prev =>
                          e.target.checked ? [...prev, 'FALSE'] : prev.filter(x => x !== 'FALSE')
                        )
                      }
                    />
                  </div>
                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                    Pending
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* --- BULK ACTION BAR --- */}
          <AnimatePresence>
            {selectedStudents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="bg-blue-50/80 backdrop-blur-md border border-blue-200 dark:bg-blue-900/30 dark:border-blue-800/50 rounded-lg p-3 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-md">
                      {selectedStudents.length} Selected
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 w-full md:w-auto md:flex-1 md:justify-end">
                    {showInactive ? (
                      /* INACTIVE MODE: reactivate only */
                      <div className="flex items-center gap-2">
                        {bulkLoading ? (
                          <Loader small />
                        ) : (
                          <Button
                            size="sm"
                            onClick={handleBulkReactivate}
                            className="bg-green-600 hover:bg-green-700 text-white border-none h-8"
                          >
                            <UserCheck className="w-3 h-3 mr-1.5" /> Reactivate
                          </Button>
                        )}
                      </div>
                    ) : (
                      /* ACTIVE MODE: all bulk actions */
                      <>
                        <div className="flex items-center gap-2">
                          {bulkLoading ? (
                            <Loader small />
                          ) : (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleBulkStatus(true)}
                                className="bg-green-600 hover:bg-green-700 text-white border-none h-8"
                              >
                                <Check className="w-3 h-3 mr-1.5" /> Cleared
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleBulkStatus(false)}
                                className="bg-red-500 hover:bg-red-600 text-white border-none h-8"
                              >
                                <XCircle className="w-3 h-3 mr-1.5" /> Pending
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleBulkLeave}
                                className="bg-red-600 hover:bg-red-500 text-white border-none h-8"
                              >
                                <UserX className="w-3 h-3 mr-1.5" /> Mark Left
                              </Button>
                            </>
                          )}
                        </div>

                        {/* FEE ADJUSTMENT */}
                        <div className="flex items-center gap-2 md:pl-4 md:border-l md:border-blue-200 dark:md:border-blue-800/60">
                          <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          <input
                            type="number"
                            min="0"
                            placeholder="Amount..."
                            value={feeAdjustAmount}
                            onChange={e => setFeeAdjustAmount(e.target.value)}
                            className="h-8 w-24 text-sm rounded-md border border-gray-300 px-2 shadow-sm focus:border-blue-500 focus:ring-1 bg-white dark:bg-white/5 dark:text-white text-black focus:ring-blue-500 dark:border-white/20 dark:bg-[#0b1220] dark:text-white"
                          />
                          {feeAdjustLoading ? (
                            <Loader small />
                          ) : (
                            <>
                              <button
                                onClick={() => handleBulkFeeAdjust('+')}
                                title="Increase fee"
                                className="h-8 w-8 flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-black dark:text-white text-base font-bold transition-colors"
                              >
                                +
                              </button>
                              <button
                                onClick={() => handleBulkFeeAdjust('-')}
                                title="Decrease fee"
                                className="h-8 w-8 flex items-center justify-center rounded-md bg-orange-500 hover:bg-orange-600 text-black dark:text-white text-base font-bold transition-colors"
                              >
                                −
                              </button>
                            </>
                          )}
                        </div>

                        {/* CLASS MASS UPDATE */}
                        <div className="flex items-center gap-2 md:pl-4 md:border-l md:border-blue-200 dark:md:border-blue-800/60">
                          <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <select
                            value={targetClassId}
                            onChange={e => setTargetClassId(e.target.value)}
                            className="h-8 text-black bg-white text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-white/20 dark:bg-white/5 dark:text-blue-200"
                          >
                            <option value="">Move to class...</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>

                          {targetClassId && (
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-2"
                            >
                              {promotionAction && (
                                <span
                                  className={`flex items-center text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${promotionAction.color}`}
                                >
                                  {promotionAction.icon} {promotionAction.label}
                                </span>
                              )}
                              <Button
                                size="sm"
                                onClick={handleBulkClassUpdate}
                                disabled={bulkClassLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white h-8"
                              >
                                {bulkClassLoading ? <Loader small /> : 'Apply'}
                              </Button>
                            </motion.div>
                          )}
                        </div>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedStudents([]);
                        setTargetClassId('');
                        setFeeAdjustAmount('');
                      }}
                      className="text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 h-8 ml-auto md:ml-0"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TABLE CONTAINER */}
          <div
            className="rounded-xl overflow-hidden
            border border-gray-200 dark:border-white/10
            bg-white dark:bg-white/5
            backdrop-blur-xl shadow-sm dark:shadow-xl"
          >
            {loading ? (
              <div className="p-12 flex justify-center">
                <Loader />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[900px]">
                  <thead
                    className="text-xs uppercase font-semibold
                    bg-gray-50 text-gray-500 border-b border-gray-200
                    dark:bg-white/5 dark:text-slate-400 dark:border-white/10"
                  >
                    <tr>
                      <th className="py-4 pl-6 w-10">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-white/20 dark:bg-white/10 dark:checked:bg-blue-600"
                          onChange={e =>
                            setSelectedStudents(
                              e.target.checked ? students.map(s => s.studentid) : []
                            )
                          }
                          checked={
                            students.length > 0 && selectedStudents.length === students.length
                          }
                        />
                      </th>
                      <th className="py-4 px-3">ID</th>
                      <th className="py-4 px-3">Name</th>
                      <th className="py-4 px-3">Father Name</th>
                      <th className="py-4 px-3">Mobile</th>
                      <th className="py-4 px-3">DOB</th>
                      <th className="py-4 px-3">Class</th>
                      <th className="py-4 px-3">Monthly Fee</th>
                      {!showInactive && <th className="py-4 px-3">Status</th>}
                      <th className="py-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {students.length === 0 ? (
                      <tr>
                        <td
                          colSpan={showInactive ? 9 : 10}
                          className="py-12 text-center text-gray-500 dark:text-slate-500 italic"
                        >
                          {showInactive
                            ? 'No inactive students found.'
                            : 'No students match your filters.'}
                        </td>
                      </tr>
                    ) : (
                      students.map(s => (
                        <tr
                          key={s.studentid}
                          className={`group transition-colors
                          ${
                            selectedStudents.includes(s.studentid)
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : showInactive
                                ? 'bg-orange-50/30 hover:bg-orange-50/60 dark:bg-orange-900/5 dark:hover:bg-orange-900/10'
                                : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                          }`}
                        >
                          <td className="py-3 pl-6">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-white/20 dark:bg-white/10 dark:checked:bg-blue-600"
                              checked={selectedStudents.includes(s.studentid)}
                              onChange={e =>
                                setSelectedStudents(prev =>
                                  e.target.checked
                                    ? [...prev, s.studentid]
                                    : prev.filter(id => id !== s.studentid)
                                )
                              }
                            />
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-gray-500 dark:text-slate-500">
                            #{s.studentid}
                          </td>
                          <td className="py-3 px-3 font-semibold text-gray-900 dark:text-slate-200">
                            <span
                              className={
                                showInactive ? 'line-through text-gray-400 dark:text-slate-500' : ''
                              }
                            >
                              {s.name}
                            </span>
                            {showInactive && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-orange-500 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">
                                Left
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-slate-400">
                            {s.fathername}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-slate-400 font-mono text-xs">
                            {s.mobilenumber}
                          </td>

                          <td className="py-3 px-3 text-gray-600 dark:text-slate-400 font-mono text-xs">
                            {s.dob
                              ? new Date(s.dob).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '-'}
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                              bg-gray-100 text-gray-800 border border-gray-200
                              dark:bg-white/10 dark:text-slate-300 dark:border-white/10"
                            >
                              {s.classes?.name}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              Rs.{' '}
                              {s.monthly_fee != null ? Number(s.monthly_fee).toLocaleString() : '—'}
                            </span>
                          </td>

                          {!showInactive && (
                            <td className="py-3 px-3">
                              <div className="relative inline-block w-full max-w-[100px]">
                                {loadingClear === s.studentid ? (
                                  <Loader small />
                                ) : (
                                  <select
                                    value={s.Clear ? 'TRUE' : 'FALSE'}
                                    onChange={e =>
                                      handleClearChange(s.studentid, e.target.value === 'TRUE')
                                    }
                                    className={`w-full bg-transparent font-bold cursor-pointer outline-none focus:ring-0 border-none p-0 pr-2 text-xs ${
                                      s.Clear
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-500 dark:text-red-400'
                                    }`}
                                  >
                                    <option
                                      className="bg-white text-gray-900 dark:bg-white/5 dark:text-gray-100"
                                      value="TRUE"
                                    >
                                      Cleared
                                    </option>
                                    <option
                                      className="bg-white text-gray-900 dark:bg-white/5 dark:text-gray-100"
                                      value="FALSE"
                                    >
                                      Pending
                                    </option>
                                  </select>
                                )}
                              </div>
                            </td>
                          )}

                          <td className="py-3 pr-6 text-right">
                            <div className="flex justify-end gap-2">
                              {showInactive ? (
                                /* Inactive view: certificate tools and reactivation */
                                <>
                                  <button
                                    onClick={() => handleLeavingCertificate(s)}
                                    className="rounded-md px-2 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                                    title="Create school leaving certificate"
                                  >
                                    Leaving certificate
                                  </button>
                                  <button
                                    onClick={() => openMigrationCertificate(s)}
                                    className="rounded-md px-2 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-900/30"
                                    title="Create migration certificate"
                                  >
                                    Migration certificate
                                  </button>
                                  <button
                                    onClick={() => handleReactivate(s.studentid)}
                                    disabled={loadingLeave === s.studentid}
                                    className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors dark:text-slate-400 dark:hover:text-green-400 dark:hover:bg-green-900/30"
                                    title="Reactivate student"
                                  >
                                    {loadingLeave === s.studentid ? (
                                      <Loader small />
                                    ) : (
                                      <UserCheck className="w-4 h-4" />
                                    )}
                                  </button>
                                </>
                              ) : (
                                /* Active view: bonafide certificate, edit, leave, delete */
                                <>
                                  <button
                                    onClick={() => handleBonafideCertificate(s)}
                                    className="rounded-md px-2 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-900/30"
                                    title="Create bonafide certificate"
                                  >
                                    Bonafide certificate
                                  </button>
                                  <button
                                    onClick={() => handleManageRedirect(s.studentid)}
                                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"
                                    title="Edit"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleLeave(s.studentid)}
                                    disabled={loadingLeave === s.studentid}
                                    className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors dark:text-slate-400 dark:hover:text-orange-400 dark:hover:bg-orange-900/30"
                                    title="Mark as left (inactive)"
                                  >
                                    {loadingLeave === s.studentid ? (
                                      <Loader small />
                                    ) : (
                                      <UserX className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleDelete(s.studentid)}
                                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-900/30"
                                    title="Delete permanently"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {migrationStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            onMouseDown={() => setMigrationStudent(null)}
          >
            <motion.section
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              onMouseDown={event => event.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900"
            >
              <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600">
                Student migration
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                Migration certificate
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Create a branded certificate for <strong>{migrationStudent.name}</strong>. The
                monthly fee is read directly from the student record.
              </p>
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Destination branch
                  <Input
                    autoFocus
                    value={migrationBranch}
                    onChange={event => setMigrationBranch(event.target.value)}
                    placeholder="e.g. Dar-e-Arqam Schools, Johar Town Campus"
                    className="mt-1.5 bg-white text-slate-900 dark:bg-white dark:text-slate-900"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Fee paid / cleared till
                  <Input
                    type="date"
                    value={feePaidTill}
                    onChange={event => setFeePaidTill(event.target.value)}
                    className="mt-1.5 bg-white text-slate-900 dark:bg-white dark:text-slate-900"
                  />
                </label>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setMigrationStudent(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleMigrationCertificate}
                  className="bg-violet-600 text-white hover:bg-violet-700"
                >
                  Generate migration certificate
                </Button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
