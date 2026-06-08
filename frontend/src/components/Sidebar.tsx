import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Compass, MessageSquare, Tv, Heart, Calendar, Gamepad2, 
  FileText, Activity, Cloud, ShieldCheck, Settings, 
  ShieldAlert, LogOut, Flame, Zap, Award, ChevronRight
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useNotifications } from '../context/NotificationContext'
import { api } from '../services/api'

export type ActiveTab = 
  | 'discovery' 
  | 'chats' 
  | 'stories' 
  | 'settings' 
  | 'admin' 
  | 'gaming' 
  | 'relationship' 
  | 'calendar' 
  | 'notes' 
  | 'productivity' 
  | 'cloud' 
  | 'security'

interface SidebarProps {
  activeTab: ActiveTab
  setActiveTab?: (tab: ActiveTab) => void
}

interface NavItem {
  id: ActiveTab
  label: string
  icon: React.ComponentType<any>
  color?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { onlineStatuses } = useSocket()
  const { unreadCount } = useNotifications()
  const [storiesCount, setStoriesCount] = useState(0)

  // Fetch stories count for the badge
  useEffect(() => {
    if (!user) return
    const fetchStories = async () => {
      const { data } = await api.get<any[]>('/stories/')
      if (data) {
        setStoriesCount(data.length)
      }
    }
    fetchStories()
    
    // Poll stories count every 30 seconds
    const interval = setInterval(fetchStories, 30000)
    return () => clearInterval(interval)
  }, [user])

  const handleNavClick = (tabId: ActiveTab) => {
    if (tabId === 'chats') {
      if (location.pathname !== '/chats') {
        navigate('/chats')
      } else if (setActiveTab) {
        setActiveTab('chats')
      }
    } else if (tabId === 'settings') {
      navigate('/settings')
    } else if (tabId === 'admin') {
      navigate('/admin')
    } else {
      // If we are not on the dashboard page, navigate to dashboard with active tab
      if (location.pathname !== '/') {
        navigate('/', { state: { tab: tabId } })
      } else if (setActiveTab) {
        setActiveTab(tabId)
      }
    }
  }

  // Navigation config with sections
  const navSections: NavSection[] = [
    {
      title: 'Social',
      items: [
        { id: 'discovery', label: 'Home Feed', icon: Compass },
        { id: 'chats', label: 'Secure Chats', icon: MessageSquare },
        { id: 'stories', label: 'Stories', icon: Tv }
      ]
    },
    {
      title: 'Lifestyle',
      items: [
        { id: 'relationship', label: 'Relationship Hub', icon: Heart, color: 'text-rose-500' },
        { id: 'calendar', label: 'Smart Calendar', icon: Calendar },
        { id: 'gaming', label: 'Gaming Hub', icon: Gamepad2 }
      ]
    },
    {
      title: 'Productivity',
      items: [
        { id: 'notes', label: 'Collaborative Notes', icon: FileText },
        { id: 'productivity', label: 'Productivity Hub', icon: Activity }
      ]
    },
    {
      title: 'Storage & Security',
      items: [
        { id: 'cloud', label: 'Personal Cloud', icon: Cloud },
        { id: 'security', label: 'Security Hub', icon: ShieldCheck }
      ]
    },
    {
      title: 'System',
      items: [
        { id: 'settings', label: 'Settings', icon: Settings }
      ]
    }
  ]

  // Add Admin Panel if user is admin
  if (user?.is_admin) {
    const systemSection = navSections.find(s => s.title === 'System')
    if (systemSection) {
      systemSection.items.push({ id: 'admin', label: 'Admin Panel', icon: ShieldAlert, color: 'text-rose-400' })
    }
  }

  // Helper to get status dot class
  const getStatusColor = (userId: string) => {
    const status = onlineStatuses[userId] || user?.profile?.presence_status || 'offline'
    switch (status) {
      case 'online': return 'bg-emerald-500 shadow-emerald-500/50'
      case 'away': return 'bg-amber-500 shadow-amber-500/50'
      case 'busy': return 'bg-red-500 shadow-red-500/50'
      default: return 'bg-slate-500 shadow-slate-500/50'
    }
  }

