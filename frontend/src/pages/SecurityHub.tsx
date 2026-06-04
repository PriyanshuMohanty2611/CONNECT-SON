import { useState, useEffect } from 'react'
import { 
  ShieldCheck, Smartphone, Globe, Trash2, KeyRound, 
  Eye, EyeOff, AlertTriangle, CheckCircle, RefreshCw 
} from 'lucide-react'
import { api } from '../services/api'

interface UserSession {
  id: string
  device_info: string | null
  ip_address: string | null
  created_at: string
  expires_at: string
}

export default function SecurityHub() {
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [twoFaStatus, setTwoFaStatus] = useState<any>(null)
  
  // 2FA setups
  const [totpCode, setTotpCode] = useState('')
  const [twoFaMsg, setTwoFaMsg] = useState('')
  
  // PIN Chats
  const [chatPin, setChatPin] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')

  useEffect(() => {
    loadSessions()
    check2FaSetup()
  }, [])

  const loadSessions = async () => {
    setLoadingSessions(true)
    const { data } = await api.get<UserSession[]>('/security/sessions')
    setLoadingSessions(false)
    if (data) setSessions(data)
  }

  const check2FaSetup = async () => {
    const { data } = await api.post<any>('/security/2fa/setup')
    if (data) setTwoFaStatus(data)
  }

  const handleVerify2Fa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!totpCode.trim()) return
    const { data, error } = await api.post<any>('/security/2fa/verify', {
      code: totpCode.trim()
    })
    if (!error) {
      setTwoFaMsg('2FA has been successfully verified and enabled!')
      setTotpCode('')
      check2FaSetup()
    } else {
      setTwoFaMsg(`Error: ${error}`)
    }
  }

  const handleDisable2Fa = async () => {
    const code = prompt('Please enter your 2FA verification code to disable it:')
    if (!code) return
    const { error } = await api.post('/security/2fa/disable', { code })
    if (!error) {
      alert('2FA successfully disabled.')
      check2FaSetup()
    } else {
      alert(error)
    }
  }

  const handleRevokeSession = async (id: string) => {
    if (!window.confirm('Are you sure you want to log out this device remotely?')) return
    const { error } = await api.delete(`/security/sessions/${id}`)
    if (!error) {
      loadSessions()
    } else {
      alert(error)
    }
  }

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (chatPin.length !== 4 || !/^\d+$/.test(chatPin)) {
      setPinSuccess('PIN must be exactly 4 digits.')
      return
    }
    // We can test pin settings on any default mock chat or save user pin.
    // Call endpoint
    const { data: chats } = await api.get<any[]>('/chats/')
    if (!chats || chats.length === 0) {
      setPinSuccess('PIN chats requires an active secure chat session.')
      return
    }
    // Set PIN on first chat as test hidden trigger
    const firstChatId = chats[0].id
    const { error } = await api.post(`/security/chats/${firstChatId}/hide`, {
      pin: chatPin
    })
    if (!error) {
      setPinSuccess(`PIN configured. Chat with ${chats[0].participants[0]?.username} is now hidden!`)
      setChatPin('')
    } else {
      setPinSuccess(`Error: ${error}`)
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Header */}
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-[var(--accent)]" />
          Advanced Security
        </h2>
        <p className="text-[var(--text-secondary)] text-sm">Review active sessions, lock hidden chats, and configure two-factor authentication.</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto min-h-0 pr-1">
        
        {/* Left Side: 2FA & PIN chats */}
        <div className="space-y-6 flex flex-col">
          {/* Two-Factor Section */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[var(--accent)]" />
              Two-Factor Authentication (2FA)
            </h3>

            {twoFaStatus?.enabled ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <CheckCircle className="w-4 h-4" />
                  <span>2FA is active and protecting your account!</span>
                </div>
                <button 
                  onClick={handleDisable2Fa}
                  className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold cursor-pointer transition-all"
                >
                  Disable 2FA
                </button>
              </div>
            ) : twoFaStatus ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                  Two-factor authentication is not active. Scan the QR code or enter the secret key manually to enable.
                </div>

                <div className="flex items-start gap-4 flex-wrap md:flex-nowrap">
                  {/* QR Mock image */}
                  <div className="p-2 bg-white rounded-xl flex-shrink-0">
                    <img 
                      src={twoFaStatus.qr_code_mock} 
                      alt="QR Code" 
                      className="w-32 h-32"
                    />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase">SECRET KEY</span>
                    <code className="block bg-black/40 px-2 py-1.5 rounded text-xs font-bold text-white tracking-widest truncate select-all">
                      {twoFaStatus.secret}
                    </code>
                    <span className="text-[8px] text-[var(--text-secondary)] block pt-1">
                      Issuer: ConnectOn / Email: scan via Google Authenticator.
                    </span>
                  </div>
                </div>

                {/* Form verify */}
                <form onSubmit={handleVerify2Fa} className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter 6-digit TOTP (e.g. 123456)..."
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="flex-1 px-3 py-2.5 glass-input text-xs"
                    required
                  />
                  <button 
                    type="submit"
                    className="px-4 py-2.5 rounded-xl btn-premium text-xs font-bold cursor-pointer"
                  >
                    Activate
                  </button>
                </form>
                {twoFaMsg && (
                  <p className="text-[10px] text-indigo-300 font-bold">{twoFaMsg}</p>
                )}
              </div>
            ) : null}
          </div>

          {/* Hidden Chats PIN configuration */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-indigo-400" />
              Hidden Chats PIN
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">Set a 4-digit PIN to lock and hide confidential chats. PIN verify reveals folders.</p>

            <form onSubmit={handleSavePin} className="flex gap-2">
              <input 
                type="password" 
                maxLength={4}
                placeholder="4-digit PIN..."
                value={chatPin}
                onChange={(e) => setChatPin(e.target.value)}
                className="flex-1 px-3 py-2.5 glass-input text-xs tracking-widest text-center"
                required
              />
              <button 
                type="submit"
                className="px-4 py-2.5 rounded-xl btn-premium text-xs font-bold cursor-pointer"
              >
                Configure PIN
              </button>
            </form>
            {pinSuccess && (
              <p className="text-[10px] text-indigo-300 font-bold">{pinSuccess}</p>
            )}
          </div>
        </div>

        {/* Right Side: Logged sessions list */}
        <div className="glass-card p-6 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            <div className="flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[var(--accent)]" />
                Active Device Logs
              </h3>
              
              <button 
                onClick={loadSessions}
                className="p-1 rounded hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {loadingSessions ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">Syncing session logs...</div>
              ) : sessions.map((sess) => (
                <div 
                  key={sess.id}
                  className="p-4 bg-black/20 border border-[var(--border-color)] rounded-xl flex items-center justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <Smartphone className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-white truncate">
                        {sess.device_info || 'Unknown Browser/Device'}
                      </h5>
                      <div className="flex items-center gap-1 text-[9px] text-[var(--text-secondary)] mt-0.5">
                        <Globe className="w-3 h-3 text-[var(--accent)]" />
                        <span>IP: {sess.ip_address || 'Local IP'}</span>
                        <span className="opacity-40">|</span>
                        <span>Logged in: {new Date(sess.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleRevokeSession(sess.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 cursor-pointer flex-shrink-0"
                    title="Terminate Session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {sessions.length === 0 && !loadingSessions && (
                <div className="text-center py-20 text-xs text-[var(--text-secondary)]">No active sessions found.</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
