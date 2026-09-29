import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../utils/supabaseClient'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import Navbar from '../components/Navbar'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Mail, Lock, Eye, EyeOff, Key, ArrowRight } from 'lucide-react'

export default function AuthPage() {
  const router = useRouter()

  // Login States
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register States
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [secretKey, setSecretKey] = useState('')

  // UI States
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 1. Authenticate the user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // 2. Check the user's profile and active status immediately
    if (authData?.user) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', authData.user.id)
        .single()

      if (profileError || !profileData) {
        console.error('Error fetching user profile:', profileError)
        await supabase.auth.signOut()
        setError('Unable to verify your account. Please try again.')
        setLoading(false)
        return
      }

      // 3. Block inactive employees & show error on the login screen
      if (profileData.is_active !== true) {
        await supabase.auth.signOut()
        // Clear any potentially lingering cache
        localStorage.removeItem(`user_active_${authData.user.id}`)
        setError('Your account has been deactivated. Please contact the school administration.')
        setLoading(false)
        return
      }

      // 4. Store role and active status in cache to ensure _app.tsx loads instantly
      const userRole = profileData.role || 'user'
      localStorage.setItem('UserRole', userRole)
      localStorage.setItem(`user_active_${authData.user.id}`, JSON.stringify({
        isActive: true,
        timestamp: Date.now()
      }))

      // 5. Navigate based on role using window.location.href 
      // This forces a hard reload so the middleware reliably catches the new cookies
      const destination = (userRole === 'admin' || userRole === 'superadmin') ? '/admin' : '/'
      window.location.href = destination
    } else {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (registerPassword !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    if (secretKey !== '1234') {
      setError("Incorrect secret key")
      setLoading(false)
      return
    }

    const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined

    const { data, error } = await supabase.auth.signUp({
      email: registerEmail,
      password: registerPassword,
      options: { emailRedirectTo: redirectUrl },
    })

    if (error) {
      setError(error.message)
    } else if (data.user) {
      setError("Registration successful! Check your email.")
    }
    setLoading(false)
  }

  // ---------------------------------------------------------------------------
  // Animation Variants
  // ---------------------------------------------------------------------------
  const fadeIn = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl shadow-xl"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome Back</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Enter your credentials to access the portal.
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100 dark:bg-white/10 p-1 rounded-lg">
              <TabsTrigger
                value="login"
                className="data-[state=active]:bg-white data-[state=active]:text-blue-600 dark:data-[state=active]:bg-blue-600 dark:data-[state=active]:text-white transition-all rounded-md"
              >
                Login
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="data-[state=active]:bg-white data-[state=active]:text-blue-600 dark:data-[state=active]:bg-blue-600 dark:data-[state=active]:text-white transition-all rounded-md"
              >
                Register
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              {/* LOGIN TAB - Added key prop here */}
              <TabsContent value="login" key="login-tab">
                <motion.form
                  key="login-form"
                  onSubmit={handleLogin}
                  className="space-y-4"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={fadeIn}
                  transition={{ duration: 0.3 }}
                >
                  <div className="relative group">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      type="email"
                      placeholder="Email Address"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="pl-10 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400 text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                  </div>

                  <div className="relative group">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="pl-10 pr-10 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400 text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="submit"
                      className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all font-medium flex items-center justify-center gap-2"
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="animate-spin" size={18} /> : (
                        <>Login <ArrowRight size={16} /></>
                      )}
                    </Button>
                  </motion.div>
                </motion.form>
              </TabsContent>

              {/* REGISTER TAB - Added key prop here */}
              <TabsContent value="register" key="register-tab">
                <motion.form
                  key="register-form"
                  onSubmit={handleRegister}
                  className="space-y-4"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={fadeIn}
                  transition={{ duration: 0.3 }}
                >
                  <div className="relative group">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      type="email"
                      placeholder="Email Address"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                      className="pl-10 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400 text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                  </div>

                  <div className="relative group">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Create Password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      required
                      className="pl-10 pr-10 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400 text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="relative group">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pl-10 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400 text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                  </div>

                  <div className="relative group">
                    <Key className="absolute left-3 top-3 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      type="password"
                      placeholder="Admin Secret Key"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      required
                      className="pl-10 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400 text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="submit"
                      className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all font-medium flex items-center justify-center gap-2"
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="animate-spin" size={18} /> : (
                        <>Create Account <ArrowRight size={16} /></>
                      )}
                    </Button>
                  </motion.div>
                </motion.form>
              </TabsContent>
            </AnimatePresence>
          </Tabs>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-6 p-3 rounded-lg text-sm text-center ${error.includes("successful")
                ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200"
                : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200"
                }`}
            >
              {error}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
