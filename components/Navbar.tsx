'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  BarChart2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

/* ==========================================================================
   Design notes
   - Uses the tokens from globals.css (--brand, --brand-deep, --card, --border,
     --muted ...), so the navbar follows the school colour and dark mode.
   - The header is a floating jelly-glass pill (.navbar-float / .navbar-glass
     in globals.css). Buttons use .jelly / .jelly-soft for the springy press.
   - The desktop quick links show from the lg breakpoint (1024px) up, as in the
     original navbar. Between lg and xl the pill is slightly more compact.
   - Each app has a single `hue`; the icon chip colours are derived from it
     (soft in light mode, glowing in dark mode), so the set looks cohesive.
   - The one bold element in the menu is the AI notice banner.
   ========================================================================== */

// ----- Types & Hooks -----
type Theme = 'light' | 'dark';

/* Module-level memory.
   If every page renders its own <Navbar />, the navbar is re-created on each
   page change. These values live outside React, so they survive client-side
   navigation: the entrance animation plays once, and the auth / theme state
   starts from what was already known instead of popping in again. A full page
   reload resets them, which is the right moment to play the intro again. */
let introPlayed = false;
let authCache: { isLoggedIn: boolean; userRole: string | null } | null = null;
let themeCache: Theme | null = null;

const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(themeCache ?? 'light');
  const [mounted, setMounted] = useState(themeCache !== null);

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Theme) || 'light';
    themeCache = stored;
    setThemeState(stored);
    setMounted(true);
    document.documentElement.classList.toggle('dark', stored === 'dark');
  }, []);

  const setTheme = (t: Theme) => {
    themeCache = t;
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
type NavItem = { href: string; label: string; icon: LucideIcon; hue: number };

const NAV_LINKS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid, hue: 217 },
  { href: '/reports', label: 'Reports', icon: BarChart2, hue: 239 },
  { href: '/marks', label: 'Tests & Marks', icon: ScrollText, hue: 160 },
  { href: '/attendance-record/report', label: 'Attendance', icon: UserCheck, hue: 173 },
  { href: '/syllabus', label: 'Syllabus', icon: BookOpenCheck, hue: 262 },
  { href: '/diary', label: 'Diary', icon: NotebookPen, hue: 330 },
  { href: '/activities', label: 'Activities', icon: Sparkles, hue: 292 },
  { href: '/advance', label: 'Advance', icon: Wallet, hue: 142 },
  { href: '/mycomplaint', label: 'Complaints', icon: ShieldAlert, hue: 347 },
];

const ADMIN_LINKS: NavItem[] = [
  { href: '/admin', label: 'Admin Overview', icon: LayoutGrid, hue: 217 },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText, hue: 173 },
  { href: '/admin/crud', label: 'Manage Students', icon: Users, hue: 239 },
];

const SUPERADMIN_LINKS: NavItem[] = [
  { href: '/admin/report', label: 'Fee Reports', icon: BarChart2, hue: 188 },
  { href: '/admin/profiles', label: 'Manage Teachers', icon: UserCheck, hue: 262 },
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

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super admin',
  admin: 'Admin',
  teacher: 'Teacher',
  user: 'User',
};

// Shared styles
const BRAND_BUTTON =
  'bg-[hsl(var(--brand))] text-white dark:text-[hsl(var(--brand-deep))] shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_8px_16px_-8px_hsl(var(--brand)/0.7)]';

// ----- Component -----

