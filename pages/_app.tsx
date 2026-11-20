import '../styles/globals.css';
import type { AppProps } from 'next/app';
import type { User } from '@supabase/supabase-js';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '../components/ui/toaster';
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadSchoolAccess, type SchoolAccess } from '../utils/adminDataAccess';
import { SchoolSession } from '../utils/schoolSession';
import { useRouter } from 'next/router';
import WelcomeScreen from '../components/WelcomeScreen';

const OPEN_ROUTES = [
  '/login',
  '/admission',
  '/parents_portal',
  '/auth/callback',
  '/datesheets',
  '/res',
  '/res1',
];
const EMPTY_SESSION = {
  user: null as User | null,
  access: null as SchoolAccess | null,
  loading: true,
  error: '',
};

function useAuth(retry: number) {
  const [state, setState] = useState(EMPTY_SESSION);
  useEffect(() => {
    let mounted = true;
    let generation = 0;
    let task: ReturnType<typeof setTimeout> | undefined;

    function signedOut() {
      localStorage.removeItem('UserRole');
      setState({ ...EMPTY_SESSION, loading: false });
    }

    async function verify(user: User | null, check: number) {
      if (!mounted || check !== generation) return;
      if (!user) {
        signedOut();
        return;
      }
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const { data: access, error } = await Promise.race([
          loadSchoolAccess(supabase, user.id),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () => reject(new Error('Unable to verify your account. Try again shortly.')),
              8_000
            );
          }),
        ]);
        if (!mounted || check !== generation) return;
        if (error) throw error;
        if (!access || access.is_active === false) {
          signedOut();
          void supabase.auth.signOut();
          return;
        }
        localStorage.setItem('UserRole', access.role ?? 'user');
        setState({ user, access, loading: false, error: '' });
      } catch (error) {
        if (mounted && check === generation) {
          console.error('Could not verify school access', error);
          setState({
            ...EMPTY_SESSION,
            loading: false,
            error: 'Unable to verify your account. Try again shortly.',
          });
        }
      } finally {
        clearTimeout(deadline);
      }
    }

    setState(EMPTY_SESSION);
    const startup = setTimeout(() => {
      if (mounted)
        setState({
          ...EMPTY_SESSION,
          loading: false,
          error: 'Unable to verify your account. Try again shortly.',
        });
    }, 8_000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        !['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(
          event
        )
      )
        return;
      clearTimeout(startup);
      const check = ++generation;
      clearTimeout(task);
      // Run outside Supabase's auth callback so profile requests can use its session.
      task = setTimeout(() => {
        void verify(session?.user ?? null, check);
      }, 0);
    });
    return () => {
      mounted = false;
      clearTimeout(startup);
      clearTimeout(task);
      subscription.unsubscribe();
    };
  }, [retry]);
  return state;
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const [retry, setRetry] = useState(0);
  const [welcomedUser, setWelcomedUser] = useState<string | null>(null);
  const { user, access, loading, error } = useAuth(retry);
  const router = useRouter();
  const isAdmin = access?.role === 'admin' || access?.role === 'superadmin';
  const isPublic = OPEN_ROUTES.some(
    path => router.pathname === path || router.pathname.startsWith(path + '/')
  );
  const redirect =
    !loading && !error && !isPublic
      ? !user
        ? '/login'
        : router.pathname.startsWith('/admin') && !isAdmin
          ? '/'
          : router.pathname === '/' && isAdmin
            ? '/admin'
            : null
      : null;
  const greeting = !isPublic && !loading && Boolean(user && user.id !== welcomedUser) && !error;
  const name = access?.name?.trim();

  useEffect(() => {
    if (redirect) void router.replace(redirect);
  }, [redirect, router]);
  useEffect(() => {
    if (!greeting || !user) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setWelcomedUser(user.id), reducedMotion ? 450 : 850);
    return () => clearTimeout(timer);
  }, [greeting, user?.id]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SchoolSession.Provider value={{ access, loading }}>
        {isPublic || (!loading && !greeting && !redirect && !error) ? (
          <Component {...pageProps} />
        ) : error ? (
          <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
            <div className="space-y-3 text-center" role="alert">
              <p>{error}</p>
              <button
                className="rounded-lg border px-4 py-2"
                onClick={() => setRetry(value => value + 1)}
              >
                Try again
              </button>
            </div>
          </main>
        ) : (
          <WelcomeScreen name={name} />
        )}
        <Toaster />
      </SchoolSession.Provider>
    </ThemeProvider>
  );
}
