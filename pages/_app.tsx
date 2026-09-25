import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ThemeProvider } from 'next-themes'
import { Toaster } from "../components/ui/toaster"
import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { useRouter } from 'next/router'
import Loader from '../components/Loader'

const OPEN_ROUTES = [
  '/login',
  '/admission',
  '/parents_portal',
  '/auth/callback',
  '/datesheets',
  '/res',
  '/res1'
]

// Cache duration: 24 hours in milliseconds
const CACHE_TTL = 1 * 60 * 1000

const useAuth = () => {
  const [authState, setAuthState] = useState({
    user: null as any | null,
    isActive: null as boolean | null,
    loading: true
  })

  useEffect(() => {
    let mounted = true

    const checkUserStatus = async (userId: string) => {
      const cacheKey = `user_active_${userId}`
      const cachedData = localStorage.getItem(cacheKey)

      if (cachedData) {
        try {
          const { isActive, timestamp } = JSON.parse(cachedData)
          // If the cache is less than 24 hours old, return it instantly
          if (Date.now() - timestamp < CACHE_TTL) {
            return isActive
          }
        } catch (e) {
          // Ignore parse errors and fall through to database check
          console.error("Cache parse error", e)
        }
      }

      // Cache is missing or expired -> Query the database
      const { data, error } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', userId)
        .single()

      const isActive = !error && data ? data.is_active : false

      // Save the fresh result to localStorage with a timestamp
      localStorage.setItem(cacheKey, JSON.stringify({
        isActive,
        timestamp: Date.now()
      }))

      return isActive
    }

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        if (mounted) setAuthState({ user: null, isActive: null, loading: false })
        return
      }

      const active = await checkUserStatus(session.user.id)

      if (!active) {
        await supabase.auth.signOut()
        localStorage.removeItem(`user_active_${session.user.id}`) // Clear cache on failure
        if (mounted) setAuthState({ user: null, isActive: false, loading: false })
      } else {
        if (mounted) setAuthState({ user: session.user, isActive: true, loading: false })
      }
    }

    // Run once on mount
    initAuth()

    // Listen for future changes (login/logout), but ignore background token refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return

        const currentUser = session?.user ?? null

        if (currentUser) {
          const active = await checkUserStatus(currentUser.id)
          if (!active) {
            await supabase.auth.signOut()
            localStorage.removeItem(`user_active_${currentUser.id}`)
            setAuthState({ user: null, isActive: false, loading: false })
            return
          }
          setAuthState({ user: currentUser, isActive: true, loading: false })
        } else {
          setAuthState({ user: null, isActive: null, loading: false })
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return authState
}

function MyApp({ Component, pageProps }: AppProps) {
  const { user, loading, isActive } = useAuth()
  const router = useRouter()

  // Read localStorage synchronously. Since we don't render this directly 
  // into the DOM (only use it for routing), it won't cause Next.js hydration errors.
  const isClient = typeof window !== 'undefined'
  const userRole = isClient ? localStorage.getItem('UserRole') : null
  const isAdmin = userRole === 'admin' || userRole === 'superadmin'

  const isPublicRoute = OPEN_ROUTES.some(route => router.pathname.startsWith(route))

  useEffect(() => {
    if (loading) return

    const currentPath = router.pathname

    // 1. Inactive user -> force logout + redirect
    if (isActive === false && currentPath !== '/login') {
      router.replace('/login')
      return
    }

    // 2. Not logged in -> redirect to login (if not on public route)
    if (!user && !isPublicRoute && currentPath !== '/login') {
      router.replace('/login')
      return
    }

    // 3. Logged in routing logic
    if (user) {
      if (currentPath.startsWith('/admin') && !isAdmin) {
        router.replace('/') // Kick non-admins out of admin areas
      } else if (currentPath === '/' && isAdmin) {
        router.replace('/admin') // Route admins to their dashboard
      }
    }
  }, [user, loading, isActive, isPublicRoute, isAdmin, router.pathname])

  // Prevent UI flash while loading protected routes OR while the router is transitioning
  if (loading && !isPublicRoute) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader />
      </div>
    )
  }

  if (!loading && !user && !isPublicRoute && router.pathname !== '/login') return null
  if (!loading && user && router.pathname.startsWith('/admin') && !isAdmin) return null

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Component {...pageProps} />
      <Toaster />
    </ThemeProvider>
  )
}

export default MyApp
