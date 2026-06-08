import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Mail, Phone, Lock, Calendar, Globe, 
  ArrowRight, ChevronLeft, Check, AlertCircle, RefreshCw 
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import FallingPhysicsBackground from '../components/FallingPhysicsBackground'

export default function Register() {
  const navigate = useNavigate()
  const { register, verifyOTP, updateProfile, error: authError } = useAuth()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Step 1 Form fields
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Step 2 OTP fields
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''))
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Step 3 Profile onboarding fields
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [country, setCountry] = useState('')
  const [bio, setBio] = useState('')

  // Clear errors on step change
  useEffect(() => {
    setLocalError(null)
  }, [step])

  // Step 1: Submit Details
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!fullName || !username || !email || !password || !confirmPassword) {
      setLocalError('Please fill in all required fields.')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const success = await register({
      full_name: fullName,
      username,
      email,
      phone: phone || undefined,
      password,
      confirm_password: confirmPassword,
      bio: "Hey there! I am using CONNECT-ON."
    })
    setLoading(false)

    if (success) {
      setStep(2)
    }
  }

  // Step 2: OTP Verification
  const handleOtpChange = (element: HTMLInputElement, index: number) => {
    const value = element.value
    if (isNaN(Number(value))) return

    const newOtp = [...otp]
    newOtp[index] = value.substring(value.length - 1)
    setOtp(newOtp)

    // Focus next input
    if (value && index < 5 && otpRefs.current[index + 1]) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0 && otpRefs.current[index - 1]) {
      const newOtp = [...otp]
      newOtp[index - 1] = ''
      setOtp(newOtp)
      otpRefs.current[index - 1]?.focus()
    }
  }

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    const otpCode = otp.join('')

    if (otpCode.length !== 6) {
      setLocalError('Please enter a valid 6-digit OTP code.')
      return
    }

    setLoading(true)
    const success = await verifyOTP(otpCode, 'registration', true)
    setLoading(false)

    if (success) {
      setStep(3)
    }
  }

  // Step 3: Complete Profile
  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    setLoading(true)
    const success = await updateProfile({
      dob: dob || undefined,
      gender: gender || undefined,
      country: country || undefined,
      bio: bio || undefined,
      presence_status: 'online'
    })
    setLoading(false)

    if (success) {
      navigate('/')
    }
  }

  const displayError = localError || authError

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-transparent py-12 px-4 relative overflow-hidden">
      {/* Physics falling particles canvas background */}
      <FallingPhysicsBackground />

      {/* Decorative blurry auroras */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[var(--accent)] opacity-10 blur-[130px] animate-glow pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-pink-500 opacity-5 blur-[130px] animate-glow pointer-events-none" />

      <div className="max-w-md w-full z-10">
        {/* Step Indicator Header */}
        <div className="flex justify-between items-center mb-8 px-2">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="CONNECT-SON" className="h-8 w-auto object-contain drop-shadow-[0_0_10px_rgba(0,102,255,0.3)]" />
            <span className="text-sm font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-pink-500">CONNECT-SON</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div 
                key={s} 
                className={`h-2 w-8 rounded-full transition-all duration-300 ${
                  step === s ? 'bg-[var(--accent)] w-12' : step > s ? 'bg-emerald-500' : 'bg-[var(--border-color)]'
                }`} 
              />
            ))}
          </div>
        </div>

        <div className="glass-panel p-8 w-full">
          <AnimatePresence mode="wait">
            {/* STEP 1: Registration details */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl font-bold mb-1">Create Account</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">Let's set up your profile credentials.</p>

                {displayError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handleStep1Submit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="text" 
                        name="name"
                        autocomplete="name"
                        required
                        placeholder="Enter your full name" 
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Username *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="text" 
                        name="username"
                        autocomplete="username"
                        required
                        placeholder="Choose a unique username" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Email Address *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="email" 
                        name="email"
                        autocomplete="email"
                        required
                        placeholder="Enter your email address" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Phone Number (Optional)</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="tel" 
                        name="tel"
                        autocomplete="tel"
                        placeholder="Enter your phone number" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Password *</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                        <input 
                          type="password" 
                          name="new-password"
                          autocomplete="new-password"
                          required
                          placeholder="Create a password" 
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Confirm Password *</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                        <input 
                          type="password" 
                          name="new-password-confirm"
                          autocomplete="new-password"
                          required
                          placeholder="Re-enter your password" 
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-3 mt-6 btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Continue'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 2: OTP Code Verification */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <button 
                    onClick={() => setStep(1)} 
                    className="p-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-[var(--text-secondary)]">Go back</span>
                </div>

                <h2 className="text-2xl font-bold mb-1">Verify Email</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">
                  We've sent a 6-digit OTP code to <strong className="text-[var(--text-primary)]">{email}</strong>. Check your inbox (and spam folder).
                </p>

                {displayError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handleStep2Submit} className="space-y-6">
                  <div className="flex justify-between gap-2">
                    {otp.map((data, index) => (
                      <input
                        key={index}
                        type="text"
                        name="otp"
                        maxLength={1}
                        value={data}
                        ref={(el) => { otpRefs.current[index] = el }}
                        onChange={(e) => handleOtpChange(e.target, index)}
                        onKeyDown={(e) => handleOtpKeyDown(e, index)}
                        onFocus={(e) => e.target.select()}
                        className="w-12 h-12 text-center text-xl font-bold glass-input focus:border-[var(--accent)]"
                      />
                    ))}
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-3 btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify Code'}
                    {!loading && <Check className="w-4 h-4" />}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 3: Complete Profile */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl font-bold mb-1">Verify Account</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">Account activated! Tell us a little more about yourself.</p>

                {displayError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handleStep3Submit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Date of Birth</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="date" 
                        name="bday"
                        autocomplete="bday"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Gender</label>
                    <select 
                      value={gender} 
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full px-4 py-3 glass-input text-sm focus:outline-none"
                    >
                      <option value="" className="bg-[var(--bg-main)]">Select Gender</option>
                      <option value="male" className="bg-[var(--bg-main)]">Male</option>
                      <option value="female" className="bg-[var(--bg-main)]">Female</option>
                      <option value="other" className="bg-[var(--bg-main)]">Other</option>
                      <option value="prefer_not_to_say" className="bg-[var(--bg-main)]">Prefer not to say</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Country</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
                      <input 
                        type="text" 
                        name="country"
                        autocomplete="country"
                        placeholder="Enter your country" 
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Short Bio</label>
                    <textarea 
                      placeholder="Write a short bio about yourself..." 
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 glass-input text-sm focus:outline-none resize-none"
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-3 mt-6 btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Complete Setup & Dashboard'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {step === 1 && (
          <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
            Already have an account? <a href="/login" className="text-[var(--accent)] hover:underline font-semibold">Login</a>
          </p>
        )}
      </div>
    </div>
  )
}
