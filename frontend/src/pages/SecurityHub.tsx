import { useState, useEffect } from 'react'
import { 
  ShieldCheck, Smartphone, Globe, Trash2, KeyRound, 
  EyeOff, AlertTriangle, CheckCircle, RefreshCw, 
  Monitor, Terminal, Shield, ShieldAlert, Activity
} from 'lucide-react'
import { api } from '../services/api'

interface UserSession {
  id: string
  device_info: string | null
  ip_address: string | null
  created_at: string
  expires_at: string
  is_current?: boolean
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

  // Simulated Audit Logs
  const [auditLogs, setAuditLogs] = useState<{ id: string; action: string; time: string; ip: string; status: 'success' | 'warning' }[]>([
    { id: '1', action: 'Device session list fetched', time: 'Just now', ip: '127.0.0.1', status: 'success' },
  ])

  useEffect(() => {
    loadSessions()
    check2FaSetup()
  }, [])

  const loadSessions = async () => {
    setLoadingSessions(true)
    const { data } = await api.get<UserSession[]>('/security/sessions')
    setLoadingSessions(false)
    if (data) {
      setSessions(data)
      // Log local audit event
      addAuditLog('Active sessions synchronized', 'success')
    }
  }

  const check2FaSetup = async () => {
    const { data } = await api.post<any>('/security/2fa/setup')
    if (data) setTwoFaStatus(data)
  }

