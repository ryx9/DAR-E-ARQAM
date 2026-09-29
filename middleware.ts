import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const OPEN_ROUTES = [
  '/login',
  '/admission',
  '/parents_portal',
  '/auth/callback',
  '/datesheets',
  '/res',
  '/res1'
]

export async function middleware(request: NextRequest) {
  // Create an initial response object
  let supabaseResponse = NextResponse.next({
    request,
  })

  const pathname = request.nextUrl.pathname

  // Skip static assets and open public routes
  if (OPEN_ROUTES.some(route => pathname.startsWith(route)) || pathname.startsWith('/_next')) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Update the request cookies
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

          // Update the response cookies so the browser actually saves them!
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 1. Get authenticated user session securely
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 2. Strict Active Check on Server
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_active === false) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
