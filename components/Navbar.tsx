'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { LayoutGrid, Moon, Sun, User, X, Menu, Power, Zap } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { desktopSchoolLinks, drawerSchoolNavigation } from '../utils/schoolNavigation';
import { useSchoolSession } from '../utils/schoolSession';
import SchoolTools from './SchoolTools';

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
   ========================================================================== */

let introPlayed = false;

const useRouter = () => {
  return { push: (p: string) => (window.location.href = p) };
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super admin',
  admin: 'Admin',
  teacher: 'Teacher',
  user: 'User',
};

// Shared styles
const BRAND_BUTTON =
  'bg-[hsl(var(--brand))] text-white dark:text-[hsl(var(--brand-deep))] shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_8px_16px_-8px_hsl(var(--brand)/0.7)]';

const focusNavbarSearch = () => {
  window.setTimeout(() => {
    const drawer = document.getElementById('nav-drawer');
    const search = drawer?.querySelector<HTMLInputElement>('#school-tools-search');
    if (drawer?.getAttribute('aria-hidden') === 'false') {
      search?.focus({ preventScroll: true });
    }
  }, 150);
};

// ----- Component -----

const Navbar = () => {
  const { resolvedTheme: theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { access, loading } = useSchoolSession();
  const isLoggedIn = Boolean(access);
  const authReady = !loading;
  const userRole = access?.role ?? null;
  const userName = access?.name?.trim();
  // true only for the very first render after a full page load
  const [playIntro] = useState(() => !introPlayed);
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    introPlayed = true;
    setMounted(true);
  }, []);

  // Close the menu whenever the page changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onGlobalShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'k' ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.repeat
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))
      ) {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
      focusNavbarSearch();
    };

    window.addEventListener('keydown', onGlobalShortcut);
    return () => window.removeEventListener('keydown', onGlobalShortcut);
  }, []);

  // While the menu is open: Escape closes it and the page behind does not scroll
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
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
  const roleLabel = userRole ? (ROLE_LABELS[userRole] ?? userRole) : null;
  const sections = drawerSchoolNavigation(access);
  const desktopLinks = desktopSchoolLinks(access);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === '/admin' || !pathname.startsWith(href + '/')) return false;
    return !sections.some(section =>
      section.links.some(
        link =>
          link.href.startsWith(href + '/') &&
          (pathname === link.href || pathname.startsWith(link.href + '/'))
      )
    );
  };

  const handleSignOut = async () => {
    setIsOpen(false);
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

  return (
    <>
      {/* FLOATING JELLY-GLASS PILL */}
      <div
        className={`${playIntro ? 'navbar-float ' : ''}pointer-events-none fixed inset-x-0 top-3 z-[100] px-3 sm:px-5`}
      >
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
            <Link
              href={isAdmin ? '/admin' : '/'}
              className="group flex select-none items-center gap-3"
              aria-label="Dar-e-Arqam home"
            >
              <span
                className="jelly flex h-11 w-11 items-center justify-center rounded-full text-lg font-extrabold text-white shadow-[0_8px_18px_-8px_hsl(var(--brand)/0.8),inset_0_2px_2px_rgba(255,255,255,0.45)] ring-1 ring-inset ring-white/30"
                style={{
                  backgroundImage:
                    'linear-gradient(145deg, hsl(var(--brand)), hsl(var(--brand-deep)))',
                }}
              >
                D
              </span>

              <span className="flex flex-col">
                <span className="text-[17px] font-extrabold leading-none tracking-tight text-foreground">
                  DAR-E-ARQAM
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline lg:hidden xl:inline">
                    School system
                  </span>
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
                desktopLinks.map(link => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={`jelly-soft whitespace-nowrap rounded-full py-2 font-medium ${
                        isAdmin
                          ? 'px-2 text-xs xl:px-3 xl:text-[13px]'
                          : 'px-2.5 text-[12.5px] xl:px-3.5 xl:text-[13px]'
                      } ${
                        active
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
                ref={menuButtonRef}
                onClick={() => {
                  if (isOpen) {
                    setIsOpen(false);
                  } else {
                    setIsOpen(true);
                    focusNavbarSearch();
                  }
                }}
                aria-expanded={isOpen}
                aria-controls="nav-drawer"
                aria-label={isOpen ? 'Close menu' : isLoggedIn ? 'Open all tools' : 'Open menu'}
                className={`jelly flex h-11 w-11 items-center justify-center gap-2 rounded-full ${isLoggedIn ? 'lg:w-auto lg:px-3.5' : ''} ${
                  isOpen
                    ? BRAND_BUTTON
                    : 'bg-white/60 text-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_6px_14px_-8px_hsl(var(--brand)/0.5)] hover:bg-white/80 dark:bg-white/10 dark:shadow-none dark:hover:bg-white/15'
                }`}
              >
                {isOpen ? <X size={20} /> : <Menu size={20} />}
                {isLoggedIn && (
                  <span className="hidden whitespace-nowrap text-xs font-semibold lg:inline">
                    {isOpen ? 'Close' : 'All tools'}
                  </span>
                )}
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
          md:inset-x-auto md:bottom-auto md:right-5 md:top-[92px] md:max-h-[calc(100vh-112px)] md:w-[min(860px,calc(100vw-2.5rem))] md:origin-top-right
          ${
            isOpen
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
                  className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--card))] transition-colors duration-500 ${
                    isLoggedIn ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-foreground">
                  {isLoggedIn ? `Welcome back, ${userName || 'there'}` : 'Guest user'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {isLoggedIn ? (roleLabel ?? 'CMS') : 'Sign in to continue'}
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

          <section aria-label="School tools" className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-3 dark:border-white/10">
              <LayoutGrid className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                School Tools
              </h2>
            </div>
            <SchoolTools
              exclude={['/dashboard', '/timetable']}
              onNavigate={() => setIsOpen(false)}
            />
          </section>
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