const Navbar = () => {
  const { theme, setTheme, mounted } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(authCache?.isLoggedIn ?? false);
  const [authReady, setAuthReady] = useState(authCache !== null);
  const [userRole, setUserRole] = useState<string | null>(authCache?.userRole ?? null);
  // true only for the very first render after a full page load
  const [playIntro] = useState(() => !introPlayed);
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    introPlayed = true;
  }, []);

  // ----- Auth -----
  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      setIsLoggedIn(!!user);
      if (!user) {
        authCache = { isLoggedIn: false, userRole: null };
        setUserRole(null);
        setAuthReady(true);
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (active) {
        const role = profile?.role?.toLowerCase() || null;
        authCache = { isLoggedIn: true, userRole: role };
        setUserRole(role);
        setAuthReady(true);
      }
    };
    void loadProfile();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void loadProfile(); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // Close the menu whenever the page changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // While the menu is open: Escape closes it and the page behind does not scroll
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const adminItems = [...ADMIN_LINKS, ...(userRole === 'superadmin' ? SUPERADMIN_LINKS : [])];
  const roleLabel = userRole ? ROLE_LABELS[userRole] ?? userRole : null;

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const handleSignOut = async () => {
    setIsOpen(false);
    setIsLoggedIn(false);
    setUserRole(null);
    authCache = { isLoggedIn: false, userRole: null };
    localStorage.removeItem('UserRole');
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Signout error:', error);
    }
    router.push('/login');
  };

  // ----- Cursor spotlight on the navbar (desktop). Drives --mx / --my in globals.css -----
  const handleNavMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };
  const handleNavMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.removeProperty('--mx');
    e.currentTarget.style.removeProperty('--my');
  };

  // ----- Menu section (heading + grid of apps) -----
  const renderSection = (title: string, items: NavItem[]) => (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              aria-current={active ? 'page' : undefined}
              style={{ '--h': item.hue } as React.CSSProperties}
              className={`jelly-soft group flex items-center gap-3 rounded-2xl px-2.5 py-2 ${active
                ? 'bg-[hsl(var(--brand)/0.09)] ring-1 ring-inset ring-[hsl(var(--brand)/0.28)]'
                : 'hover:bg-muted'
                }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--h)_80%_94%)] text-[hsl(var(--h)_62%_38%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] dark:bg-[hsl(var(--h)_60%_55%/0.16)] dark:text-[hsl(var(--h)_85%_75%)] dark:shadow-none">
                <Icon size={18} strokeWidth={2} />
              </span>
              <span className="truncate text-[13.5px] font-medium text-foreground">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );

  return (
    <>
      {/* FLOATING JELLY-GLASS PILL */}
      <div className={`${playIntro ? 'navbar-float ' : ''}pointer-events-none fixed inset-x-0 top-3 z-[100] px-3 sm:px-5`}>
        <nav
          className="navbar-glass pointer-events-auto mx-auto h-16 max-w-7xl"
          onMouseMove={handleNavMouseMove}
          onMouseLeave={handleNavMouseLeave}
        >
          {/* curved specular highlight */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 top-[3px] h-[44%] rounded-full bg-gradient-to-b from-white/60 to-transparent dark:from-white/15"
          />

          <div className="relative flex h-full items-center justify-between gap-3 px-2.5 sm:px-3">
            {/* Logo */}
            <Link href="/" className="group flex select-none items-center gap-3" aria-label="Dar-e-Arqam home">
              <span
                className="jelly flex h-11 w-11 items-center justify-center rounded-full text-lg font-extrabold text-white shadow-[0_8px_18px_-8px_hsl(var(--brand)/0.8),inset_0_2px_2px_rgba(255,255,255,0.45)] ring-1 ring-inset ring-white/30"
                style={{ backgroundImage: 'linear-gradient(145deg, hsl(var(--brand)), hsl(var(--brand-deep)))' }}
              >
                D
              </span>

              <span className="flex flex-col">
                <span className="text-[17px] font-extrabold leading-none tracking-tight text-foreground">
                  DAR-E-ARQAM
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline lg:hidden xl:inline">School system</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-semibold leading-none text-[hsl(var(--brand))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-white/10 dark:shadow-none">
                    <Zap size={10} className="fill-amber-500 text-amber-500" />
                    AI supported
                  </span>
                </span>
              </span>
            </Link>

            {/* Quick desktop links (same breakpoint as the original navbar) */}
            <div className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex">
              {isLoggedIn &&
                DESKTOP_LINKS.filter((link) => userRole && link.roles.includes(userRole)).map((link) => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={`jelly-soft whitespace-nowrap rounded-full px-2.5 py-2 text-[12.5px] font-medium xl:px-3.5 xl:text-[13px] ${active
                        ? 'bg-white/70 text-[hsl(var(--brand))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_10px_-4px_hsl(var(--brand)/0.5)] dark:bg-white/10 dark:shadow-none'
                        : 'text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10'
                        }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
            </div>

            {/* Right actions */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {authReady && !isLoggedIn && (
                <Link
                  href="/login"
                  className={`jelly hidden rounded-full px-5 py-2.5 text-[13px] font-semibold sm:inline-flex ${BRAND_BUTTON}`}
                >
                  Sign in
                </Link>
              )}

              {mounted && (
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="jelly flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] hover:bg-white/50 hover:text-foreground dark:shadow-none dark:hover:bg-white/10"
                  aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                >
                  {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
                </button>
              )}

              <button
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-controls="nav-drawer"
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
                className={`jelly flex h-11 w-11 items-center justify-center rounded-full ${isOpen
                  ? BRAND_BUTTON
                  : 'bg-white/60 text-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_6px_14px_-8px_hsl(var(--brand)/0.5)] hover:bg-white/80 dark:bg-white/10 dark:shadow-none dark:hover:bg-white/15'
                  }`}
              >
                {isOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* SPACER (pill height + its top gap + breathing room) */}
      <div className="h-[84px] w-full" aria-hidden="true" />

      {/* DRAWER / MENU (floating rounded sheet under the pill) */}
      <div
        id="nav-drawer"
        role="dialog"
        aria-label="Site menu"
        aria-hidden={!isOpen}
        className={`fixed z-[90] flex origin-top flex-col overflow-hidden rounded-[28px] border border-white/60 bg-[hsl(var(--card)/0.9)] shadow-[0_28px_70px_-24px_hsl(var(--brand-deep)/0.5)] backdrop-blur-2xl transition-[opacity,transform,visibility] duration-700 ease-[var(--spring-soft)] dark:border-white/10
          inset-x-3 bottom-3 top-[92px]
          md:inset-x-auto md:bottom-auto md:right-5 md:top-[92px] md:max-h-[calc(100vh-112px)] md:w-[680px] md:origin-top-right
          ${isOpen
            ? 'visible translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none invisible -translate-y-3 scale-[0.96] opacity-0'
          }`}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {/* Profile / auth */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                  <User size={22} strokeWidth={1.6} />
                </div>
                <span
                  className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--card))] transition-colors duration-500 ${isLoggedIn ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-foreground">
                  {isLoggedIn ? 'Welcome back' : 'Guest user'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {isLoggedIn ? roleLabel ?? 'CMS' : 'Sign in to continue'}
                </p>
              </div>
            </div>

            {authReady &&
              (isLoggedIn ? (
                <button
                  onClick={handleSignOut}
                  className="jelly-soft inline-flex shrink-0 items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-[13px] font-semibold text-red-600 hover:bg-red-600 hover:text-white dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
                >
                  Log out
                  <Power size={15} />
                </button>
              ) : (
                <button
                  onClick={() => router.push('/login')}
                  className={`jelly shrink-0 rounded-full px-5 py-2 text-[13px] font-semibold ${BRAND_BUTTON}`}
                >
                  Sign in
                </button>
              ))}
          </div>

          {/* AI notice banner: the one bold element in the menu */}
          <Link
            href="/notice"
            onClick={() => setIsOpen(false)}
            className="jelly-soft group mb-6 block rounded-3xl p-4 text-white shadow-[0_14px_30px_-16px_hsl(var(--brand-deep)/0.8)]"
            style={{
              backgroundColor: 'hsl(var(--brand-deep))',
              backgroundImage:
                'radial-gradient(ellipse 80% 140% at 100% 0%, hsl(var(--brand) / 0.55), transparent 65%), radial-gradient(ellipse 60% 120% at 0% 100%, hsl(268 85% 60% / 0.35), transparent 65%)',
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/20">
                  <Sparkles size={22} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-[15px] font-bold leading-tight">Send notice to students</h4>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold leading-none">AI</span>
                  </div>
                  <p className="mt-1 text-xs text-white/80">Send AI-powered personalized messages.</p>
                </div>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors group-hover:bg-white/30">
                <ChevronRight size={17} />
              </span>
            </div>
          </Link>

          {/* Navigation */}
          {renderSection('Academic and utilities', NAV_LINKS)}
          {isAdmin && renderSection('Administration', adminItems)}
        </div>
      </div>

      {/* Click-outside overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[80] cursor-default bg-slate-900/20 backdrop-blur-[3px] dark:bg-black/55"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
};

export default Navbar;
