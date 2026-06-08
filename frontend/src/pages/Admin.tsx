import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FileText, Download, CheckCircle2, 
  AlertTriangle, ArrowLeft, RefreshCw, Search,
  Check, AlertCircle, ShieldAlert, Database, Users, Power
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { adminApi, API_HOST_URL } from '../services/api'
import type { AdminReport, AdminAuditLog, AdminBackup, AdminUser } from '../services/api'

type TabType = 'reports' | 'logs' | 'backups' | 'users'

export default function Admin() {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [activeTab, setActiveTab] = useState<TabType>('reports')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Data states
  const [reports, setReports] = useState<AdminReport[]>([])
  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [backups, setBackups] = useState<AdminBackup[]>([])
  const [usersList, setUsersList] = useState<AdminUser[]>([])

  // Enforce admin permission
  useEffect(() => {
    if (!user) {
      navigate('/login')
    } else if (!user.is_admin) {
      navigate('/')
    }
  }, [user, navigate])

  // Fetch data depending on active tab
  useEffect(() => {
    if (!user || !user.is_admin) return
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      if (activeTab === 'reports') {
        const { data, error } = await adminApi.getReports()
        if (data) setReports(data)
        if (error) showNotification('error', error)
      } else if (activeTab === 'logs') {
        const { data, error } = await adminApi.getAuditLogs()
        if (data) setLogs(data)
        if (error) showNotification('error', error)
      } else if (activeTab === 'backups') {
        const { data, error } = await adminApi.getBackups()
        if (data) setBackups(data)
        if (error) showNotification('error', error)
      } else if (activeTab === 'users') {
        const { data, error } = await adminApi.getUsers()
        if (data) setUsersList(data)
        if (error) showNotification('error', error)
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const showNotification = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMsg(message)
      setTimeout(() => setSuccessMsg(null), 3000)
    } else {
      setErrorMsg(message)
      setTimeout(() => setErrorMsg(null), 3500)
    }
  }

  // Action handlers
  const handleReportAction = async (reportId: string, action: 'resolve' | 'dismiss', suspendUser: boolean) => {
    setLoading(true)
    const { error } = await adminApi.actionReport(reportId, action, suspendUser)
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else {
      showNotification('success', `Report successfully ${action === 'resolve' ? 'resolved' : 'dismissed'}.`)
      loadData()
    }
  }

  const handleToggleUser = async (userId: string) => {
    setLoading(true)
    const { data, error } = await adminApi.toggleUserStatus(userId)
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else if (data) {
      showNotification('success', data.message)
      loadData()
    }
  }

  const handleTriggerBackup = async () => {
    setLoading(true)
    const { data, error } = await adminApi.triggerBackup()
    setLoading(false)
    if (error) {
      showNotification('error', error)
    } else if (data) {
      showNotification('success', 'Database backup triggered successfully!')
      loadData()
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Search filter
  const filteredUsers = usersList.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredLogs = logs.filter(l => 
    l.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.action.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-transparent py-10 px-4 md:px-8 relative overflow-hidden">
      {/* Glow backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-rose-500 opacity-10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--accent)] opacity-5 blur-[120px] pointer-events-none" />

      {/* Toast Notification */}
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

      <div className="max-w-6xl w-full glass-panel overflow-hidden flex flex-col md:flex-row h-[85vh] shadow-2xl z-10">
        
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[var(--border-color)] bg-black/10 flex flex-col p-4">
          <div className="flex items-center gap-3 mb-6 px-2">
            <button 
              onClick={() => navigate('/settings')}
              className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div>
              <h2 className="font-heading font-bold text-lg text-rose-400 flex items-center gap-1.5">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                Admin Panel
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">CONNECT-ON Manager</p>
            </div>
          </div>

          <nav className="space-y-1.5 flex-1">
            {[
              { id: 'reports', label: 'Moderation Reports', icon: AlertTriangle },
              { id: 'logs', label: 'Security Audit Logs', icon: FileText },
              { id: 'backups', label: 'Database Backups', icon: Database },
              { id: 'users', label: 'User Directory', icon: Users }
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType)
                    setSearchQuery('')
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
                    activeTab === tab.id 
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                      : 'text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-white'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="pt-4 border-t border-[var(--border-color)] mt-auto flex items-center justify-between px-2 text-xs text-[var(--text-secondary)]">
            <span>Server: Online</span>
            <button onClick={loadData} className="p-1 hover:text-white transition-all cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-10 overflow-y-auto bg-black/5 flex flex-col h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col h-full"
            >
              {/* Header Title */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold font-heading text-white">
                    {activeTab === 'reports' && 'Moderation Reports'}
                    {activeTab === 'logs' && 'Security Audit Logs'}
                    {activeTab === 'backups' && 'System Database Backups'}
                    {activeTab === 'users' && 'User Accounts Directory'}
                  </h1>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {activeTab === 'reports' && 'Manage flags and reports raised by users.'}
                    {activeTab === 'logs' && 'Track user access events, password changes, and admin audits.'}
                    {activeTab === 'backups' && 'Create and download SQLite database backup snapshots.'}
                    {activeTab === 'users' && 'Verify and manage accounts, suspend malicious users.'}
                  </p>
                </div>
                
                {activeTab === 'backups' && (
                  <button
                    onClick={handleTriggerBackup}
                    disabled={loading}
                    className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-800 text-white font-medium px-4 py-2.5 rounded-xl shadow-lg transition-all text-sm cursor-pointer"
                  >
                    <Database className="w-4 h-4" />
                    <span>Run DB Backup</span>
                  </button>
                )}
              </div>

              {/* Search Bar for searchable lists */}
              {(activeTab === 'users' || activeTab === 'logs') && (
                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={activeTab === 'users' ? 'Search users by username or email...' : 'Search logs by username or action...'}
                    className="w-full bg-black/35 border border-[var(--border-color)] focus:border-rose-500/50 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white focus:outline-none transition-all"
                  />
                </div>
              )}

              {/* LISTS DISPLAY */}
              <div className="flex-1 overflow-y-auto">
                {loading && (
                  <div className="h-48 w-full flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-rose-400 animate-spin" />
                  </div>
                )}

                {!loading && (
                  <>
                    {/* TAB: REPORTS */}
                    {activeTab === 'reports' && (
                      reports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[var(--border-color)] rounded-2xl">
                          <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
                          <h3 className="font-heading font-bold text-lg text-white">No Pending Reports</h3>
                          <p className="text-sm text-[var(--text-secondary)]">Outstanding user reports are clear!</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {reports.map((report) => (
                            <div key={report.id} className="p-5 border border-[var(--border-color)] rounded-2xl bg-black/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                    Report #{report.id.substring(0, 8)}
                                  </span>
                                  <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                    report.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    report.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                  }`}>
                                    {report.status}
                                  </span>
                                </div>
                                <p className="text-sm text-white pt-1">
                                  Reporter: <strong className="text-rose-400">@{report.reporter_username}</strong> reported <strong className="text-white">@{report.reported_username}</strong>
                                </p>
                                <p className="text-sm text-[var(--text-secondary)] italic">
                                  Reason: "{report.reason}"
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  Logged: {formatDate(report.created_at)}
                                </p>
                              </div>

                              {report.status === 'pending' && (
                                <div className="flex items-center gap-2 self-end md:self-auto">
                                  <button
                                    onClick={() => handleReportAction(report.id, 'dismiss', false)}
                                    className="p-2 border border-[var(--border-color)] hover:bg-[var(--border-color)] rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer"
                                  >
                                    Dismiss
                                  </button>
                                  <button
                                    onClick={() => handleReportAction(report.id, 'resolve', false)}
                                    className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/25 rounded-xl text-xs font-medium text-emerald-400 transition-all cursor-pointer"
                                  >
                                    Resolve
                                  </button>
                                  <button
                                    onClick={() => handleReportAction(report.id, 'resolve', true)}
                                    className="px-3 py-2 bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/35 rounded-xl text-xs font-medium text-rose-400 transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>Suspend User</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    {/* TAB: AUDIT LOGS */}
                    {activeTab === 'logs' && (
                      filteredLogs.length === 0 ? (
                        <p className="text-center text-[var(--text-secondary)]">No matching audit logs found.</p>
                      ) : (
                        <div className="border border-[var(--border-color)] rounded-2xl overflow-hidden bg-black/15">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border-color)] bg-black/30 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                                <th className="p-4">Timestamp</th>
                                <th className="p-4">User</th>
                                <th className="p-4">Action</th>
                                <th className="p-4">IP Address</th>
                                <th className="p-4">Device</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)] text-sm">
                              {filteredLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                  <td className="p-4 text-[var(--text-secondary)] whitespace-nowrap">
                                    {formatDate(log.created_at)}
                                  </td>
                                  <td className="p-4 font-bold text-white">
                                    @{log.username}
                                  </td>
                                  <td className="p-4 text-rose-400 font-mono text-xs">
                                    {log.action}
                                  </td>
                                  <td className="p-4 text-[var(--text-secondary)] text-xs">
                                    {log.ip_address || '-'}
                                  </td>
                                  <td className="p-4 text-[var(--text-secondary)] text-xs truncate max-w-[150px]" title={log.device_info || ''}>
                                    {log.device_info || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}

                    {/* TAB: BACKUPS */}
                    {activeTab === 'backups' && (
                      backups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[var(--border-color)] rounded-2xl">
                          <Database className="w-12 h-12 text-[var(--text-secondary)] mb-3" />
                          <h3 className="font-heading font-bold text-lg text-white">No Backups Found</h3>
                          <p className="text-sm text-[var(--text-secondary)]">Create a snapshot to display backups list.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {backups.map((backup) => (
                            <div key={backup.filename} className="p-5 border border-[var(--border-color)] rounded-2xl bg-black/25 flex items-center justify-between">
                              <div className="space-y-1 overflow-hidden pr-2">
                                <h3 className="font-heading font-semibold text-white truncate text-sm" title={backup.filename}>
                                  {backup.filename}
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)] flex gap-2">
                                  <span>{formatBytes(backup.file_size)}</span>
                                  <span>•</span>
                                  <span>{formatDate(backup.created_at)}</span>
                                </p>
                              </div>
                              <a
                                href={`${API_HOST_URL}${backup.download_url}`}
                                download
                                className="p-3 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-all cursor-pointer shrink-0"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    {/* TAB: USER DIRECTORY */}
                    {activeTab === 'users' && (
                      filteredUsers.length === 0 ? (
                        <p className="text-center text-[var(--text-secondary)]">No matching users found.</p>
                      ) : (
                        <div className="border border-[var(--border-color)] rounded-2xl overflow-hidden bg-black/15">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border-color)] bg-black/30 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                                <th className="p-4">Username</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Moderation</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)] text-sm">
                              {filteredUsers.map((u) => (
                                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                  <td className="p-4 font-bold text-white">
                                    @{u.username}
                                  </td>
                                  <td className="p-4 text-[var(--text-secondary)]">
                                    {u.email}
                                  </td>
                                  <td className="p-4">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                      u.is_admin ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                    }`}>
                                      {u.is_admin ? 'Admin' : 'User'}
                                    </span>
                                  </td>
                                  <td className="p-4">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                      u.is_verified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    }`}>
                                      {u.is_verified ? 'Active / Verified' : 'Suspended / Unverified'}
                                    </span>
                                  </td>
                                  <td className="p-4 text-right">
                                    {u.id !== user?.id && (
                                      <button
                                        onClick={() => handleToggleUser(u.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                                          u.is_verified
                                            ? 'bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20 text-rose-400'
                                            : 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400'
                                        }`}
                                      >
                                        {u.is_verified ? 'Suspend' : 'Activate'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  )
}
