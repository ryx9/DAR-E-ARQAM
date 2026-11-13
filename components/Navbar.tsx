
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Moon,
  Sun,
  LayoutGrid,
  ScrollText,
  FileText,
  Users,
  BookOpenCheck,
  NotebookPen,
  Sparkles,
  UserCheck,
  Wallet,
  ShieldAlert,
  User,
  X,
  Menu,
  ChevronRight,
  Power,
  Zap,
  BarChart2
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

// ----- Types & Hooks -----
type Theme = 'light' | 'dark';

const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem('theme') as Theme) || 'light';
    setThemeState(stored);
    document.documentElement.classList.toggle('dark', stored === 'dark');
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem('theme', t);
    setThemeState(t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  };

  return { theme, setTheme, mounted };
};

const useRouter = () => {
  return { push: (p: string) => (window.location.href = p) };
};

// ----- Config -----
const NAV_LINKS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutGrid,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'group-hover:border-blue-200 dark:group-hover:border-blue-800',
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: BarChart2,
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'group-hover:border-indigo-200 dark:group-hover:border-indigo-800',
  },
  {
    href: '/marks',
    label: 'Tests & Marks',
    icon: ScrollText,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'group-hover:border-emerald-200 dark:group-hover:border-emerald-800',
  },
  {
    href: '/attendance-record/report',
    label: 'Attendance',
    icon: UserCheck,
    color: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    border: 'group-hover:border-teal-200 dark:group-hover:border-teal-800',
  },
  {
    href: '/syllabus',
    label: 'Syllabus',
    icon: BookOpenCheck,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    border: 'group-hover:border-violet-200 dark:group-hover:border-violet-800',
  },
  {
    href: '/diary',
    label: 'Diary',
    icon: NotebookPen,
    color: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    border: 'group-hover:border-pink-200 dark:group-hover:border-pink-800',
  },
  {
    href: '/activities',
    label: 'Activities',
    icon: Sparkles,
    color: 'text-fuchsia-600 dark:text-fuchsia-400',
    bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20',
    border: 'group-hover:border-fuchsia-200 dark:group-hover:border-fuchsia-800',
  },
  {
    href: '/advance',
    label: 'Advance',
    icon: Wallet,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'group-hover:border-green-200 dark:group-hover:border-green-800',
  },
  {
    href: '/mycomplaint',
    label: 'Complaints',
    icon: ShieldAlert,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    border: 'group-hover:border-rose-200 dark:group-hover:border-rose-800',
  },
];

const ADMIN_LINKS = [
  { href: '/admin', label: 'Admin Overview', icon: LayoutGrid, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'group-hover:border-blue-200 dark:group-hover:border-blue-800' },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'group-hover:border-teal-200 dark:group-hover:border-teal-800' },
  { href: '/admin/crud', label: 'Manage Students', icon: Users, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'group-hover:border-indigo-200 dark:group-hover:border-indigo-800' },
];

const SUPERADMIN_LINKS = [
  { href: '/admin/report', label: 'Fee Reports', icon: BarChart2, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'group-hover:border-cyan-200 dark:group-hover:border-cyan-800' },
  { href: '/admin/profiles', label: 'Manage Teachers', icon: UserCheck, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'group-hover:border-violet-200 dark:group-hover:border-violet-800' },
];

const DESKTOP_LINKS = [
  { href: '/admin/invoices', label: 'Invoices', roles: ['admin', 'superadmin'] },
  { href: '/admin/crud', label: 'Manage Students', roles: ['admin', 'superadmin'] },
  { href: '/reports', label: 'Reports', roles: ['admin', 'superadmin', 'teacher', 'user'] },
  { href: '/marks', label: 'Tests', roles: ['admin', 'superadmin', 'teacher', 'user'] },
  { href: '/dashboard', label: 'Classes', roles: ['admin', 'superadmin', 'teacher', 'user'] },
  { href: '/admin/report', label: 'Fee Reports', roles: ['superadmin'] },
  { href: '/admin/profiles', label: 'Manage Teachers', roles: ['superadmin'] },
];

// ----- Component -----