  const addAuditLog = (action: string, status: 'success' | 'warning' = 'success') => {
    const newLog = {
      id: Math.random().toString(),
      action,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ip: sessions[0]?.ip_address || '127.0.0.1',
      status
    }
    setAuditLogs(prev => [newLog, ...prev.slice(0, 4)])
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
      addAuditLog('Two-Factor Authentication activated', 'success')
    } else {
      setTwoFaMsg(`Error: ${error}`)
      addAuditLog('Failed 2FA activation attempt', 'warning')
    }
  }

  const handleDisable2Fa = async () => {
    const code = prompt('Please enter your 2FA verification code to disable it:')
    if (!code) return
    const { error } = await api.post('/security/2fa/disable', { code })
    if (!error) {
      alert('2FA successfully disabled.')
      check2FaSetup()
      addAuditLog('Two-Factor Authentication disabled', 'warning')
    } else {
      alert(error)
    }
  }

  const handleRevokeSession = async (id: string) => {
    if (!window.confirm('Are you sure you want to log out this device remotely?')) return
    const { error } = await api.delete(`/security/sessions/${id}`)
    if (!error) {
      loadSessions()
      addAuditLog('Remote device session terminated', 'warning')
    } else {
      alert(error)
    }
  }

  const handleRevokeAllOthers = async () => {
    if (!window.confirm('Are you sure you want to log out all other devices remotely?')) return
    const { error } = await api.post('/security/sessions/revoke-all', {})
    if (!error) {
      alert('All other sessions revoked successfully.')
      loadSessions()
      addAuditLog('All remote sessions terminated', 'warning')
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
    const { data: chats } = await api.get<any[]>('/chats/')
    if (!chats || chats.length === 0) {
      setPinSuccess('PIN chats requires an active secure chat session.')
      return
    }
    const firstChatId = chats[0].id
    const { error } = await api.post(`/security/chats/${firstChatId}/hide`, {
      pin: chatPin
    })
    if (!error) {
      setPinSuccess(`PIN configured. Chat with ${chats[0].participants[0]?.username || 'partner'} is now hidden!`)
      localStorage.setItem('chat_pin_configured', 'true')
      setChatPin('')
      addAuditLog('Chat hidden behind PIN code', 'success')
    } else {
      setPinSuccess(`Error: ${error}`)
    }
  }

  // Calculate Security Score
  const has2Fa = twoFaStatus?.enabled
  const hasPin = localStorage.getItem('chat_pin_configured') === 'true'
  const securityScore = 20 + (has2Fa ? 40 : 0) + (hasPin ? 40 : 0)

  const getDeviceIcon = (deviceInfo: string | null) => {
    if (!deviceInfo) return <Smartphone className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0 animate-pulse" />;
    const info = deviceInfo.toLowerCase();
    if (info.includes('windows')) return <Monitor className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />;
    if (info.includes('macintosh') || info.includes('mac os')) return <Monitor className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0" />;
    if (info.includes('android')) return <Smartphone className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />;
    if (info.includes('iphone') || info.includes('ipad')) return <Smartphone className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />;
    if (info.includes('linux')) return <Terminal className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />;
    return <Smartphone className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />;
  };

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
            <ShieldCheck className="w-8 h-8 text-[var(--accent)] drop-shadow-[0_0_10px_rgba(0,102,255,0.5)]" />
            Advanced Security Hub
          </h2>
          <p className="text-[var(--text-secondary)] text-xs mt-1">Review active sessions, lock private chats, and toggle hardware security elements.</p>
        </div>
        
        {/* Dynamic Badge */}
        <div className={`px-3.5 py-1.5 rounded-full border text-[10px] font-black tracking-widest uppercase flex items-center gap-2 ${
          securityScore === 100 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : securityScore >= 60 
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <Shield className="w-3.5 h-3.5" />
          <span>{securityScore === 100 ? 'Enterprise Grade' : 'Vulnerable'}</span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto min-h-0 pr-1">
        
        {/* Left Side: Score card, 2FA, PIN Chats */}
        <div className="space-y-6 flex flex-col">
          
          {/* Security Score Widget */}
          <div className="glass-card p-6 relative overflow-hidden flex items-center gap-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-5 blur-[40px] rounded-full pointer-events-none" />
            
            {/* Circular Progress (Using standard Tailwind / CSS properties) */}
            <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle 
                  cx="50" cy="50" r="40" 
                  stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="transparent" 
                />
                <circle 
                  cx="50" cy="50" r="40" 
                  stroke="url(#securityScoreGradient)" strokeWidth="8" fill="transparent" 
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - securityScore / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient id="securityScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0066ff" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-xl font-black text-white">{securityScore}%</span>
                <span className="text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Score</span>
              </div>
            </div>

            <div className="flex-1 space-y-1.5">
              <h4 className="text-sm font-extrabold text-white">Security Health Index</h4>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {securityScore === 100 
                  ? 'Your account protection is at its maximum peak. You are fully hardened against remote session hijacking.' 
                  : 'You have outstanding security tasks. Enable Two-Factor verification and hidden PINs to reach 100% protection.'}
              </p>
            </div>
          </div>

          {/* Two-Factor Section */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2.5">
              <KeyRound className="w-5 h-5 text-[var(--accent)]" />
              Two-Factor Authentication (2FA)
            </h3>

            {twoFaStatus?.enabled ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-bold text-white">TOTP Authentication Active</h5>
                    <p className="text-[10px] text-[var(--text-secondary)]">Google Authenticator protection is actively verified.</p>
                  </div>
                </div>
                <button 
                  onClick={handleDisable2Fa}
                  className="px-3.5 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all duration-200 border border-rose-500/20"
                >
                  Disable
                </button>
              </div>
            ) : twoFaStatus ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-amber-300 leading-relaxed">
                    Two-factor protection is currently inactive. Scan the code below with your Google Authenticator/Authy app.
                  </span>
                </div>

                <div className="flex items-center gap-5 bg-black/25 p-4 rounded-xl border border-white/5">
                  {/* QR Image */}
                  <div className="p-1.5 bg-white rounded-lg flex-shrink-0">
                    <img 
                      src={twoFaStatus.qr_code_mock} 
                      alt="QR Code" 
                      className="w-24 h-24"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="space-y-0.5">
                      <span className="text-[8px] text-[var(--text-secondary)] font-black uppercase tracking-wider">Secret Configuration Token</span>
                      <code className="block bg-black/40 px-2.5 py-2 rounded-lg text-xs font-bold text-white tracking-widest truncate select-all border border-white/5">
                        {twoFaStatus.secret}
                      </code>
                    </div>
                    <span className="text-[8px] text-[var(--text-secondary)] block">
                      Scan code or manually configure token on your vault application.
                    </span>
                  </div>
                </div>

                {/* Form verify */}
                <form onSubmit={handleVerify2Fa} className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter 6-digit TOTP code (e.g. 123456)..."
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="flex-1 px-4 py-2.5 glass-input text-xs font-bold"
                    maxLength={6}
                    required
                  />
                  <button 
                    type="submit"
                    className="px-5 py-2.5 rounded-xl btn-premium text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    Activate
                  </button>
                </form>
                {twoFaMsg && (
                  <p className="text-[10px] text-indigo-300 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    {twoFaMsg}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* Hidden Chats PIN configuration */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2.5">
              <EyeOff className="w-5 h-5 text-indigo-400" />
              Secure Chats PIN Lock
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Lock and mask specific chat rooms behind a unique 4-digit PIN. To reveal masked messages, input your PIN on the chats pane.
            </p>

            <form onSubmit={handleSavePin} className="flex gap-2">
              <input 
                type="password" 
                maxLength={4}
                placeholder="4-digit PIN (e.g. 8844)..."
                value={chatPin}
                onChange={(e) => setChatPin(e.target.value)}
                className="flex-1 px-4 py-2.5 glass-input text-xs tracking-widest text-center font-bold"
                required
              />
              <button 
                type="submit"
                className="px-5 py-2.5 rounded-xl btn-premium text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Set PIN
              </button>
            </form>
            {pinSuccess && (
              <p className="text-[10px] text-indigo-300 font-bold flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                {pinSuccess}
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Logged sessions list & Audit Logs */}
        <div className="space-y-6 flex flex-col min-h-0">
          
          {/* Active Device logs */}
          <div className="glass-card p-6 flex flex-col overflow-hidden h-[360px]">
            <div className="flex items-center justify-between flex-shrink-0 border-b border-white/5 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2.5">
                  <Smartphone className="w-5 h-5 text-[var(--accent)]" />
                  Active Sessions Registry
                </h3>
                <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">
                  {sessions.length} Authorized Devices
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {sessions.length > 1 && (
                  <button 
                    onClick={handleRevokeAllOthers}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all duration-150"
                  >
                    Logout Others
                  </button>
                )}
                <button 
                  onClick={loadSessions}
                  className="p-2 rounded-lg hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer border border-white/5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 mt-3.5">
              {loadingSessions ? (
                <div className="py-20 text-center text-xs text-[var(--text-secondary)] flex flex-col items-center gap-2 justify-center">
                  <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)]" />
                  <span>Syncing session details...</span>
                </div>
              ) : sessions.map((sess) => (
                <div 
                  key={sess.id}
                  className={`p-4 bg-black/25 border rounded-xl flex items-center justify-between transition-all ${
                    sess.is_current ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {getDeviceIcon(sess.device_info)}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="text-xs font-bold text-white truncate max-w-[150px] sm:max-w-[200px]">
                          {sess.device_info || 'Unknown Browser/Device'}
                        </h5>
                        {sess.is_current && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[8px] font-black uppercase tracking-wider text-[var(--accent)]">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-secondary)] flex-wrap">
                        <Globe className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>IP: {sess.ip_address || 'Local IP'}</span>
                        <span className="opacity-40">|</span>
                        <span>Logged: {new Date(sess.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {!sess.is_current && (
                    <button 
                      onClick={() => handleRevokeSession(sess.id)}
                      className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-400 hover:text-rose-500 cursor-pointer border border-transparent hover:border-rose-500/20 transition-all flex-shrink-0"
                      title="Terminate Session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {sessions.length === 0 && !loadingSessions && (
                <div className="text-center py-24 text-xs text-[var(--text-secondary)]">No active sessions found.</div>
              )}
            </div>
          </div>

          {/* Audit Logs */}
          <div className="glass-card p-6 flex flex-col overflow-hidden flex-1 min-h-[200px]">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2.5 border-b border-white/5 pb-3 flex-shrink-0">
              <Activity className="w-5 h-5 text-indigo-400" />
              Security Audit Stream
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 mt-3.5 pr-1">
              {auditLogs.map((log) => (
                <div 
                  key={log.id}
                  className="flex items-start justify-between text-xs py-1.5 border-b border-white/5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        log.status === 'success' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]'
                      }`} />
                      <span className="text-white font-semibold">{log.action}</span>
                    </div>
                    <div className="text-[9px] text-[var(--text-secondary)] flex items-center gap-2 ml-3.5">
                      <span>IP: {log.ip}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{log.time}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