  // Computed XP metrics based on user info for premium look
  const streakCount = (user?.profile as any)?.streak || 7
  const xpLevel = Math.max(12, ((user?.username?.length || 5) * 2) + 2)
  const rankName = xpLevel > 20 ? 'Vanguard General' : xpLevel > 14 ? 'Elite Architect' : 'Strategic Mind'
  const currentXP = 450
  const nextLevelXP = 1000
  const xpPercentage = (currentXP / nextLevelXP) * 100

  // Sidebar container entrance animation
  const containerVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1] as any,
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 5 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as any } }
  }

  return (
    <motion.aside 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-72 h-full flex flex-col justify-between p-5 z-20 flex-shrink-0 relative overflow-hidden border-r border-[var(--border-color)] bg-[var(--bg-main)] select-none"
      style={{
        background: `
          radial-gradient(circle at 10% 10%, rgba(59, 130, 246, 0.08), transparent 45%),
          radial-gradient(circle at 90% 50%, rgba(236, 72, 153, 0.05), transparent 40%),
          radial-gradient(circle at 10% 90%, rgba(139, 92, 246, 0.05), transparent 45%),
          var(--bg-main)
        `
      }}
    >
      {/* Interactive Glowing Orbs Behind Glass (Drifting) */}
      <div className="absolute top-[-50px] left-[-50px] w-64 h-64 rounded-full bg-blue-500/10 blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute top-[40%] right-[-100px] w-80 h-80 rounded-full bg-pink-500/6 blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="absolute bottom-[-100px] left-[-50px] w-72 h-72 rounded-full bg-purple-500/8 blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="flex flex-col flex-1 overflow-y-auto pr-1 scrollbar-none space-y-6">
        
        {/* LOGO & BRAND */}
        <div className="flex items-center gap-3 px-2 py-1 cursor-pointer" onClick={() => handleNavClick('discovery')}>
          <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center shadow-lg shadow-blue-500/5 border border-[var(--border-color)] hover:brightness-110 transition-all duration-300 p-1.5">
            <img src="/logo.png" alt="CONNECT-SON" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-[var(--text-primary)] font-heading leading-none">CONNECT-SON</h1>
            <span className="text-[9px] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-pink-500 font-bold uppercase tracking-widest leading-none block mt-1">Feel Free To Connect</span>
          </div>
        </div>

        {/* SECTIONS */}
        <div className="space-y-5">
          {navSections.map((section, sIdx) => (
            <div key={section.title} className="space-y-1">
              <span className="text-[9px] font-bold tracking-widest text-[var(--text-secondary)]/50 uppercase px-4 block">
                {section.title}
              </span>
              
              <div className="space-y-[2px]">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full relative flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 cursor-pointer group ${
                        isActive 
                          ? 'text-[var(--text-primary)] font-bold' 
                          : 'text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {/* Active Background Slide Capsule (Linear / Apple Vision Pro Style) */}
                      {isActive && (
                        <motion.div 
                          layoutId="activeTabGlow"
                          className="absolute inset-0 bg-[var(--accent-glow)] border border-[var(--accent)]/15 rounded-xl shadow-inner pointer-events-none"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}

                      {/* Accent Line */}
                      {isActive && (
                        <motion.div 
                          layoutId="activeAccentLine"
                          className="absolute left-0 w-[3px] h-[55%] bg-[var(--accent)] rounded-r"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}

                      <div className="flex items-center gap-3.5 z-10 relative">
                        <Icon className={`w-4 h-4 stroke-[1.75] transition-transform duration-300 group-hover:scale-105 ${item.color || ''} ${
                          isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--accent)]'
                        }`} />
                        <span className="tracking-wide">{item.label}</span>
                      </div>

                      {/* DYNAMIC BADGES */}
                      <div className="z-10 relative flex items-center">
                        {item.id === 'chats' && unreadCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[8px] font-black tracking-wider shadow-sm animate-pulse">
                            {unreadCount}
                          </span>
                        )}

                        {item.id === 'stories' && storiesCount > 0 && (
                          <span className="w-2 h-2 rounded-full bg-gradient-to-tr from-pink-500 to-yellow-500 shadow-md shadow-pink-500/30 ring-2 ring-[var(--bg-main)]" />
                        )}

                        {item.id === 'gaming' && (
                          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-md text-[8px] font-bold text-emerald-400 tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>LIVE</span>
                          </div>
                        )}
                        
                        {!isActive && (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-4 mt-auto border-t border-[var(--border-color)] space-y-4 relative z-10">
        
        {/* PREMIUM STREAK COMPONENT */}
        <div className="glass-card p-3.5 rounded-2xl relative overflow-hidden group">
          {/* Progress background glow */}
          <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-orange-500/5 blur-xl group-hover:bg-orange-500/10 transition-all duration-500 pointer-events-none" />
          
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                <Flame className="w-4.5 h-4.5 animate-bounce" style={{ animationDuration: '2.5s' }} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest block">Streak</span>
                <span className="text-xs font-black text-[var(--text-primary)]">{streakCount} Day Streak</span>
              </div>
            </div>
            
            {/* Circular Progress Ring */}
            <div className="relative w-8 h-8">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="16" cy="16" r="12" className="stroke-[var(--border-color)] fill-transparent" strokeWidth="2.5" />
                <circle cx="16" cy="16" r="12" className="stroke-orange-500 fill-transparent" strokeWidth="2.5" 
                  strokeDasharray={`${2 * Math.PI * 12}`} 
                  strokeDashoffset={`${2 * Math.PI * 12 * (1 - 0.7)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-orange-400">70%</div>
            </div>
          </div>

          {/* Progress Tracker (Days) */}
          <div className="flex items-center justify-between gap-1 mt-3">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
              // Highlight completed days
              const isCompleted = idx < (streakCount % 7 || 7)
              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <div className={`w-5 py-0.5 rounded text-[8px] font-black text-center border transition-all ${
                    isCompleted 
                      ? 'bg-orange-500/20 border-orange-500/30 text-orange-400 shadow-md shadow-orange-500/10' 
                      : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-secondary)]/50'
                  }`}>
                    {day}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border-color)] mt-3 pt-2 text-[9px] font-bold">
            <span className="text-[var(--text-secondary)]">XP Earned Today</span>
            <span className="text-orange-400 font-extrabold">+320 XP This Week</span>
          </div>
        </div>

        {/* PROFILE COMPLETION METER */}
        <div className="glass-card p-3 rounded-2xl relative overflow-hidden group">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Profile Strength</span>
            <span className="text-[10px] font-black text-[var(--text-primary)]">92%</span>
          </div>
          <div className="h-1.5 w-full bg-[var(--bg-main)] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: '92%' }} />
          </div>
        </div>

        {/* IDENTITY USER CARD */}
        <motion.div 
          whileHover={{ scale: 1.01, rotateY: 1.5, rotateX: -1.5 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="glass-card p-3.5 rounded-2xl flex items-center justify-between relative group shadow-lg"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src={user?.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
                alt="Profile" 
                className="w-10.5 h-10.5 rounded-full object-cover border border-[var(--border-color)] shadow-md transition-transform duration-300 group-hover:scale-105"
              />
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--bg-main)] ${getStatusColor(user?.id || '')}`} />
            </div>
            
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-black truncate text-[var(--text-primary)] leading-tight">
                  {user?.profile?.full_name || user?.username}
                </h4>
                <div className="flex items-center gap-0.5 bg-blue-500/10 border border-blue-500/20 px-1 rounded text-[7px] font-black text-blue-400 uppercase">
                  Lvl {xpLevel}
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] truncate">@{user?.username}</p>
              
              {/* Rank text */}
              <div className="flex items-center gap-1 mt-1 text-[8px] font-bold text-slate-400 group-hover:text-blue-400 transition-colors">
                <Award className="w-2.5 h-2.5 text-blue-500" />
                <span>{rankName}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={logout}
            className="p-2 rounded-xl border border-[var(--border-color)] hover:bg-rose-500/10 hover:border-rose-500/20 text-slate-500 hover:text-rose-500 transition-all cursor-pointer flex items-center justify-center"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </motion.div>

      </div>
    </motion.aside>
  )
}