const Navbar = () => {
  const { theme, setTheme, mounted } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      setIsLoggedIn(!!user);
      if (!user) {
        setUserRole(null);
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (active) setUserRole(profile?.role?.toLowerCase() || null);
    };
    void loadProfile();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void loadProfile(); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const visibleLinks = [
    ...NAV_LINKS,
    ...(isAdmin ? ADMIN_LINKS : []),
    ...(userRole === 'superadmin' ? SUPERADMIN_LINKS : []),
  ];

  const handleSignOut = async () => {
    setIsOpen(false);
    setIsLoggedIn(false);
    setUserRole(null);
    localStorage.removeItem('UserRole');
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Signout error:', error);
    }
    router.push('/login');
  };

  return (
    <>
      {/* FIXED HEADER */}
      <nav
        className="fixed top-0 left-0 right-0 z-[100] h-20 transition-all
        bg-white/80 dark:bg-gray-950/80 
        backdrop-blur-2xl backdrop-saturate-200 
        border-b border-gray-200/50 dark:border-white/10 shadow-sm"
      >
        <div className="container mx-auto px-4 h-full flex justify-between items-center">
          {/* Logo Area */}
          <Link href="/" className="flex items-center gap-3 group relative select-none">
            {/* Logo Icon */}
            <div className="relative bg-gradient-to-br from-indigo-600 to-violet-700 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
              <span className="font-black text-xl">D</span>
            </div>

            <div className="flex flex-col relative">
              <span className="font-extrabold text-lg leading-none tracking-tight text-gray-900 dark:text-white">
                DAR-E-ARQAM
              </span>

              {/* BRANDING: VISIBLE AI LABEL */}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                  School System
                </span>
                {/* Prominent Badge */}
                <div className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 flex items-center gap-1">
                  <Zap size={8} className="text-amber-500 fill-amber-500" />
                  <span className="text-[9px] font-black tracking-wide bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent uppercase">
                    AI Supported
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Quick Desktop Links */}
          <div className="hidden lg:flex items-center gap-1 bg-gray-100/80 dark:bg-white/[0.06] p-1.5 rounded-full border border-gray-200/60 dark:border-white/10">
            {isLoggedIn && DESKTOP_LINKS.filter(link => userRole && link.roles.includes(userRole)).map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="px-2.5 xl:px-3.5 py-1.5 rounded-full text-xs font-semibold text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 transition-all whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 md:gap-3">
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 transition-all hover:rotate-12"
                aria-label="Toggle Theme"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            )}

            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`
                relative p-2.5 rounded-full transition-all duration-300
                ${isOpen
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-black rotate-90 shadow-md'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20'
                }
              `}
              aria-label="Toggle Menu"
            >
              {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </nav>

      {/* SPACER */}
      <div className="h-20 w-full" aria-hidden="true" />

      {/* DRAWER / MENU */}
      <div
        className={`fixed z-[90] transition-all duration-500 cubic-bezier(0.32,0.72,0,1)
          ${isOpen
            ? 'opacity-100 visible translate-y-0 scale-100'
            : 'opacity-0 invisible -translate-y-4 scale-[0.98] pointer-events-none'
          }
          
          /* Mobile: Full Screen, Top padded */
          inset-0 top-20 bg-white/95 dark:bg-gray-950/95 backdrop-blur-3xl
          
          /* Desktop: Floating Panel */
          md:inset-auto md:top-24 md:right-6 md:w-[680px] md:h-auto md:max-h-[85vh] 
          md:rounded-[2rem] md:shadow-2xl md:shadow-black/5 dark:md:shadow-black/50
          md:border md:border-gray-200/50 md:dark:border-white/10
          md:bg-white/90 md:dark:bg-gray-900/90 flex flex-col overflow-hidden
        `}
      >
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
          {/* User Profile / Auth Status */}
          <div className="flex items-center justify-between mb-6 p-1">
            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer">
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 border-2 border-white dark:border-gray-800 shadow-sm">
                  <User size={28} strokeWidth={1.5} />
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-4 h-4 border-[3px] border-white dark:border-gray-900 rounded-full transition-colors duration-500 ${isLoggedIn ? 'bg-emerald-500' : 'bg-gray-300'}`}
                />
              </div>

              <div className="flex flex-col">
                <span className="font-bold text-gray-900 dark:text-white text-base">
                  {isLoggedIn ? 'Welcome Back' : 'Guest User'}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {isLoggedIn ? 'CMS' : 'Please login to continue'}
                  </span>
                </div>
              </div>
            </div>

            {/* Auth Action Button */}
            {isLoggedIn ? (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-50 text-red-600 hover:bg-red-500 hover:text-white dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-300 group"
              >
                <span className="text-xs font-bold uppercase tracking-wide">Logout</span>
                <Power size={16} className="group-hover:text-white" />
              </button>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="px-6 py-2.5 rounded-full bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 transition-all transform hover:-translate-y-0.5"
              >
                Sign In
              </button>
            )}
          </div>

          {/* AI NOTICE BANNER */}
          <Link
            href="/notice"
            onClick={() => setIsOpen(false)}
            className="mb-8 block group relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-5 text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-300 hover:scale-[1.01]"
          >
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-fuchsia-500/20 blur-2xl" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm border border-white/10 flex items-center justify-center shadow-inner">
                  <Sparkles size={24} className="text-white fill-white/20" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="font-bold text-lg leading-none">Send Notice To Students</h4>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/20 border border-white/10 text-white/90">
                      AI
                    </span>
                  </div>
                  <p className="text-indigo-100 text-xs font-medium">
                    Send AI powered personalized messages.
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <ChevronRight size={18} />
              </div>
            </div>
          </Link>

          {/* Navigation Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Academic & Utilities
              </h3>
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full border border-gray-200 dark:border-white/5">
                {visibleLinks.length} Apps
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {visibleLinks.map(link => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`
                       group relative flex flex-col items-center p-5 rounded-2xl 
                       bg-gray-50/80 dark:bg-gray-800/40 
                       border border-transparent ${link.border}
                       hover:bg-white dark:hover:bg-gray-800
                       hover:shadow-xl hover:shadow-gray-200/40 dark:hover:shadow-black/40
                       transition-all duration-300 ease-out hover:-translate-y-1
                     `}
                  >
                    <div
                      className={`
                       w-12 h-12 rounded-2xl mb-3 flex items-center justify-center 
                       ${link.bg} ${link.color}
                       transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm
                     `}
                    >
                      <Icon size={24} strokeWidth={2} />
                    </div>

                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                      {link.label}
                    </span>

                    <div className="absolute top-3 right-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Click Outside Overlay (PC) */}
      {isOpen && (
        <div
          className="hidden md:block fixed inset-0 z-[80] cursor-default bg-black/5 dark:bg-black/60 backdrop-blur-sm transition-all duration-500"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default Navbar;
