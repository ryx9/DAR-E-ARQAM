
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '../utils/supabaseClient'
import { useRouter } from 'next/router'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import Navbar from '../components/Navbar'
import Loader from '../components/Loader'
import { Plus, Edit, Trash2, Users, Calendar, ArrowRight, Layers, BarChart2, ArrowUpRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog"
import { useToast } from "../hooks/use-toast"
import { motion, AnimatePresence } from 'framer-motion'
import Breadcrumbs from '../components/Breadcrumbs'

// --- HELPER: Handle Supabase 1000 Row Limit ---
const fetchWithPagination = async (query: any) => {
  let allData: any[] = [];
  let from = 0;
  let limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(from, from + limit - 1);
    if (error) throw error;

    if (data) {
      allData = [...allData, ...data];
      if (data.length < limit) hasMore = false;
      else from += limit;
    } else {
      hasMore = false;
    }
  }
  return allData;
};

interface Class {
  id: string
  name: string
  description: string
  studentCount: number
  totalClassDays: number
  attendanceMarkedToday: boolean
}

export default function Dashboard() {
  const [classes, setClasses] = useState<Class[]>([])

  // Form States
  const [newClassName, setNewClassName] = useState('')
  const [newClassDescription, setNewClassDescription] = useState('')
  const [editingClass, setEditingClass] = useState<Class | null>(null)

  // UI States
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteClassId, setDeleteClassId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ADDED: State to hold the user's role
  const [userRole, setUserRole] = useState<string | null>(null)

  const router = useRouter()
  const { toast } = useToast()

  // ADDED: Check local storage for user role on mount
  useEffect(() => {
    fetchClasses();
    const storedRole = localStorage.getItem('UserRole');
    setUserRole(storedRole);
  }, [])

  // ADDED: Helper boolean to check permissions
  const canEditOrDelete = userRole === 'admin' || userRole === 'superadmin';

  const fetchClasses = async () => {
    setIsLoading(true)
    const today = new Date().toISOString().split('T')[0]

    try {
      // 1. Fetch Classes - SORTED BY ID ASCENDING
      const classesQuery = supabase
        .from('classes')
        .select('*')
        .order('id', { ascending: true });

      const classesData = await fetchWithPagination(classesQuery);

      // 2. Fetch Today's Attendance
      const todaysAttendance = await fetchWithPagination(
        supabase.from('attendance').select('class_id, date').eq('date', today)
      );
      const todaysMap = new Set((todaysAttendance || []).map((a: any) => a.class_id))

      // 3. Process Details
      const classesWithDetails = await Promise.all(
        classesData.map(async (cls: any) => {
          // Count Students (Exact)
          const { count: studentCount } = await supabase
            .from('active_students')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', cls.id)

          // Count Days
          const attendanceData = await fetchWithPagination(
            supabase.from('attendance').select('date').eq('class_id', cls.id)
          );
          const uniqueDates = new Set((attendanceData || []).map((r: any) => r.date))

          return {
            ...cls,
            studentCount: studentCount || 0,
            totalClassDays: uniqueDates.size,
            attendanceMarkedToday: todaysMap.has(cls.id)
          }
        })
      )

      setClasses(classesWithDetails)
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Failed to load classes." })
    } finally {
      setIsLoading(false)
    }
  }

  // --- ACTIONS (Create, Update, Delete) ---
  const createClass = async () => {
    // ADDED: Optional role check for creation too, if you want only admins to create
    if (!canEditOrDelete) return toast({ variant: "destructive", title: "Unauthorized", description: "Only admins can create classes." });

    if (!newClassName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return toast({ variant: "destructive", title: "Login required" })

    const { data, error } = await supabase
      .from('classes')
      .insert([{ name: newClassName, description: newClassDescription }])
      .select()

    if (error) return toast({ variant: "destructive", title: "Error", description: error.message })

    setClasses(prev => [...prev, { ...data![0], studentCount: 0, totalClassDays: 0, attendanceMarkedToday: false }])
    setNewClassName(''); setNewClassDescription(''); setIsCreateDialogOpen(false)
    toast({ title: "Class created" })
  }

  const updateClass = async () => {
    // ADDED: Guard clause to prevent unauthorized execution
    if (!canEditOrDelete) return toast({ variant: "destructive", title: "Unauthorized" });

    if (!editingClass) return
    const { error } = await supabase.from('classes').update({ name: newClassName, description: newClassDescription }).eq('id', editingClass.id)
    if (error) return toast({ variant: "destructive", title: "Error", description: "Update failed" })

    setClasses(classes.map(c => c.id === editingClass.id ? { ...c, name: newClassName, description: newClassDescription } : c))
    setEditingClass(null); setNewClassName(''); setNewClassDescription(''); setIsEditDialogOpen(false)
    toast({ title: "Class updated" })
  }

  const deleteClass = async () => {
    // ADDED: Guard clause to prevent unauthorized execution
    if (!canEditOrDelete) return toast({ variant: "destructive", title: "Unauthorized" });

    if (!deleteClassId) return
    const { error } = await supabase.from('classes').delete().eq('id', deleteClassId)
    if (error) toast({ variant: "destructive", title: "Error", description: "Deletion failed" })
    else {
      setClasses(classes.filter(c => c.id !== deleteClassId))
      toast({ title: "Class deleted" })
    }
    setDeleteClassId(null); setIsDeleteDialogOpen(false)
  }

  if (isLoading) return <Loader />

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-slate-900 dark:via-[#0a0f1d] dark:to-black text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-500/30 transition-colors duration-300">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }]} />

        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 pb-4 border-b border-slate-200 dark:border-white/5">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <Layers className="w-8 h-8 text-blue-600 dark:text-blue-400" /> Classes
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Overview of academic sessions.</p>
          </div>

          {/* ADDED: Conditionally hide the Create button if they aren't admin/superadmin */}
          {canEditOrDelete && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full px-6 bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 dark:shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition-all hover:scale-105 font-bold">
                  <Plus className="w-5 h-5 mr-2" /> New Class
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-white dark:bg-slate-900/95 backdrop-blur-2xl border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-[2rem] shadow-2xl">
                <DialogHeader><DialogTitle className="text-2xl font-bold">New Class</DialogTitle></DialogHeader>
                <div className="space-y-5 py-6">
                  <Input placeholder="Class Name (e.g., Grade 10A)" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} className="bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl h-14 px-5 text-lg font-medium focus:ring-blue-500/50" />
                  <Input placeholder="Brief Description" value={newClassDescription} onChange={(e) => setNewClassDescription(e.target.value)} className="bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl h-14 px-5 text-lg font-medium focus:ring-blue-500/50" />
                  <Button className="w-full rounded-2xl h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white" onClick={createClass}>Create Class</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* ACADEMIC REPORTS */}
        <div className="grid grid-cols-1 gap-4">
          <Link
            href="/reports"
            className="group relative flex flex-col justify-between p-5 rounded-3xl border border-indigo-200/80 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/80 via-white to-white dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 shadow-md hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                  Analytics Hub
                </span>
              </div>
              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                Academic Reports
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                Analytics, grade sheets, class comparisons, student report cards, and WhatsApp in one place.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <span>Open Reports</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </Link>

        </div>

        {/* PREMIUM CARD GRID */}
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode='popLayout'>
            {classes.map((cls, index) => (
              <motion.div
                key={cls.id}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, type: "spring", bounce: 0.3, delay: index * 0.05 }}
              >
                <div
                  onClick={() => router.push(`/class/${cls.id}`)}
                  className="group relative h-full flex flex-col justify-between p-5 cursor-pointer
                    rounded-[2rem] 
                    border border-slate-200 dark:border-white/10
                    bg-white dark:bg-transparent dark:bg-gradient-to-br dark:from-white/[0.08] dark:to-transparent backdrop-blur-2xl
                    shadow-xl shadow-slate-200/60 dark:shadow-black/50
                    hover:scale-[1.02] hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/10 dark:hover:from-white/[0.12]
                    transition-all duration-300 ease-out overflow-hidden"
                >

                  {/* Top Section: Identity & Status */}
                  <div className="space-y-3 z-10">
                    <div className="flex justify-between items-start">
                      {/* ID Badge */}
                      <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-black/40 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10">
                        #{cls.id}
                      </span>

                      {/* Status Dot */}
                      <div className={`relative flex items-center justify-center w-3 h-3 rounded-full ${cls.attendanceMarkedToday ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500'
                        }`}>
                        <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${cls.attendanceMarkedToday ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500'
                          }`}></span>
                      </div>
                    </div>

                    <div>
                      {/* Title & Desc */}
                      <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                        {cls.name}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium line-clamp-1 mt-0.5">
                        {cls.description || "No description provided."}
                      </p>
                    </div>
                  </div>

                  {/* Middle Section: Stats Boxes */}
                  <div className="grid grid-cols-2 gap-3 my-4 z-10">

                    {/* Student Count Box */}
                    <div className="flex flex-col items-start justify-center p-3 rounded-3xl bg-slate-50 dark:bg-black/30 border border-slate-100 dark:border-white/5 relative overflow-hidden group/stat">
                      <div className="absolute inset-0 bg-blue-500/10 dark:bg-blue-500/20 opacity-0 group-hover/stat:opacity-100 transition-opacity blurred-xl"></div>
                      <Users className="w-4 h-4 text-blue-500 dark:text-blue-400 mb-2 relative z-10" />
                      <span className="text-3xl font-black text-slate-900 dark:text-white relative z-10 leading-none">
                        {cls.studentCount}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500 relative z-10 mt-1">
                        Students
                      </span>
                    </div>

                    {/* Days Count Box */}
                    <div className="flex flex-col items-start justify-center p-3 rounded-3xl bg-slate-50 dark:bg-black/30 border border-slate-100 dark:border-white/5 relative overflow-hidden group/stat">
                      <div className="absolute inset-0 bg-purple-500/10 dark:bg-purple-500/20 opacity-0 group-hover/stat:opacity-100 transition-opacity blurred-xl"></div>
                      <Calendar className="w-4 h-4 text-purple-500 dark:text-purple-400 mb-2 relative z-10" />
                      <span className="text-3xl font-black text-slate-900 dark:text-white relative z-10 leading-none">
                        {cls.totalClassDays}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500 relative z-10 mt-1">
                        Days
                      </span>
                    </div>
                  </div>

                  {/* Bottom Section: Actions */}
                  <div className="flex items-center justify-between z-10">
                    {/* ADDED: Conditionally render the Edit/Delete button group */}
                    <div className="flex gap-2 min-w-[80px]" onClick={(e) => e.stopPropagation()}>
                      {canEditOrDelete && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full bg-slate-100 dark:bg-black/40 hover:bg-blue-600 dark:hover:bg-blue-600/80 text-slate-600 dark:text-slate-300 hover:text-white border border-slate-200 dark:border-white/10 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingClass(cls); setNewClassName(cls.name); setNewClassDescription(cls.description);
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full bg-slate-100 dark:bg-black/40 hover:bg-rose-600 dark:hover:bg-rose-600/80 text-slate-600 dark:text-slate-300 hover:text-white border border-slate-200 dark:border-white/10 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteClassId(cls.id); setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Enter Button */}
                    <div className="h-9 px-4 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2 group-hover:bg-blue-600 group-hover:border-blue-500 text-slate-700 dark:text-slate-300 group-hover:text-white transition-all duration-300">
                      <span className="text-xs font-bold uppercase tracking-wider">Enter</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Glossy overlay effect */}
                  <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-t from-transparent via-transparent to-white/40 dark:to-white/5 pointer-events-none z-0"></div>

                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </main>

      {/* EDIT MODAL */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900/95 backdrop-blur-2xl border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-[2rem] shadow-2xl">
          <DialogHeader><DialogTitle className="text-2xl font-bold">Edit Class</DialogTitle></DialogHeader>
          <div className="space-y-5 py-6">
            <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} className="bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl h-14 px-5 text-lg font-medium focus:ring-blue-500/50" />
            <Input value={newClassDescription} onChange={(e) => setNewClassDescription(e.target.value)} className="bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl h-14 px-5 text-lg font-medium focus:ring-blue-500/50" />
            <Button className="w-full rounded-2xl h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white" onClick={updateClass}>Update Class</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE MODAL */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900/95 backdrop-blur-2xl border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-[2rem] shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-bold">Delete Class</DialogTitle></DialogHeader>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Are you sure? This action is permanent and cannot be undone.</p>
          <DialogFooter className="mt-6 gap-2">
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl h-12 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 font-bold">Cancel</Button>
            <Button variant="destructive" onClick={deleteClass} className="rounded-xl h-12 bg-rose-600 hover:bg-rose-700 font-bold text-white shadow-lg shadow-rose-900/20">Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
