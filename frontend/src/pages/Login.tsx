import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Lock, Mail, ChevronLeft, ArrowRight, 
  Check, AlertCircle, RefreshCw, Eye, EyeOff 
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import FallingPhysicsBackground from '../components/FallingPhysicsBackground'

export default function Login() {
  const navigate = useNavigate()
  const { login, verify2FaLogin, requestPasswordResetOTP, resetPassword, registrationEmail, error: authError } = useAuth()
  
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset' | '2fa'>(() => {
    return window.location.pathname === '/reset-password' ? 'reset' : 'login'
  })
  const [showPassword, setShowPassword] = useState(false)

  // Login inputs
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  // 2FA code input
  const [twoFaCode, setTwoFaCode] = useState('')

  // Forgot password inputs
  const [forgotEmail, setForgotEmail] = useState('')

  // Reset password inputs
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!usernameOrEmail || !password) {
      setLocalError('Please enter your credentials.')
      return
    }

    setLoading(true)
    const result = await login(usernameOrEmail, password, rememberMe)
    setLoading(false)

    if (result.success) {
      if (result.requires2Fa) {
        setMode('2fa')
      } else {
        navigate('/')
      }
    }
  }

  const handle2FaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!twoFaCode || twoFaCode.length !== 6 || !/^\d+$/.test(twoFaCode)) {
      setLocalError('Please enter a valid 6-digit verification code.')
      return
    }

    setLoading(true)
    const success = await verify2FaLogin(twoFaCode, rememberMe)
    setLoading(false)

    if (success) {
      navigate('/')
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!forgotEmail) {
      setLocalError('Please enter your registered email address.')
      return
    }

    setLoading(true)
    const success = await requestPasswordResetOTP(forgotEmail)
    setLoading(false)

    if (success) {
      setMode('reset')
    }
  }

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!otpCode || !newPassword || !confirmPassword) {
      setLocalError('All fields are required.')
      return
    }

    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    setLoading(true)
    const success = await resetPassword({
      code: otpCode,
      new_password: newPassword,
      confirm_password: confirmPassword
    })
    setLoading(false)

    if (success) {
      setMode('login')
      setUsernameOrEmail(forgotEmail)
      setForgotEmail('')
      setOtpCode('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const displayError = localError || authError

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-transparent py-12 px-4 relative overflow-hidden">
      {/* Physics falling particles canvas background */}
      <FallingPhysicsBackground />

      {/* Blurry glow background */}
      <div className="absolute top-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-[var(--accent)] opacity-10 blur-[130px] animate-glow pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500 opacity-5 blur-[130px] animate-glow pointer-events-none" />

      <div className="max-w-md w-full z-10">
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/logo.png" alt="CONNECT-SON" className="h-16 w-auto object-contain drop-shadow-[0_0_15px_rgba(0,102,255,0.4)] animate-[pulse_3s_infinite]" />
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-pink-500 tracking-wider mt-3 mb-1">CONNECT-SON</h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest opacity-80">Feel Free To Connect</p>
        </div>

        <div className="glass-panel p-8 w-full">
          <AnimatePresence mode="wait">
            {/* LOGIN MODE */}
            {mode === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-2xl font-bold mb-1">Welcome Back</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">Sign in to resume your secure conversations.</p>

                {displayError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Username or Email</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="text" 
                        name="username"
                        autoComplete="username"
                        required
                        placeholder="username or email" 
                        value={usernameOrEmail}
                        onChange={(e) => setUsernameOrEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-[var(--text-secondary)]">Password</label>
                      <button 
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        name="password"
                        autoComplete="current-password"
                        required
                        placeholder="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 glass-input text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3.5 text-[var(--text-secondary)] hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center mt-2">
                    <input 
                      type="checkbox" 
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-[var(--border-color)] bg-transparent text-[var(--accent)] focus:ring-[var(--accent-glow)]"
                    />
                    <label htmlFor="rememberMe" className="text-xs font-medium text-[var(--text-secondary)] ml-2 select-none cursor-pointer">
                      Remember Me
                    </label>
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-3 mt-6 btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Sign In'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              </motion.div>
            )}

            {/* FORGOT PASSWORD MODE */}
            {mode === 'forgot' && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <button 
                    onClick={() => setMode('login')} 
                    className="p-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-[var(--text-secondary)]">Go back</span>
                </div>

                <h2 className="text-2xl font-bold mb-1">Forgot Password</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">Enter your email and we'll send you a password reset code.</p>

                {displayError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="email" 
                        name="email"
                        autoComplete="email"
                        required
                        placeholder="john@example.com" 
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-3 mt-6 btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Send Reset Code'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              </motion.div>
            )}

            {/* RESET PASSWORD MODE */}
            {mode === 'reset' && (
              <motion.div
                key="reset"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-2xl font-bold mb-1">Reset Password</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">
                  Check your console log/email for the reset code sent to <strong className="text-white">{forgotEmail || registrationEmail}</strong>.
                </p>

                {displayError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">6-Digit Reset Code</label>
                    <input 
                      type="text" 
                      name="one-time-code"
                      autoComplete="one-time-code"
                      required
                      placeholder="123456" 
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full px-4 py-3 glass-input text-center text-lg font-bold tracking-widest"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="password" 
                        name="new-password"
                        autoComplete="new-password"
                        required
                        placeholder="••••••" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="password" 
                        name="new-password-confirm"
                        autoComplete="new-password"
                        required
                        placeholder="••••••" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-3 mt-6 btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Update Password'}
                    {!loading && <Check className="w-4 h-4" />}
                  </button>
                </form>
              </motion.div>
            )}

            {/* 2FA MODE */}
            {mode === '2fa' && (
              <motion.div
                key="2fa"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <button 
                    type="button"
                    onClick={() => setMode('login')} 
                    className="p-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer bg-transparent"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-[var(--text-secondary)]">Back to Sign In</span>
                </div>

                <h2 className="text-2xl font-bold mb-1">Two-Factor Authentication</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">Enter the 6-digit authentication code from your authenticator app.</p>

                {displayError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handle2FaSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">6-Digit Code</label>
                    <input 
                      type="text" 
                      name="two-factor-code"
                      autoComplete="one-time-code"
                      required
                      placeholder="000000" 
                      maxLength={6}
                      value={twoFaCode}
                      onChange={(e) => setTwoFaCode(e.target.value)}
                      className="w-full px-4 py-3 glass-input text-center text-2xl font-black tracking-widest"
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-3 mt-6 btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify & Sign In'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {mode === 'login' && (
          <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
            Don't have an account? <a href="/register" className="text-[var(--accent)] hover:underline font-semibold">Register</a>
          </p>
        )}
      </div>
    </div>
  )
}
