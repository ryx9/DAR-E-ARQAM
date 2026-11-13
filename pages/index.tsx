
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from '../utils/supabaseClient';
import {
  motion,
  AnimatePresence
} from 'framer-motion';

// UI Components
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "../components/ui/dialog";
import { useToast } from "../hooks/use-toast";

// Icons
import {
  Moon, Sun, LayoutGrid, ScrollText, FileSpreadsheet,
  BookOpenCheck, NotebookPen, Sparkles, UserCheck, BellRing,
  Wallet, ShieldAlert, LogOut, User, ChevronRight, GraduationCap,
  Plus, Edit, Trash2, ArrowRight, Layers, Users, Calendar, Bot, Wand2
} from "lucide-react";

// ----- Types & Hooks -----
type Theme = "light" | "dark";

const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem("theme") as Theme) || "light";
    setThemeState(stored);
    document.documentElement.classList.toggle("dark", stored === "dark");
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  };

  return { theme, setTheme, mounted };
};

// ----- Config: All Links Restored -----
const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20", border: "group-hover:border-blue-200 dark:group-hover:border-blue-800" },
  { href: "/marks", label: "Tests", icon: ScrollText, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "group-hover:border-emerald-200 dark:group-hover:border-emerald-800" },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/20", border: "group-hover:border-cyan-200 dark:group-hover:border-cyan-800" },
  { href: "/syllabus", label: "Syllabus", icon: BookOpenCheck, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/20", border: "group-hover:border-violet-200 dark:group-hover:border-violet-800" },
  { href: "/diary", label: "Diary", icon: NotebookPen, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-900/20", border: "group-hover:border-pink-200 dark:group-hover:border-pink-800" },
  { href: "/activities", label: "Activities", icon: Sparkles, color: "text-fuchsia-600 dark:text-fuchsia-400", bg: "bg-fuchsia-50 dark:bg-fuchsia-900/20", border: "group-hover:border-fuchsia-200 dark:group-hover:border-fuchsia-800" },
  { href: "/attendance-record/report", label: "Attendance", icon: UserCheck, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/20", border: "group-hover:border-teal-200 dark:group-hover:border-teal-800" },
  { href: "/advance", label: "Advance", icon: Wallet, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20", border: "group-hover:border-green-200 dark:group-hover:border-green-800" },
  { href: "/mycomplaint", label: "Complaints", icon: ShieldAlert, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/20", border: "group-hover:border-rose-200 dark:group-hover:border-rose-800" },
];

// ----- Helper: Pagination -----
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

// ----- Main Component -----
const DashboardHome = () => {
  // Page A State
  const { theme, setTheme, mounted } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRole, setUserRole] = useState<string | null>(null); // NEW: Track UserRole
  const router = useRouter();

  // Page B State (Class Logic)
  const [classes, setClasses] = useState<Class[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteClassId, setDeleteClassId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { toast } = useToast();

  // ----- Effects -----
  useEffect(() => {
    // NEW: Fetch UserRole from localStorage safely on mount
    if (typeof window !== "undefined") {
      setUserRole(localStorage.getItem("UserRole"));
    }
    checkSession();
    fetchClasses();
  }, []);

  const checkSession = async () => {
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      setIsLoggedIn(true);
      setUserEmail(data.user.email || "");
    } else {
      setIsLoggedIn(false);
      setUserEmail("");
    }
  };

  const fetchClasses = async () => {
    setIsLoading(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      // 1. Fetch Classes
      const classesQuery = supabase.from('classes').select('*').order('id', { ascending: true });
      const classesData = await fetchWithPagination(classesQuery);

      // 2. Fetch Today's Attendance
      const todaysAttendance = await fetchWithPagination(
        supabase.from('attendance').select('class_id, date').eq('date', today)
      );
      const todaysMap = new Set((todaysAttendance || []).map((a: any) => a.class_id));

      // 3. Process Details
      const classesWithDetails = await Promise.all(
        classesData.map(async (cls: any) => {
          const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('class_id', cls.id);
          const attendanceData = await fetchWithPagination(supabase.from('attendance').select('date').eq('class_id', cls.id));
          const uniqueDates = new Set((attendanceData || []).map((r: any) => r.date));

          return {
            ...cls,
            studentCount: studentCount || 0,
            totalClassDays: uniqueDates.size,
            attendanceMarkedToday: todaysMap.has(cls.id)
          };
        })
      );
      setClasses(classesWithDetails);
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoggedIn(false);
    setUserEmail("");
    setUserRole(null);

    if (typeof window !== "undefined") {
      localStorage.removeItem("sb-tjdepqtouvbwqrakarkh-auth-token");
      localStorage.removeItem("sb-access-token");
      localStorage.removeItem("sb-refresh-token");
      localStorage.removeItem("UserRole"); // Optional: clear role on logout
    }

    await supabase.auth.signOut();
    router.push("/login");
  };

  // ----- CRUD Actions -----
  const createClass = async () => {
    if (!newClassName.trim()) return;
    const { data, error } = await supabase.from('classes').insert([{ name: newClassName, description: newClassDescription }]).select();
    if (error) return toast({ variant: "destructive", title: "Error", description: error.message });

    setClasses(prev => [...prev, { ...data![0], studentCount: 0, totalClassDays: 0, attendanceMarkedToday: false }]);
    setNewClassName(''); setNewClassDescription(''); setIsCreateDialogOpen(false);
    toast({ title: "Class created" });
  };

  const updateClass = async () => {
    if (!editingClass) return;
    const { error } = await supabase.from('classes').update({ name: newClassName, description: newClassDescription }).eq('id', editingClass.id);
    if (error) return toast({ variant: "destructive", title: "Error", description: "Update failed" });

    setClasses(classes.map(c => c.id === editingClass.id ? { ...c, name: newClassName, description: newClassDescription } : c));
    setEditingClass(null); setNewClassName(''); setNewClassDescription(''); setIsEditDialogOpen(false);
    toast({ title: "Class updated" });
  };

  const deleteClass = async () => {
    if (!deleteClassId) return;
    const { error } = await supabase.from('classes').delete().eq('id', deleteClassId);
    if (error) toast({ variant: "destructive", title: "Error", description: "Deletion failed" });
    else {
      setClasses(classes.filter(c => c.id !== deleteClassId));
      toast({ title: "Class deleted" });
    }
    setDeleteClassId(null); setIsDeleteDialogOpen(false);
  };

  // NEW: Helper boolean for permissions
  const canEditOrDelete = userRole === "admin" || userRole === "superadmin";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500 font-sans">

      {/* --- TOP NAVIGATION BAR --- */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-slate-950/70 border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="container mx-auto px-4 h-16 flex justify-between items-center">

          <Link href="/" className="flex items-center gap-3 group relative select-none">
            <div className="relative bg-gradient-to-br from-indigo-600 to-violet-600 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30 transform group-hover:scale-105 transition-transform duration-300">
              <span className="font-black text-lg">D</span>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">
                DAR-E-ARQAM
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-500 dark:text-indigo-400">
                School System
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-all hover:rotate-12"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}

            {isLoggedIn ? (
              <button
                onClick={handleSignOut}
                className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-500 hover:text-white dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-900/30 transition-all text-xs font-bold uppercase tracking-wide"
              >
                <span>Logout</span>
                <LogOut size={14} />
              </button>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="px-5 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="container mx-auto px-4 py-6 md:py-10 space-y-8 md:space-y-10">

        {/* 1. Hero / Welcome Section */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-gradient-to-tr from-white to-gray-100 dark:from-slate-800 dark:to-slate-900 p-1 shadow-2xl shadow-indigo-500/20 border border-gray-200 dark:border-slate-700">
              <div className="w-full h-full rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                {isLoggedIn ? (
                  <User size={32} className="text-indigo-500/50 md:w-10 md:h-10" />
                ) : (
                  <GraduationCap size={32} className="text-gray-400 md:w-10 md:h-10" />
                )}
              </div>
              {isLoggedIn && (
                <div className="absolute bottom-2 right-2 w-3 h-3 md:w-4 md:h-4 bg-emerald-500 border-2 border-white dark:border-slate-950 rounded-full animate-pulse"></div>
              )}
            </div>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
            {isLoggedIn ? (
              <div className="flex flex-col gap-1">
                <span>Welcome Back</span>
                {userEmail && (
                  <span className="text-sm md:text-lg text-indigo-500 font-medium">
                    {userEmail}
                  </span>
                )}
              </div>
            ) : (
              "Welcome to Portal"
            )}
          </h1>
        </div>

        {/* 2. AI NOTICE BAR */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xl shadow-indigo-500/20 p-1">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Bot size={120} />
          </div>
          <div className="relative z-10 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <Wand2 className="w-5 h-5 text-yellow-300 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-sm md:text-base flex items-center gap-2">
                  AI Smart Notices
                  <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] bg-white/20 rounded-full">New</span>
                </h3>
                <p className="text-[10px] md:text-xs text-indigo-100 max-w-[250px] md:max-w-none leading-tight">
                  Teachers now craft perfect updates using AI assistance. Check your inbox!
                </p>
              </div>
            </div>
            <Link href="/notice">
              <Button size="sm" className="h-8 bg-white text-indigo-700 hover:bg-indigo-50 border-0 font-bold text-xs rounded-full shadow-lg">
                View
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* 3. Portal Apps Grid */}
        <div>
          <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-800 pb-3">
            <h2 className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-indigo-500" />
              Portal Apps
            </h2>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 md:gap-4">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                      group relative flex flex-col p-2.5 md:p-4 rounded-xl md:rounded-2xl
                      bg-white dark:bg-slate-900/50
                      border border-gray-100 dark:border-gray-800
                      ${link.border}
                      hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/40
                      transition-all duration-300 ease-out hover:-translate-y-1
                    `}
                >
                  <div className="flex items-start justify-between mb-2 md:mb-3">
                    <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl flex items-center justify-center ${link.bg} ${link.color}`}>
                      <Icon size={16} className="md:w-[18px] md:h-[18px]" />
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hidden md:block">
                      <ChevronRight size={14} />
                    </div>
                  </div>
                  <h3 className="text-xs md:text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                    {link.label}
                  </h3>
                </Link>
              );
            })}
          </div>
        </div>

        {/* 4. Academic Classes */}
        <div>
          {/* Section Header */}
          <div className="flex flex-col md:flex-row justify-between items-end gap-4 md:gap-6 mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
            <div className="space-y-1">
              <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-500" />
                Academic Classes
              </h2>
            </div>

            {/* Optional: You can also wrap the Create Dialog around {canEditOrDelete && (...)} if you want to block creation entirely */}
            {canEditOrDelete && (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-full px-4 h-8 md:px-5 md:h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-105 font-bold text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Class
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-[2rem]">
                  <DialogHeader><DialogTitle>New Class</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <Input placeholder="Class Name (e.g., Grade 10A)" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} className="rounded-xl h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800" />
                    <Input placeholder="Description" value={newClassDescription} onChange={(e) => setNewClassDescription(e.target.value)} className="rounded-xl h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800" />
                    <Button className="w-full rounded-xl h-12 bg-blue-600 hover:bg-blue-700 text-white" onClick={createClass}>Create Class</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <motion.div layout className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
            <AnimatePresence mode='popLayout'>
              {classes.map((cls, index) => (
                <motion.div
                  key={cls.id}
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <div
                    onClick={() => router.push(`/class/${cls.id}`)}
                    className="group relative flex flex-col justify-between p-4 md:p-6 rounded-2xl md:rounded-[2rem] h-full cursor-pointer
                        bg-white dark:bg-transparent dark:bg-gradient-to-br dark:from-white/[0.08] dark:to-transparent backdrop-blur-2xl
                        border border-slate-100 dark:border-white/10
                        shadow-md shadow-slate-200/40 dark:shadow-black/50
                        hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10
                        transition-all duration-300 ease-out overflow-hidden min-h-[140px]"
                  >

                    {/* Card Content */}
                    <div className="z-10 relative flex flex-col h-full">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-sm md:text-xl font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                          {cls.name}
                        </h3>
                        <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full mt-1.5 md:mt-2 shrink-0 ${cls.attendanceMarkedToday ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}`} />
                      </div>

                      <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 font-medium mb-4 line-clamp-2 md:line-clamp-2">
                        {cls.description || "No description."}
                      </p>

                      <div className="mt-auto">
                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 md:mb-6">
                          <span className="flex items-center gap-1"><Users size={12} className="text-blue-500" /> {cls.studentCount} <span className="hidden md:inline">Students</span></span>
                          <span className="flex items-center gap-1"><Calendar size={12} className="text-purple-500" /> {cls.totalClassDays} <span className="hidden md:inline">Days</span></span>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/10 pt-3 md:pt-4">
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {/* NEW: Hide Edit and Delete buttons if not an admin */}
                            {canEditOrDelete && (
                              <>
                                <Button variant="ghost" size="icon" className="h-6 w-6 md:h-8 md:w-8 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                                  onClick={() => { setEditingClass(cls); setNewClassName(cls.name); setNewClassDescription(cls.description); setIsEditDialogOpen(true); }}>
                                  <Edit size={12} className="md:w-[14px] md:h-[14px]" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 md:h-8 md:w-8 rounded-full hover:bg-rose-100 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                                  onClick={() => { setDeleteClassId(cls.id); setIsDeleteDialogOpen(true); }}>
                                  <Trash2 size={12} className="md:w-[14px] md:h-[14px]" />
                                </Button>
                              </>
                            )}
                          </div>
                          <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <ArrowRight size={12} className="md:w-[14px] md:h-[14px]" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Glossy Overlay */}
                    <div className="absolute inset-0 rounded-2xl md:rounded-[2rem] bg-gradient-to-t from-transparent via-transparent to-white/40 dark:to-white/5 pointer-events-none z-0"></div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Footer */}
        <footer className="mt-10 md:mt-20 text-center text-gray-400 dark:text-gray-600 text-[10px] md:text-xs py-6 border-t border-gray-200 dark:border-gray-800/50">
          <p>&copy; {new Date().getFullYear()} Dar-e-Arqam School System. All rights reserved.</p>
        </footer>

      </main>

      {/* --- MODALS --- */}

      {/* Edit Modal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-[2rem]">
          <DialogHeader><DialogTitle>Edit Class</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} className="rounded-xl h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800" />
            <Input value={newClassDescription} onChange={(e) => setNewClassDescription(e.target.value)} className="rounded-xl h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800" />
            <Button className="w-full rounded-xl h-12 bg-blue-600 hover:bg-blue-700 text-white" onClick={updateClass}>Update Class</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-[2rem]">
          <DialogHeader><DialogTitle>Delete Class</DialogTitle></DialogHeader>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Are you sure? This action is permanent.</p>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl">Cancel</Button>
            <Button variant="destructive" onClick={deleteClass} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default DashboardHome;
