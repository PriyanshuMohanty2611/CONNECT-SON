import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Lock, Mail, Phone, Shield, Monitor, 
  Trash2, Check, ArrowLeft, RefreshCw, 
  UserX, AlertCircle, Sparkles, LogOut, Globe, Camera
} from 'lucide-react'
import { useAuth, type UserProfile } from '../context/AuthContext'
import { api } from '../services/api'
import { initE2EE } from '../services/crypto'

interface SessionInfo {
  id: string
  device_info: string | null
  ip_address: string | null
  expires_at: string
  created_at: string
}

interface BlockedUserInfo {
  id: string
  username: string
  email: string
  profile?: {
    full_name: string
    avatar_url?: string
  }
}

type TabType = 'profile' | 'security' | 'devices' | 'moderation' | 'e2ee'

export default function Settings() {
  const navigate = useNavigate()
  const { user, updateProfile, logout, refreshUser } = useAuth()
  
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Profile fields state
  const [fullName, setFullName] = useState(user?.profile?.full_name || '')
  const [bio, setBio] = useState(user?.profile?.bio || '')
  const [dob, setDob] = useState(user?.profile?.dob || '')
  const [gender, setGender] = useState(user?.profile?.gender || '')
  const [country, setCountry] = useState(user?.profile?.country || '')
  const [presence, setPresence] = useState(user?.profile?.presence_status || 'online')
  const [themePref, setThemePref] = useState(user?.profile?.theme_preference || 'dark')

  // Email change state
  const [newEmail, setNewEmail] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [emailStep, setEmailStep] = useState<'request' | 'verify'>('request')

  // Phone change state
  const [newPhone, setNewPhone] = useState('')
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneStep, setPhoneStep] = useState<'request' | 'verify'>('request')

  // Sessions state
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  
  // Blocked users state
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserInfo[]>([])

  // E2EE Info
  const [publicKey, setPublicKey] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/login')
    } else {
      // Pre-fill profile state
      setFullName(user.profile?.full_name || '')
      setBio(user.profile?.bio || '')
      setDob(user.profile?.dob || '')
      setGender(user.profile?.gender || '')
      setCountry(user.profile?.country || '')
      setPresence(user.profile?.presence_status || 'online')
      setThemePref(user.profile?.theme_preference || 'dark')
      setPublicKey(user.profile?.public_key || null)
    }
  }, [user, navigate])

  useEffect(() => {
    return () => {
      // Revert data-theme to saved setting if they navigate away without saving
      const savedTheme = user?.profile?.theme_preference || 'dark'
      document.documentElement.setAttribute('data-theme', savedTheme)
    }
  }, [user])

  // Dynamic fetch depending on tab
  useEffect(() => {
    if (!user) return

    if (activeTab === 'devices') {
      fetchSessions()
    } else if (activeTab === 'moderation') {
      fetchBlockedUsers()
    } else if (activeTab === 'e2ee') {
      setPublicKey(user.profile?.public_key || null)
    }
  }, [activeTab, user])

  const showNotification = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMsg(message)
      setErrorMsg(null)
    } else {
      setErrorMsg(message)
      setSuccessMsg(null)
    }
    setTimeout(() => {
      setSuccessMsg(null)
      setErrorMsg(null)
    }, 4000)
  }

  // Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const success = await updateProfile({
      full_name: fullName,
      bio: bio,
      dob: dob || null,
      gender: gender || null,
      country: country || null,
      presence_status: presence,
      theme_preference: themePref
    })
    setLoading(false)
    if (success) {
      showNotification('success', 'Profile updated successfully!')
    } else {
      showNotification('error', 'Failed to update profile.')
    }
  }

  // Avatar Image Upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showNotification('error', 'Only image files are allowed.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotification('error', 'Image size must be less than 5MB.')
      return
    }

    setUploadingAvatar(true)
    const formData = new FormData()
    formData.append('file', file)

    const { data, error } = await api.post<UserProfile>('/users/me/avatar', formData)
    setUploadingAvatar(false)

    if (error) {
      showNotification('error', error)
    } else {
      showNotification('success', 'Profile picture updated successfully!')
      refreshUser()
    }
  }

  // Email Change
  const handleEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail) return
    setLoading(true)
    const { error } = await api.post('/users/me/change-email-request', { new_email: newEmail })
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      setEmailStep('verify')
      showNotification('success', 'OTP sent to new email address. Check console log!')
    }
  }

  const handleEmailVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailOtp) return
    setLoading(true)
    const { error } = await api.post('/users/me/change-email-verify', {
      new_email: newEmail,
      code: emailOtp
    })
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      showNotification('success', 'Email updated successfully!')
      setNewEmail('')
      setEmailOtp('')
      setEmailStep('request')
      refreshUser()
    }
  }

  // Phone Change
  const handlePhoneRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPhone) return
    setLoading(true)
    const { error } = await api.post('/users/me/change-phone-request', { new_phone: newPhone })
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      setPhoneStep('verify')
      showNotification('success', 'OTP sent to new phone number. Check console log!')
    }
  }

  const handlePhoneVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneOtp) return
    setLoading(true)
    const { error } = await api.post('/users/me/change-phone-verify', {
      new_phone: newPhone,
      code: phoneOtp
    })
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      showNotification('success', 'Phone number updated successfully!')
      setNewPhone('')
      setPhoneOtp('')
      setPhoneStep('request')
      refreshUser()
    }
  }

  // Sessions Management
  const fetchSessions = async () => {
    const { data, error } = await api.get<SessionInfo[]>('/auth/sessions')
    if (data) {
      setSessions(data)
    } else if (error) {
      showNotification('error', error)
    }
  }

  const handleRevokeSession = async (id: string) => {
    setLoading(true)
    const { error } = await api.post(`/auth/sessions/revoke/${id}`)
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      showNotification('success', 'Session revoked.')
      fetchSessions()
    }
  }

  const handleRevokeAllOthers = async () => {
    // Find the session that is likely current (or we can just guess the first one/highlighted one)
    // Or we can let the user pick which session is keeping, or if we have a current session in the list.
    // If not sure, we can just pass the first session ID. Let's pass the first session ID from our list or look up.
    if (sessions.length <= 1) {
      showNotification('error', 'No other active sessions found.')
      return
    }
    
    // We can try to identify current session by matching device info or IP
    // For simplicity, let's keep the one that matches our User Agent
    const current = sessions.find(s => s.device_info && navigator.userAgent.includes(s.device_info.split('/')[0])) || sessions[0]
    if (!current) return

    setLoading(true)
    const { error } = await api.post(`/auth/sessions/revoke-all-others?current_session_id=${current.id}`)
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      showNotification('success', 'All other sessions revoked successfully.')
      fetchSessions()
    }
  }

  // Blocked Users Management
  const fetchBlockedUsers = async () => {
    const { data, error } = await api.get<BlockedUserInfo[]>('/friends/blocked')
    if (data) {
      setBlockedUsers(data)
    } else if (error) {
      showNotification('error', error)
    }
  }

  const handleUnblockUser = async (id: string) => {
    setLoading(true)
    const { error } = await api.post(`/friends/unblock/${id}`)
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      showNotification('success', 'User unblocked successfully.')
      fetchBlockedUsers()
    }
  }

  // E2EE Management
  const handleRegenerateKeys = async () => {
    if (!user) return
    setLoading(true)
    try {
      // Force clearing old keys from IndexedDB and regenerate
      const DB_NAME = 'connect_on_e2ee'
      
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = async () => {
        const { publicKeyBase64 } = await initE2EE(user.username)
        setPublicKey(publicKeyBase64)
        showNotification('success', 'E2EE Keys regenerated and synchronized successfully!')
        refreshUser()
      }
      req.onerror = () => {
        showNotification('error', 'Failed to clear local E2EE keys store.')
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Key regeneration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-transparent py-10 px-4 md:px-8 relative overflow-hidden">
      {/* Dynamic Theme backgrounds */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--accent)] opacity-10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500 opacity-5 blur-[120px] pointer-events-none" />

      {/* Toast Alert */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 z-50 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2 shadow-lg"
          >
            <Check className="w-4 h-4" />
            <span>{successMsg}</span>
          </motion.div>
        )}
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 z-50 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2 shadow-lg"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl w-full glass-panel overflow-hidden flex flex-col md:flex-row h-[85vh] shadow-2xl z-10">
        
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[var(--border-color)] bg-black/10 flex flex-col p-4">
          <div className="flex items-center gap-3 mb-6 px-2">
            <button 
              onClick={() => navigate('/')}
              className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div>
              <h2 className="font-heading font-bold text-lg text-white">Settings</h2>
              <p className="text-xs text-[var(--text-secondary)]">Manage your account</p>
            </div>
          </div>

          <nav className="space-y-1.5 flex-1">
            {[
              { id: 'profile', label: 'My Profile', icon: User },
              { id: 'security', label: 'Security & Auth', icon: Shield },
              { id: 'devices', label: 'Active Devices', icon: Monitor },
              { id: 'moderation', label: 'Blocked Users', icon: UserX },
              { id: 'e2ee', label: 'End-to-End Encryption', icon: Lock }
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
                    activeTab === tab.id 
                      ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent-glow)]' 
                      : 'text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-white'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}

            {user?.is_admin && (
              <button
                onClick={() => navigate('/admin')}
                className="w-full flex items-center gap-3 px-4 py-3 mt-4 rounded-xl text-sm font-medium transition-all text-left border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 cursor-pointer"
              >
                <Shield className="w-4.5 h-4.5 text-rose-400 animate-pulse" />
                <span>Admin Dashboard</span>
              </button>
            )}
          </nav>

          <div className="pt-4 border-t border-[var(--border-color)] mt-auto">
            <button
              onClick={() => {
                logout()
                navigate('/login')
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-all text-left cursor-pointer"
            >
              <LogOut className="w-4.5 h-4.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-10 overflow-y-auto bg-black/5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              
              {/* TAB: PROFILE */}
              {activeTab === 'profile' && (
                <div>
                  <h3 className="text-2xl font-bold font-heading mb-1 text-white">Profile Customization</h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-6">Modify details visible to other members.</p>

                  <form onSubmit={handleUpdateProfile} className="space-y-5 max-w-xl">
                    {/* Profile Picture Upload Section */}
                    <div className="flex flex-col sm:flex-row items-center gap-6 p-4 glass-card border border-[var(--border-color)] bg-white/5 mb-6 rounded-xl">
                      <div className="relative group w-24 h-24 rounded-full overflow-hidden border-2 border-[var(--accent)] shadow-lg shadow-[var(--accent-glow)] flex-shrink-0">
                        {uploadingAvatar ? (
                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                            <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)]" />
                          </div>
                        ) : (
                          <>
                            <img
                              src={user?.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'}
                              alt="Profile Avatar"
                              className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            />
                            <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs font-semibold cursor-pointer transition-opacity duration-200">
                              <Camera className="w-5 h-5 mb-1" />
                              Change
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarUpload}
                                disabled={uploadingAvatar}
                              />
                            </label>
                          </>
                        )}
                      </div>
                      
                      <div className="flex-1 text-center sm:text-left">
                        <h4 className="text-sm font-bold text-white mb-1">Profile Picture</h4>
                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                          Upload a high-quality JPG, PNG, or WEBP image. Max size 5MB.
                        </p>
                        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-color)] hover:bg-white/5 text-xs font-bold text-white cursor-pointer transition-all">
                          <Camera className="w-4 h-4" />
                          Choose Image
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarUpload}
                            disabled={uploadingAvatar}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Full Name</label>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full px-4 py-2.5 glass-input text-sm"
                          placeholder="Enter your full name"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Country</label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-3 w-4 h-4 text-[var(--text-secondary)]" />
                          <input
                            type="text"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 glass-input text-sm"
                            placeholder="e.g. Canada"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Bio</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="w-full px-4 py-2.5 glass-input text-sm h-24 resize-none"
                        placeholder="Tell others about yourself..."
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Date of Birth</label>
                        <input
                          type="date"
                          value={dob}
                          onChange={(e) => setDob(e.target.value)}
                          className="w-full px-4 py-2.5 glass-input text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Gender</label>
                        <select
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          className="w-full px-4 py-2.5 glass-input text-sm bg-[var(--bg-main)]"
                        >
                          <option value="">Select Gender</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                          <option value="prefer_not_to_say">Prefer not to say</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Presence Status</label>
                        <select
                          value={presence}
                          onChange={(e) => setPresence(e.target.value)}
                          className="w-full px-4 py-2.5 glass-input text-sm bg-[var(--bg-main)]"
                        >
                          <option value="online">Online</option>
                          <option value="away">Away</option>
                          <option value="busy">Do Not Disturb</option>
                          <option value="invisible">Invisible (Offline)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Theme Vibe</label>
                        <select
                          value={themePref}
                          onChange={(e) => {
                            const val = e.target.value
                            setThemePref(val)
                            document.documentElement.setAttribute('data-theme', val)
                          }}
                          className="w-full px-4 py-2.5 glass-input text-sm bg-[var(--bg-main)]"
                        >
                          <option value="dark">Carbon Dark</option>
                          <option value="light">Crisp Light</option>
                          <option value="glassmorphism">Glassmorphic Glow</option>
                          <option value="gradient">Hyperspace Gradient</option>
                          <option value="midnight">Deep Midnight</option>
                          <option value="tiimi">Tiimi Soft Violet</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-premium px-6 py-3 mt-4 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save Profile Changes
                    </button>
                  </form>
                </div>
              )}

              {/* TAB: SECURITY */}
              {activeTab === 'security' && (
                <div className="space-y-8 max-w-xl">
                  {/* Email Settings */}
                  <div>
                    <h3 className="text-2xl font-bold font-heading mb-1 text-white">Email Address</h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">Current email: <strong className="text-white">{user?.email}</strong></p>

                    {emailStep === 'request' ? (
                      <form onSubmit={handleEmailRequest} className="space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="relative flex-1">
                            <Mail className="absolute left-3 top-3 w-4 h-4 text-[var(--text-secondary)]" />
                            <input
                              type="email"
                              required
                              value={newEmail}
                              onChange={(e) => setNewEmail(e.target.value)}
                              placeholder="New Email Address"
                              className="w-full pl-10 pr-4 py-2.5 glass-input text-sm"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={loading}
                            className="btn-premium px-5 py-2.5 text-sm cursor-pointer whitespace-nowrap"
                          >
                            Send OTP
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleEmailVerify} className="space-y-4">
                        <div className="p-3 bg-[var(--accent-glow)] rounded-xl border border-[var(--accent)] text-xs text-[var(--text-primary)] mb-3">
                          Enter the 6-digit OTP code sent to <strong>{newEmail}</strong> (check your backend log file / console).
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={emailOtp}
                            onChange={(e) => setEmailOtp(e.target.value)}
                            placeholder="6-Digit OTP"
                            className="flex-1 px-4 py-2.5 glass-input text-sm text-center font-bold tracking-widest"
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={loading}
                              className="btn-premium px-5 py-2.5 text-sm cursor-pointer"
                            >
                              Verify & Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEmailStep('request')}
                              className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] hover:bg-white/5 text-sm text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>

                  <hr className="border-[var(--border-color)]" />

                  {/* Phone Settings */}
                  <div>
                    <h3 className="text-2xl font-bold font-heading mb-1 text-white">Phone Number</h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">Current phone: <strong className="text-white">{user?.phone || 'None registered'}</strong></p>

                    {phoneStep === 'request' ? (
                      <form onSubmit={handlePhoneRequest} className="space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="relative flex-1">
                            <Phone className="absolute left-3 top-3 w-4 h-4 text-[var(--text-secondary)]" />
                            <input
                              type="tel"
                              required
                              value={newPhone}
                              onChange={(e) => setNewPhone(e.target.value)}
                              placeholder="+15551234567"
                              className="w-full pl-10 pr-4 py-2.5 glass-input text-sm"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={loading}
                            className="btn-premium px-5 py-2.5 text-sm cursor-pointer whitespace-nowrap"
                          >
                            Send OTP
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handlePhoneVerify} className="space-y-4">
                        <div className="p-3 bg-[var(--accent-glow)] rounded-xl border border-[var(--accent)] text-xs text-[var(--text-primary)] mb-3">
                          Enter the 6-digit OTP code sent to <strong>{newPhone}</strong> (check your backend log file / console).
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={phoneOtp}
                            onChange={(e) => setPhoneOtp(e.target.value)}
                            placeholder="6-Digit OTP"
                            className="flex-1 px-4 py-2.5 glass-input text-sm text-center font-bold tracking-widest"
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={loading}
                              className="btn-premium px-5 py-2.5 text-sm cursor-pointer"
                            >
                              Verify & Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setPhoneStep('request')}
                              className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] hover:bg-white/5 text-sm text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: DEVICES */}
              {activeTab === 'devices' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-2xl font-bold font-heading mb-1 text-white">Active Device Sessions</h3>
                      <p className="text-sm text-[var(--text-secondary)]">Manage devices logged into your account.</p>
                    </div>
                    {sessions.length > 1 && (
                      <button
                        onClick={handleRevokeAllOthers}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Log Out Other Devices
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {sessions.map(sess => {
                      const isCurrent = sess.device_info && navigator.userAgent.includes(sess.device_info.split('/')[0])
                      return (
                        <div key={sess.id} className="glass-card p-4 flex justify-between items-center border border-[var(--border-color)]">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[var(--accent)]">
                              <Monitor className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-white">{sess.device_info || 'Unknown Browser/Device'}</span>
                                {isCurrent && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] font-semibold border border-[var(--accent)]/30">
                                    Current Device
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[var(--text-secondary)] space-y-0.5 mt-0.5">
                                <p>IP Address: {sess.ip_address || 'Unknown'}</p>
                                <p>Logged in: {new Date(sess.created_at + 'Z').toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                          {!isCurrent && (
                            <button
                              onClick={() => handleRevokeSession(sess.id)}
                              disabled={loading}
                              className="p-2 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 text-rose-400 transition-all cursor-pointer"
                              title="Revoke session"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {sessions.length === 0 && (
                      <p className="text-center py-8 text-[var(--text-secondary)] text-sm">No sessions loaded.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: MODERATION */}
              {activeTab === 'moderation' && (
                <div>
                  <h3 className="text-2xl font-bold font-heading mb-1 text-white">Blocked Connections</h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-6">Blocked users cannot send you friend requests or message you.</p>

                  <div className="space-y-3">
                    {blockedUsers.map(u => (
                      <div key={u.id} className="glass-card p-4 flex justify-between items-center border border-[var(--border-color)]">
                        <div className="flex items-center gap-3">
                          <img
                            src={u.profile?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80'}
                            alt={u.username}
                            className="w-10 h-10 rounded-full object-cover border border-white/10"
                          />
                          <div>
                            <span className="font-semibold text-sm text-white block">{u.profile?.full_name || u.username}</span>
                            <span className="text-xs text-[var(--text-secondary)]">@{u.username}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnblockUser(u.id)}
                          disabled={loading}
                          className="px-4 py-2 rounded-xl border border-[var(--border-color)] hover:bg-[var(--border-color)] text-white text-xs font-semibold transition-all cursor-pointer"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}

                    {blockedUsers.length === 0 && (
                      <div className="text-center py-12 glass-card border border-[var(--border-color)]">
                        <UserX className="w-8 h-8 mx-auto text-[var(--text-secondary)] opacity-50 mb-2" />
                        <p className="text-[var(--text-secondary)] text-sm">No blocked users found.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: E2EE */}
              {activeTab === 'e2ee' && (
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-2xl font-bold font-heading text-white">End-to-End Encryption (E2EE)</h3>
                    <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-6">
                    CONNECT-ON utilizes secure client-side cryptography. A secure keypair is generated directly on your browser using WebCrypto APIs. 
                    Your private key never leaves your local device, and is stored securely in your browser's IndexedDB. 
                    All messages are encrypted locally before broadcasting.
                  </p>

                  <div className="glass-card p-5 border border-indigo-500/20 bg-indigo-500/5 mb-6">
                    <div className="flex items-center gap-2.5 text-indigo-400 font-semibold mb-3">
                      <Shield className="w-5 h-5" />
                      <span className="text-sm font-heading uppercase tracking-wider">Your Cryptographic Public Key (X25519)</span>
                    </div>
                    {publicKey ? (
                      <div className="bg-black/40 rounded-xl p-3.5 border border-white/5 font-mono text-[10px] break-all select-all text-[var(--text-secondary)] max-h-32 overflow-y-auto">
                        {publicKey}
                      </div>
                    ) : (
                      <p className="text-xs text-rose-400 font-medium">No E2EE Key active. Please regenerate.</p>
                    )}
                  </div>

                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 items-start mb-6">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-300">
                      <p className="font-bold mb-1">Regenerating Keys Warning</p>
                      <p>
                        Regenerating your keys will overwrite your local private key. 
                        Messages encrypted prior to key regeneration will no longer be decodable on this device.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRegenerateKeys}
                    disabled={loading}
                    className="btn-premium px-6 py-3 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerate Cryptographic Keys
                  </button>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  )
}
