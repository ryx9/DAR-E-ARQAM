import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ThemeProvider } from 'next-themes'
import { Toaster } from "../components/ui/toaster"
import { useEffect, useState, useRef } from 'react'
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

const useAuth = () => {
  const [authState, setAuthState] = useState({
    user: null as any | null,
    isActive: null as boolean | null,
    loading: true
  })

  // Prevent duplicate execution from auth listeners
  const isCheckingRef = useRef(false)

  useEffect(() => {
    let mounted = true

    const verifyActiveAndSetState = async (sessionUser: any | null) => {
      if (!sessionUser) {
        if (mounted) setAuthState({ user: null, isActive: null, loading: false })
        return
      }

      if (isCheckingRef.current) return
      isCheckingRef.current = true

      // Strict DB check BEFORE setting loading to false
      const { data, error } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', sessionUser.id)
        .single()

      const isActive = !error && data?.is_active === true

      if (!isActive) {
        await supabase.auth.signOut()
        if (mounted) {
          setAuthState({ user: null, isActive: false, loading: false })
        }
      } else {
        if (mounted) {
          setAuthState({ user: sessionUser, isActive: true, loading: false })
        }
      }

      isCheckingRef.current = false
    }

    // Single initialization pass
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      await verifyActiveAndSetState(session?.user ?? null)
    }

    init()

    // Listen to explicit auth updates (e.g. Sign in / Sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        verifyActiveAndSetState(session?.user ?? null)
      } else if (event === 'SIGNED_OUT') {
        if (mounted) setAuthState({ user: null, isActive: null, loading: false })
      }
    })

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

  const isClient = typeof window !== 'undefined'
  const userRole = isClient ? localStorage.getItem('UserRole') : null
  const isAdmin = userRole === 'admin' || userRole === 'superadmin'

  const isPublicRoute = OPEN_ROUTES.some(route => router.pathname.startsWith(route))

  useEffect(() => {
    if (loading) return

    const currentPath = router.pathname

    if (isActive === false && currentPath !== '/login') {
      router.replace('/login')
      return
    }

    if (!user && !isPublicRoute && currentPath !== '/login') {
      router.replace('/login')
      return
    }

    if (user) {
      if (currentPath.startsWith('/admin') && !isAdmin) {
        router.replace('/')
      } else if (currentPath === '/' && isAdmin) {
        router.replace('/admin')
      }
    }
  }, [user, loading, isActive, isPublicRoute, isAdmin, router.pathname])

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
