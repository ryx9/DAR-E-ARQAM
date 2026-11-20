import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminCanOpen, loadSchoolAccess } from './utils/adminDataAccess';

const OPEN_ROUTES = [
  '/login',
  '/admission',
  '/parents_portal',
  '/auth/callback',
  '/datesheets',
  '/res',
  '/res1',
];
const PUBLIC_ASSETS = new Set([
  '/favicon.ico',
  '/logo.gif',
  '/logo-0.png',
  '/logo-1.png',
  '/lg.png',
]);
const AUTH_TIMEOUT_MS = 8_000;

export async function middleware(request: NextRequest) {
  // Create an initial response object
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // Skip static assets and open public routes
  if (
    OPEN_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/')) ||
    PUBLIC_ASSETS.has(pathname) ||
    pathname.startsWith('/_next/')
  ) {
    return supabaseResponse;
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update the request cookies
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          // Update the response cookies so the browser actually saves them!
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  function redirect(path: string) {
    const response = NextResponse.redirect(new URL(path, request.url));
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    return response;
  }

  async function checkAccess() {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (
      authError &&
      (authError.name === 'AuthRetryableFetchError' ||
        authError.status === 429 ||
        (authError.status ?? 0) >= 500)
    )
      throw authError;
    if (!user || authError) return redirect('/login');

    const { data: profile, error: profileError } = await loadSchoolAccess(supabase, user.id);
    if (profileError) throw profileError;
    if (!profile || profile.is_active === false) return redirect('/login');

    const role = profile.role?.toLowerCase();
    if (
      (pathname === '/admin/profiles' || pathname.startsWith('/admin/profiles/')) &&
      role !== 'superadmin'
    )
      return redirect(role === 'admin' ? '/admin' : '/dashboard');
    if (!adminCanOpen(pathname, profile)) return redirect('/admin?restricted=1');
    return supabaseResponse;
  }

  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Supabase access check timed out'));
      }, AUTH_TIMEOUT_MS);
    });
    return await Promise.race([checkAccess(), deadline]);
  } catch (error) {
    console.error('Routing middleware access check failed', {
      pathname,
      timedOut: controller.signal.aborted,
      error: error instanceof Error ? error.message : 'Supabase request failed',
    });
    return new NextResponse(
      'Sign-in checks are temporarily unavailable. Please try again shortly.',
      {
        status: 503,
        headers: {
          'Retry-After': '5',
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
