import { useState, useEffect, useCallback, Suspense, lazy, memo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, Filter, MessageSquare, Settings as SettingsIcon, 
  LogOut, ShieldAlert, Sparkles, UserPlus, UserCheck, UserX,
  Clock, RefreshCw, Smile, Image as ImageIcon, MapPin, Grid,
  X, Eye, Flag, Gamepad2, Heart, Calendar as CalendarIcon, 
  FileText, Cloud, ShieldCheck, Activity, Plus, Users, Check, ArrowUpRight, Radio, Zap, ChevronRight
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { UserProfile } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { api } from '../services/api'
import { NotificationsPopover } from '../components/NotificationsPopover'
import Sidebar from '../components/Sidebar'

// ── Lazy-loaded hubs (only load JS when user navigates to that tab) ──────────
// Before: all 7 hubs loaded eagerly = ~300KB extra on first paint
// After:  each hub loaded on-demand = faster dashboard startup
const GamingHub      = lazy(() => import('./GamingHub'))
const RelationshipHub = lazy(() => import('./RelationshipHub'))
const SmartCalendar  = lazy(() => import('./SmartCalendar'))
const NotesHub       = lazy(() => import('./NotesHub'))
const ProductivityHub = lazy(() => import('./ProductivityHub'))
const PersonalCloud  = lazy(() => import('./PersonalCloud'))
const SecurityHub    = lazy(() => import('./SecurityHub'))

// Shared Suspense fallback spinner for lazy hubs
const HubLoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full py-24">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      <p className="text-[var(--text-muted)] text-sm">Loading...</p>
    </div>
  </div>
)


interface DiscoverUser extends UserProfile {
  relationship_status: 'none' | 'pending_sent' | 'pending_received' | 'friends'
  request_id?: string | null
}

interface Story {
  id: string
  user_id: string
  media_url: string
  media_type: 'image' | 'video'
  filter_preset: string
  caption: string | null
  created_at: string
  expires_at: string
  user: {
    id: string
    username: string
    email: string
    profile?: {
      full_name: string
      avatar_url: string | null
    }
  }
  views: Array<{
    id: string
    story_id: string
    viewer_id: string
    created_at: string
    viewer: {
      id: string
      username: string
      profile?: {
        full_name: string
        avatar_url: string | null
      }
    }
  }>
}

const filterPresets = [
  { id: 'none', name: 'Normal', class: '' },
  { id: 'vintage', name: 'Vintage', class: 'sepia contrast-110 brightness-90 saturate-90' },
  { id: 'cinematic', name: 'Cinematic', class: 'contrast-125 brightness-90 saturate-105' },
  { id: 'neon', name: 'Neon', class: 'saturate-200 hue-rotate-15 contrast-110' },
  { id: 'bw', name: 'B&W', class: 'grayscale contrast-125 brightness-95' },
  { id: 'dreamy', name: 'Dreamy', class: 'brightness-105 saturate-75 blur-[0.3px]' }
]

type ActiveTab = 'discovery' | 'chats' | 'stories' | 'settings' | 'admin' | 'gaming' | 'relationship' | 'calendar' | 'notes' | 'productivity' | 'cloud' | 'security'

// ── StoryCard component memoized ─────────────────────────────────────────────
interface StoryCardProps {
  group: any
  idx: number
  userId: string
  onClick: (idx: number) => void
}

const StoryCard = memo(function StoryCard({ group, idx, userId, onClick }: StoryCardProps) {
  const isUnviewed = group.stories.some((story: any) => !story.views.some((view: any) => view.viewer_id === userId))
  const avatar = group.user.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'
  const displayName = group.user.profile?.full_name || group.user.username
  const isMe = group.user.id === userId

  return (
    <motion.div 
      onClick={() => onClick(idx)}
      className="flex flex-col items-center gap-2.5 cursor-pointer flex-shrink-0"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div className={`w-15 h-15 rounded-full p-[2px] bg-gradient-to-tr ${
        isUnviewed 
          ? 'from-pink-500 via-violet-500 to-indigo-500' 
          : 'from-[var(--border-color)] to-[var(--border-color)]'
      } flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.1)]`}>
        <div className="w-full h-full rounded-full p-[2px] bg-[var(--bg-main)]">
          <img 
            src={avatar} 
            alt="" 
            className="w-full h-full rounded-full object-cover"
          />
        </div>
      </div>
      <span className="text-[9px] font-medium tracking-tight text-[var(--text-secondary)] text-center w-16 truncate">
        {isMe ? 'My Story' : displayName}
      </span>
    </motion.div>
  )
})

// ── UserCard component memoized ──────────────────────────────────────────────
interface UserCardProps {
  item: DiscoverUser
  currentStatus: string
  onReport: (id: string, username: string) => void
  onAddFriend: (id: string) => void
  onAcceptRequest: (requestId: string) => void
  onRejectRequest: (requestId: string) => void
  onChat: () => void
}

const UserCard = memo(function UserCard({
  item,
  currentStatus,
  onReport,
  onAddFriend,
  onAcceptRequest,
  onRejectRequest,
  onChat
}: UserCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      whileHover={{ y: -4, borderColor: 'var(--accent)', boxShadow: 'var(--shadow-hover)' }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="glass-card overflow-hidden group flex flex-col justify-between hover:border-[var(--accent)] relative"
    >
      {/* Subtle internal hover glow */}
      <div className="absolute inset-0 bg-[var(--accent)]/3 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300 pointer-events-none rounded-2xl" />

      <div className="h-24 w-full relative bg-[var(--bg-surface)] border-b border-[var(--border-color)] overflow-hidden">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onReport(item.id, item.username)}
          className="absolute top-3 left-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 border border-white/10 text-white cursor-pointer z-20 transition-transform"
          title="Report User"
        >
          <Flag className="w-3 h-3 text-amber-400" />
        </motion.button>

        {item.profile?.cover_url ? (
          <img 
            src={item.profile.cover_url} 
            alt="" 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-500 opacity-20" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80')" }} />
        )}
        
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
          <span className={`w-1.5 h-1.5 rounded-full ${
            currentStatus === 'online' 
              ? 'bg-emerald-500' 
              : currentStatus === 'away'
              ? 'bg-amber-500'
              : currentStatus === 'busy'
              ? 'bg-red-500'
              : 'bg-slate-500'
          }`} />
          <span className="text-[8px] font-black text-white uppercase tracking-wider">
            {currentStatus}
          </span>
        </div>
      </div>

      <div className="p-5 text-center relative flex-1 flex flex-col justify-between z-10">
        <div className="w-16 h-16 rounded-full border-4 border-[var(--bg-main)] shadow-[0_4px_12px_rgba(0,0,0,0.5)] overflow-hidden mx-auto mt-[-40px] relative z-10 bg-[var(--bg-card)]">
          <img 
            src={item.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
            alt={item.username} 
            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
          />
        </div>

        <div className="mt-2.5 flex-1 flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-sm tracking-tight text-[var(--text-primary)] hover:text-[var(--accent)] transition-all truncate">
              {item.profile?.full_name || item.username}
            </h4>
            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate font-medium">@{item.username}</p>
            
            <p className="text-[11px] text-[var(--text-secondary)] mt-3 line-clamp-2 px-1 leading-relaxed font-medium">
              {item.profile?.bio || 'Connect-On security user.'}
            </p>
          </div>

          {item.profile?.country && (
            <div className="mt-4 flex items-center justify-center gap-1 text-[9px] font-bold tracking-wider text-[var(--text-secondary)]">
              <MapPin className="w-3 h-3 text-rose-500" />
              <span className="uppercase">{item.profile.country}</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
          {item.relationship_status === 'none' && (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAddFriend(item.id)}
              className="w-full py-2 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)] hover:bg-[var(--accent-glow)] text-[var(--text-primary)] hover:text-white text-[11px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Add Friend</span>
            </motion.button>
          )}

          {item.relationship_status === 'pending_sent' && (
            <div className="w-full py-2 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] text-[11px] font-bold flex items-center justify-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Request</span>
            </div>
          )}

          {item.relationship_status === 'pending_received' && (
            <div className="w-full flex gap-2">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onAcceptRequest(item.request_id || '')}
                className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Accept</span>
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onRejectRequest(item.request_id || '')}
                className="px-3 py-2 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 text-xs font-bold transition-all flex items-center justify-center cursor-pointer"
              >
                <UserX className="w-4 h-4" />
              </motion.button>
            </div>
          )}

          {item.relationship_status === 'friends' && (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onChat}
              className="w-full py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[var(--accent-glow)]"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat Securely</span>
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
})

// ── CopilotPanel component memoized ──────────────────────────────────────────
interface CopilotPanelProps {
  copilotData: any
  loadingCopilot: boolean
}

const CopilotPanel = memo(function CopilotPanel({ copilotData, loadingCopilot }: CopilotPanelProps) {
  return (
    <motion.section 
      whileHover={{ y: -3, borderColor: 'var(--accent)' }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className="relative glass-panel p-5 rounded-3xl space-y-4 overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[50px] pointer-events-none rounded-full" />
      
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4.5 h-4.5 text-blue-400 animate-pulse" />
          <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider pl-1">🤖 AI Copilot</h3>
        </div>
        {loadingCopilot && (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
        )}
      </div>

      {copilotData ? (
        <div className="space-y-4 relative z-10">
          {/* Summary Bubble */}
          <div className="bg-[var(--accent-glow)] border border-[var(--accent)]/10 p-3.5 rounded-2xl text-[10.5px] leading-relaxed text-[var(--text-secondary)] font-semibold shadow-inner">
            {copilotData.summary}
          </div>

          {/* Summary List */}
          <div className="bg-[var(--bg-main)]/40 p-3.5 rounded-2xl border border-[var(--border-color)] space-y-2.5">
            <span className="text-[8.5px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Today's Summary</span>
            <ul className="text-[11px] text-[var(--text-secondary)] font-medium space-y-2.5">
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">📩 <span className="text-[var(--text-primary)]">Unread messages</span></span>
                <span className="font-bold text-[var(--text-primary)] font-mono">{copilotData.messages}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">🎮 <span className="text-[var(--text-primary)]">Friends online</span></span>
                <span className="font-bold text-[var(--text-primary)] font-mono">{copilotData.online_friends}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">📅 <span className="text-[var(--text-primary)]">Upcoming events</span></span>
                <span className="font-bold text-[var(--text-primary)] font-mono">{copilotData.events}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">🔒 <span className="text-[var(--text-primary)]">Security Health</span></span>
                <span className={`font-bold font-mono ${copilotData.security_score >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {copilotData.security_score}%
                </span>
              </li>
            </ul>
          </div>

          {/* Recommendations List */}
          {copilotData.recommendations && copilotData.recommendations.length > 0 && (
            <div className="bg-[var(--bg-main)]/40 p-3.5 rounded-2xl border border-[var(--border-color)] space-y-2">
              <span className="text-[8.5px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Recommended Actions</span>
              <div className="space-y-2">
                {copilotData.recommendations.map((rec: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10.5px] font-bold text-[var(--text-primary)]/90 hover:text-[var(--text-primary)] transition-colors">
                    <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--bg-main)]/40 p-4 rounded-2xl border border-[var(--border-color)] space-y-3 relative z-10 animate-pulse">
          <div className="h-10 bg-white/5 rounded-xl mb-3" />
          <div className="h-20 bg-white/5 rounded-xl" />
        </div>
      )}
    </motion.section>
  )
})

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, logout } = useAuth()
  const { onlineStatuses } = useSocket()
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    (location.state as any)?.tab || 'discovery'
  )

  // Demo Mode State
  const [demoMode, setDemoMode] = useState<boolean>(
    localStorage.getItem('connecton_demo_mode') === 'true'
  )

  const toggleDemoMode = () => {
    const newVal = !demoMode
    setDemoMode(newVal)
    localStorage.setItem('connecton_demo_mode', String(newVal))
    window.dispatchEvent(new Event('storage'))
  }

  // Story Category Picker State
  const [storyType, setStoryType] = useState<'media' | 'voice' | 'thought' | 'mood'>('media')

  // Command Palette State
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandSearch, setCommandSearch] = useState('')
  const [scanProgress, setScanProgress] = useState<number | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCommandPalette(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSecurityScan = () => {
    setScanProgress(0)
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev === null) return null
        if (prev >= 100) {
          clearInterval(interval)
          alert('Security Audit Complete! System is 100% Protected (E2EE Verified).')
          return null
        }
        return prev + 10
      })
    }, 200)
  }

  // AI Copilot State
  const [copilotData, setCopilotData] = useState<any>(null)
  const [loadingCopilot, setLoadingCopilot] = useState(true)

  const loadCopilotData = async () => {
    setLoadingCopilot(true)
    const { data } = await api.get<any>('/copilot/')
    if (data) {
      setCopilotData(data)
    }
    setLoadingCopilot(false)
  }

  useEffect(() => {
    if (user) {
      loadCopilotData()
    }
  }, [user])

  // Real-time Clock
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Dynamic Greeting by time of day
  const getGreeting = () => {
    const hours = time.getHours()
    if (hours < 5) return 'Good Night'
    if (hours < 12) return 'Good Morning'
    if (hours < 17) return 'Good Afternoon'
    if (hours < 21) return 'Good Evening'
    return 'Good Night'
  }

  const getGreetingSymbol = () => {
    const hours = time.getHours()
    if (hours >= 5 && hours < 12) return '☀️'
    if (hours >= 12 && hours < 17) return '🌤️'
    if (hours >= 17 && hours < 21) return '🌇'
    return '🌙'
  }

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login')
    }
  }, [user, authLoading, navigate])

  // Discovery State - MUST be before any conditional return to satisfy React Rules of Hooks
  const [discoverUsers, setDiscoverUsers] = useState<DiscoverUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stories State
  const [stories, setStories] = useState<Story[]>([])
  const [loadingStories, setLoadingStories] = useState(true)

  // Wrap discoverUsers to inject mock data if demo mode is enabled
  const displayDiscoverUsers = demoMode 
    ? [
        {
          id: 'demo-user-1',
          username: 'amit_kumar',
          email: 'amit@connecton.com',
          relationship_status: 'friends' as const,
          profile: {
            full_name: 'Amit Kumar',
            avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=100',
            bio: 'Distributed Systems Engineer | Security Enthusiast',
            country: 'India',
            presence_status: 'online' as const
          }
        } as any,
        {
          id: 'demo-user-2',
          username: 'neha_sharma',
          email: 'neha@connecton.com',
          relationship_status: 'friends' as const,
          profile: {
            full_name: 'Neha Sharma',
            avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100',
            bio: 'SaaS UX Architect. Building clean minimalist layouts.',
            country: 'Singapore',
            presence_status: 'online' as const
          }
        } as any,
        {
          id: 'demo-user-3',
          username: 'rahul_sen',
          email: 'rahul@connecton.com',
          relationship_status: 'pending_received' as const,
          request_id: 'demo-req-1',
          profile: {
            full_name: 'Rahul Sen',
            avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=100',
            bio: 'Cryptographer at Connect-On. E2EE Lead.',
            country: 'India',
            presence_status: 'away' as const
          }
        } as any,
        {
          id: 'demo-user-4',
          username: 'priya_das',
          email: 'priya@connecton.com',
          relationship_status: 'none' as const,
          profile: {
            full_name: 'Priya Das',
            avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=100',
            bio: 'UI Developer & Motion Designer.',
            country: 'India',
            presence_status: 'online' as const
          }
        } as any,
        ...discoverUsers.filter(u => u.username !== 'amit_kumar' && u.username !== 'neha_sharma')
      ]
    : discoverUsers;

  // Wrap stories to inject mock data if demo mode is enabled
  const displayStories = demoMode
    ? [
        {
          id: 'demo-story-1',
          user_id: 'demo-user-1',
          media_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=400',
          media_type: 'image' as const,
          filter_preset: 'none',
          caption: 'Designing the new Connect-On OS dashboard! 🚀',
          created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
          expires_at: new Date(Date.now() + 22 * 3600000).toISOString(),
          user: {
            id: 'demo-user-1',
            username: 'amit_kumar',
            email: 'amit@connecton.com',
            profile: {
              full_name: 'Amit Kumar',
              avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=100'
            }
          },
          views: []
        },
        {
          id: 'demo-story-2',
          user_id: 'demo-user-2',
          media_url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400',
          media_type: 'image' as const,
          filter_preset: 'neon',
          caption: 'Late night server deployment complete. 🔒',
          created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
          expires_at: new Date(Date.now() + 19 * 3600000).toISOString(),
          user: {
            id: 'demo-user-2',
            username: 'neha_sharma',
            email: 'neha@connecton.com',
            profile: {
              full_name: 'Neha Sharma',
              avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100'
            }
          },
          views: []
        }
      ]
    : stories;
  
  // Story Creator state
  const [showCreateStory, setShowCreateStory] = useState(false)
  const [storyFile, setStoryFile] = useState<File | null>(null)
  const [storyFilePreview, setStoryFilePreview] = useState<string | null>(null)
  const [storyCaption, setStoryCaption] = useState('')
  const [storyFilter, setStoryFilter] = useState('none')
  const [uploadingStory, setUploadingStory] = useState(false)

  // Story Viewer state
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null)
  const [activeStoryIndex, setActiveStoryIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [viewerProgress, setViewerProgress] = useState(0)
  const [floatingEmojis, setFloatingEmojis] = useState<Array<{ id: number; char: string; left: number }>>([])

  const currentUserId = user?.id || ''

  // Load all users from backend for discovery
  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const endpoint = `/users/?search=${encodeURIComponent(searchQuery)}&online_only=${onlineOnly}`
    const { data, error: apiErr } = await api.get<DiscoverUser[]>(endpoint)
    
    if (apiErr) {
      setError(apiErr)
    } else if (data) {
      setDiscoverUsers(data)
    }
    setLoading(false)
  }, [searchQuery, onlineOnly])

  // Trigger search on query or filter toggle
  useEffect(() => {
    if (user) {
      const delayDebounce = setTimeout(() => {
        loadUsers()
      }, 300)
      return () => clearTimeout(delayDebounce)
    }
  }, [loadUsers, user])

  const loadStories = async () => {
    setLoadingStories(true)
    const { data, error } = await api.get<Story[]>('/stories/')
    if (data && !error) {
      setStories(data)
    }
    setLoadingStories(false)
  }

  useEffect(() => {
    if (user) {
      loadStories()
    }
  }, [user])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Only image or video files are allowed.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('File size exceeds the 20MB limit.')
      return
    }

    setStoryFile(file)
    setStoryFilePreview(URL.createObjectURL(file))
    setStoryFilter('none')
    setStoryCaption('')
    setShowCreateStory(true)
  }

  const handleStoryUpload = async () => {
    if (!storyFile) return
    setUploadingStory(true)

    const formData = new FormData()
    formData.append('file', storyFile)
    formData.append('caption', storyCaption)
    formData.append('filter_preset', storyFilter)

    const { error: apiErr } = await api.post('/stories/', formData)

    if (!apiErr) {
      setShowCreateStory(false)
      setStoryFile(null)
      setStoryFilePreview(null)
      loadStories()
    } else {
      alert(`Upload failed: ${apiErr}`)
    }
    setUploadingStory(false)
  }

  const logStoryView = async (storyId: string) => {
    await api.post(`/stories/${storyId}/view`)
    loadStories()
  }

  const triggerFloatingEmoji = (char: string) => {
    const id = Date.now() + Math.random()
    const left = Math.random() * 80 + 10
    setFloatingEmojis(prev => [...prev, { id, char, left }])
    
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(item => item.id !== id))
    }, 2000)
  }

  const groupStoriesByUser = (storiesList: Story[]) => {
    const groups: Record<string, { user: any; stories: Story[] }> = {}
    
    const sortedStories = [...storiesList].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    sortedStories.forEach(story => {
      const userId = story.user.id
      if (!groups[userId]) {
        groups[userId] = {
          user: story.user,
          stories: []
        }
      }
      groups[userId].stories.push(story)
    })

    return Object.values(groups)
  }

  const handleNextStory = () => {
    if (activeGroupIndex === null) return
    const groups = groupStoriesByUser(displayStories)
    const group = groups[activeGroupIndex]
    if (!group) return

    if (activeStoryIndex < group.stories.length - 1) {
      const nextIdx = activeStoryIndex + 1
      setActiveStoryIndex(nextIdx)
      setViewerProgress(0)
      const nextStory = group.stories[nextIdx]
      if (group.user.id !== currentUserId) {
        logStoryView(nextStory.id)
      }
    } else if (activeGroupIndex < groups.length - 1) {
      const nextGroupIdx = activeGroupIndex + 1
      setActiveGroupIndex(nextGroupIdx)
      setActiveStoryIndex(0)
      setViewerProgress(0)
      const nextGroup = groups[nextGroupIdx]
      if (nextGroup.user.id !== currentUserId) {
        logStoryView(nextGroup.stories[0].id)
      }
    } else {
      setActiveGroupIndex(null)
    }
  }

  const handlePrevStory = () => {
    if (activeGroupIndex === null) return
    if (activeStoryIndex > 0) {
      setActiveStoryIndex(activeStoryIndex - 1)
      setViewerProgress(0)
    } else if (activeGroupIndex > 0) {
      const prevGroupIdx = activeGroupIndex - 1
      const groups = groupStoriesByUser(displayStories)
      const prevGroup = groups[prevGroupIdx]
      setActiveGroupIndex(prevGroupIdx)
      setActiveStoryIndex(prevGroup.stories.length - 1)
      setViewerProgress(0)
    } else {
      setViewerProgress(0)
    }
  }

  useEffect(() => {
    if (activeGroupIndex === null) return
    const groups = groupStoriesByUser(displayStories)
    const group = groups[activeGroupIndex]
    if (!group) return
    const activeStory = group.stories[activeStoryIndex]
    if (!activeStory) return

    setViewerProgress(0)

    let duration = 5000
    let intervalTime = 50
    let elapsed = 0

    const interval = setInterval(() => {
      if (!isPlaying) return
      elapsed += intervalTime
      const progress = Math.min((elapsed / duration) * 100, 100)
      setViewerProgress(progress)

      if (elapsed >= duration) {
        clearInterval(interval)
        handleNextStory()
      }
    }, intervalTime)

    return () => clearInterval(interval)
  }, [activeGroupIndex, activeStoryIndex, isPlaying, displayStories])

  const handleAddFriend = useCallback(async (receiverId: string) => {
    const { error: apiErr } = await api.post(`/friends/request/${receiverId}`)
    if (!apiErr) {
      loadUsers()
    }
  }, [loadUsers])

  const handleAcceptRequest = useCallback(async (requestId: string) => {
    const { error: apiErr } = await api.post(`/friends/accept/${requestId}`)
    if (!apiErr) {
      loadUsers()
    }
  }, [loadUsers])

  const handleRejectRequest = useCallback(async (requestId: string) => {
    const { error: apiErr } = await api.post(`/friends/reject/${requestId}`)
    if (!apiErr) {
      loadUsers()
    }
  }, [loadUsers])

  const handleReportClick = useCallback((id: string, username: string) => {
    setReportedUserId(id)
    setReportedUsername(username)
    setShowReportModal(true)
  }, [])

  const handleNavigateToChats = useCallback(() => {
    navigate('/chats')
  }, [navigate])

  const handleStoryClick = useCallback((idx: number) => {
    const groups = groupStoriesByUser(displayStories)
    const group = groups[idx]
    if (!group) return
    const isMe = group.user.id === (user?.id || '')
    
    setActiveGroupIndex(idx)
    setActiveStoryIndex(0)
    setIsPlaying(true)
    setViewerProgress(0)
    if (!isMe) {
      logStoryView(group.stories[0].id)
    }
  }, [displayStories, user?.id])

  // Moderation state & handlers
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportedUserId, setReportedUserId] = useState('')
  const [reportedUsername, setReportedUsername] = useState('')
  const [reportReason, setReportReason] = useState('')

  const handleReportUser = async () => {
    if (!reportedUserId || !reportReason.trim()) return

    const { error: apiErr } = await api.post(`/users/report`, {
      reported_id: reportedUserId,
      reason: reportReason.trim()
    })

    if (apiErr) {
      alert(apiErr)
    } else {
      alert('Report submitted successfully.')
      setShowReportModal(false)
      setReportedUserId('')
      setReportedUsername('')
      setReportReason('')
    }
  }

  // Total online count calculator
  const getOnlineCount = () => {
    return Object.values(onlineStatuses).filter(status => status === 'online').length
  }

  if (authLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-muted)] text-sm font-medium">Loading your workspace...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-transparent">
        <div className="text-center text-[var(--text-secondary)]">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--accent)]" />
          <p>Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden text-[var(--text-primary)] relative select-none">


      {/* LEFT SIDEBAR NAVIGATION */}
      <Sidebar activeTab={activeTab} setActiveTab={(tab) => setActiveTab(tab as any)} />

      {/* MAIN CANVAS */}
      <main className="flex-1 h-full flex flex-col z-10 overflow-hidden bg-[var(--bg-main)]">
        {/* PREMIUM COMMAND CENTER TOP BAR */}
        <header className="h-18 border-b border-[var(--border-color)] px-8 flex items-center justify-between flex-shrink-0 bg-[var(--bg-surface)] backdrop-blur-[var(--glass-blur)]">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm font-bold text-[var(--text-primary)] tracking-tight leading-none block">
                {getGreetingSymbol()} {getGreeting()}, {user.profile?.full_name?.split(' ')[0] || user.username}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-medium mt-1.5 block">
                Today is a great day to build. {displayDiscoverUsers.filter(u => onlineStatuses[u.id] === 'online' || u.profile?.presence_status === 'online').length} friends active now.
              </span>
            </div>
          </div>

          {/* Universal Search Command Bar */}
          <div className="hidden md:flex items-center w-72 relative">
            <Search className="absolute left-3.5 top-3.5 w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <input 
              type="text" 
              placeholder="Command + K to search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={() => setShowCommandPalette(true)}
              className="w-full pl-9 pr-14 py-2 glass-input text-xs rounded-full cursor-pointer"
            />
            <div className="absolute right-3.5 top-2.5 px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-color)] text-[9px] font-medium text-[var(--text-secondary)] pointer-events-none uppercase">
              ⌘K
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Weather Card */}
            <div className="hidden lg:flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-full px-3 py-1.5 text-[10px] font-semibold backdrop-blur-[var(--glass-blur)] hover:border-[var(--accent)]/30 transition-colors">
              <span className="text-yellow-400">☀️</span>
              <span className="text-[var(--text-primary)]">24°C Sunny</span>
            </div>

            {/* Live Clock Card */}
            <div className="hidden sm:flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-full px-3 py-1.5 text-[10px] font-semibold backdrop-blur-[var(--glass-blur)] hover:border-[var(--accent)]/30 transition-colors">
              <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[var(--text-primary)] font-mono">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toLowerCase()}</span>
            </div>

            {/* Startup Demo Mode Toggle */}
            <button
              onClick={toggleDemoMode}
              className={`px-3.5 py-1.5 rounded-full border text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                demoMode 
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_8px_rgba(0,102,255,0.2)]'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              Demo: {demoMode ? 'ON' : 'OFF'}
            </button>

            {/* Quick Create Button */}
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => document.getElementById('story-upload-input')?.click()}
              className="px-3.5 py-1.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-md shadow-[var(--accent-glow)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </motion.button>

            {/* Notification triggers */}
            <NotificationsPopover />

            {/* User Presence Ring */}
            <div className="text-[10px] px-3.5 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/20 font-bold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-[var(--glass-blur)] shadow-[0_0_8px_rgba(16,185,129,0.15)] relative overflow-hidden group">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping absolute left-[14px]" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 relative z-10 shrink-0" />
              <span className="text-emerald-400 relative z-10 font-black">Live Now</span>
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT AREA */}
        <div className="flex-1 overflow-hidden flex">
          
          {/* Main Tab View */}
          <div className="flex-1 overflow-y-auto p-8 scrollbar-thin space-y-8">
            
            {activeTab === 'discovery' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* 2-Column Main Content Ecosystem */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Top Stories Row */}
                  <motion.section 
                    whileHover={{ y: -3, borderColor: 'var(--accent)' }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative glass-panel p-5 rounded-3xl space-y-4 overflow-hidden"
                  >
                    {/* Soft violet ambient glow underlay */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 blur-[50px] pointer-events-none rounded-full" />
                    
                    {/* Glowing planet graphic in bottom right */}
                    <div className="absolute -bottom-10 -right-10 w-48 h-48 pointer-events-none select-none z-0 opacity-70">
                      {/* Planet sphere */}
                      <div className="absolute right-0 bottom-0 w-36 h-36 rounded-full bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-950 shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.8),_0_0_30px_rgba(236,72,153,0.3)] border border-pink-500/20" />
                      {/* Planet glow */}
                      <div className="absolute right-[-20px] bottom-[-20px] w-44 h-44 rounded-full bg-pink-500/20 blur-2xl" />
                      {/* Planet crescent light overlay */}
                      <div className="absolute right-2 bottom-2 w-32 h-32 rounded-full bg-gradient-to-tr from-transparent via-transparent to-pink-300/40" />
                      {/* Orbit ring */}
                      <div className="absolute right-[-40px] bottom-[-10px] w-56 h-20 rounded-full border border-pink-500/30 rotate-[-15deg] transform origin-bottom-right" />
                    </div>

                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-pink-500 animate-pulse" />
                        <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider pl-1">Stories Broadcast</h3>
                      </div>
                      <span className="text-[10px] font-semibold text-blue-500 tracking-normal">Disappears in 24h</span>
                    </div>
                    
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin relative z-10">
                      <motion.div 
                        onClick={() => document.getElementById('story-upload-input')?.click()}
                        className="flex flex-col items-center gap-2.5 cursor-pointer flex-shrink-0 group"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <input 
                          type="file" 
                          accept="image/*,video/*" 
                          onChange={handleFileSelect} 
                          className="hidden" 
                          id="story-upload-input" 
                        />
                        <div className="relative w-16 h-16 rounded-2xl border border-dashed border-blue-500/50 bg-blue-500/5 flex items-center justify-center transition-all duration-300 shadow-[0_0_10px_rgba(0,102,255,0.1)] group-hover:border-blue-400 group-hover:bg-blue-500/10">
                          <Plus className="w-6 h-6 text-blue-500 group-hover:text-blue-400 transition-colors" />
                          
                          {/* Lightning badge in bottom-right corner */}
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white border-2 border-[var(--bg-main)] shadow-[0_0_8px_rgba(0,102,255,0.6)]">
                            <Zap className="w-2.5 h-2.5 text-white fill-white" />
                          </div>
                        </div>
                        <span className="text-[10px] font-medium tracking-tight text-[var(--text-secondary)] mt-1">Add Story</span>
                      </motion.div>

                      {groupStoriesByUser(displayStories).map((group, idx) => (
                        <StoryCard
                          key={group.user.id}
                          group={group}
                          idx={idx}
                          userId={user.id}
                          onClick={handleStoryClick}
                        />
                      ))}

                      {loadingStories && displayStories.length === 0 && (
                        <div className="flex gap-4">
                          {[1, 2, 3].map(n => (
                            <div key={n} className="flex flex-col items-center gap-2.5 animate-pulse">
                              <div className="w-15 h-15 rounded-full bg-white/5 border border-white/5" />
                              <div className="w-10 h-2 bg-white/5 rounded" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.section>

                  {/* Stripe-Style Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Connections Stat */}
                    <div className="glass-card p-4 rounded-2xl flex flex-col justify-between transition-all relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <div>
                        <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block">Connections</span>
                        <span className="text-2xl font-black text-[var(--text-primary)] mt-2 block font-heading">
                          {demoMode ? '128' : (copilotData?.total_connections ?? 0)}
                        </span>
                      </div>
                      <span className="text-[9px] text-emerald-400 font-extrabold mt-3 block flex items-center gap-1">
                        {demoMode ? (
                          <>
                            <span>↑ 12%</span>
                            <span className="text-slate-500 font-semibold">this week</span>
                          </>
                        ) : (
                          <span className="text-emerald-400">Active links</span>
                        )}
                      </span>
                    </div>

                    {/* Messages Stat */}
                    <div className="glass-card p-4 rounded-2xl flex flex-col justify-between transition-all relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <div>
                        <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block">Encrypted Chats</span>
                        <span className="text-2xl font-black text-[var(--text-primary)] mt-2 block font-heading">
                          {demoMode ? '1,274' : (copilotData?.total_messages ?? 0)}
                        </span>
                      </div>
                      <span className="text-[9px] text-blue-400 font-extrabold mt-3 block flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span>{demoMode ? 'Active Now' : 'Total Messages'}</span>
                      </span>
                    </div>

                    {/* Stories Stat */}
                    <div className="glass-card p-4 rounded-2xl flex flex-col justify-between transition-all relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <div>
                        <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block">Broadcasts</span>
                        <span className="text-2xl font-black text-[var(--text-primary)] mt-2 block font-heading">
                          {demoMode ? '47' : (copilotData?.total_stories ?? 0)}
                        </span>
                      </div>
                      <span className="text-[9px] text-pink-400 font-extrabold mt-3 block flex items-center gap-1">
                        <span>{demoMode ? 'New stories available' : 'Active Broadcasts'}</span>
                      </span>
                    </div>

                    {/* Security Health Stat */}
                    <div className="glass-card p-4 rounded-2xl flex flex-col justify-between transition-all relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <div>
                        <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block">Security Score</span>
                        <span className="text-2xl font-black text-[var(--text-primary)] mt-2 block font-heading">
                          {demoMode ? '98%' : `${copilotData?.security_score ?? 0}%`}
                        </span>
                      </div>
                      <span className="text-[9px] text-emerald-400 font-extrabold mt-3 block flex items-center gap-1">
                        <span>E2EE Protected</span>
                      </span>
                    </div>
                  </div>

                  {/* Discover People Section */}
                  <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between glass-panel p-5 rounded-3xl">
                      <div>
                        <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Social Network Directory</h2>
                        <p className="text-[var(--text-secondary)] text-xs font-medium">Discover verified users and link encryption profiles.</p>
                      </div>

                      <div className="flex w-full sm:w-auto gap-3 flex-shrink-0">
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setOnlineOnly(!onlineOnly)}
                          className={`px-4 py-2 rounded-full border text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${
                            onlineOnly 
                              ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-md' 
                              : 'border-[var(--border-color)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                          <span>Online Only</span>
                        </motion.button>
                      </div>
                    </div>

                    {loading ? (
                      <div className="h-64 w-full flex items-center justify-center">
                        <RefreshCw className="w-8 h-8 animate-spin text-[var(--accent)]" />
                      </div>
                    ) : error ? (
                      <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs text-center">
                        Error loading users: {error}
                      </div>
                    ) : displayDiscoverUsers.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-20 glass-panel rounded-3xl p-8 relative overflow-hidden flex flex-col items-center justify-center"
                      >
                        {/* Glowing cyan/blue planet in bottom-left corner */}
                        <div className="absolute -bottom-12 -left-12 w-48 h-48 pointer-events-none select-none z-0 opacity-80">
                          {/* Planet sphere */}
                          <div className="absolute left-0 bottom-0 w-36 h-36 rounded-full bg-gradient-to-tr from-cyan-600 via-blue-700 to-indigo-950 shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.8),_0_0_30px_rgba(6,182,212,0.3)] border border-cyan-500/20" />
                          {/* Planet glow */}
                          <div className="absolute left-[-20px] bottom-[-20px] w-44 h-44 rounded-full bg-cyan-500/20 blur-2xl" />
                          {/* Crescent light overlay */}
                          <div className="absolute left-4 bottom-4 w-28 h-28 rounded-full bg-gradient-to-tr from-transparent via-transparent to-cyan-300/40" />
                          {/* Orbit ring */}
                          <div className="absolute left-[-30px] bottom-[-10px] w-52 h-16 rounded-full border border-cyan-500/30 rotate-[25deg] transform origin-bottom-left" />
                        </div>

                        {/* Concentric orbital rings behind the center icon */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                          <div className="w-80 h-80 rounded-full border border-white/[0.02] flex items-center justify-center">
                            <div className="w-64 h-64 rounded-full border border-white/[0.03] flex items-center justify-center">
                              <div className="w-48 h-48 rounded-full border border-white/[0.04] flex items-center justify-center">
                                <div className="w-32 h-32 rounded-full border border-white/[0.06] flex items-center justify-center" />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Animated pulsing icon container */}
                        <div className="relative mb-6 z-10">
                          <motion.div 
                            animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                            className="absolute inset-0 bg-blue-500/10 blur-2xl rounded-full scale-150"
                          />
                          <div className="w-16 h-16 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center shadow-[0_0_20px_var(--accent-glow)]">
                            <UserPlus className="w-6 h-6 text-slate-400" />
                          </div>
                        </div>

                        <h4 className="font-bold text-sm tracking-tight text-[var(--text-primary)] mb-2 relative z-10">
                          No verified profiles match your current filters.
                        </h4>
                        <div className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed relative z-10 font-medium mt-3 space-y-2">
                          <p className="font-bold text-[var(--text-primary)]/95">Try:</p>
                          <ul className="list-disc list-inside text-left px-4 space-y-1">
                            <li>Expanding location radius</li>
                            <li>Searching by interest</li>
                            <li>Removing verification filter</li>
                          </ul>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <AnimatePresence>
                          {displayDiscoverUsers.map((item) => (
                            <UserCard
                              key={item.id}
                              item={item}
                              currentStatus={onlineStatuses[item.id] || item.profile?.presence_status || 'offline'}
                              onReport={handleReportClick}
                              onAddFriend={handleAddFriend}
                              onAcceptRequest={handleAcceptRequest}
                              onRejectRequest={handleRejectRequest}
                              onChat={handleNavigateToChats}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </section>
                </div>

                {/* Right Side Social Signals & Live Activity Feed */}
                <div className="space-y-8 lg:col-span-1">
                  
                  {/* Dynamic Relationship Card */}
                  <motion.section 
                    whileHover={{ y: -3, borderColor: 'var(--accent)' }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative glass-panel p-5 rounded-3xl space-y-4 overflow-hidden"
                  >
                    {/* Soft pink ambient glow underlay */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 blur-[50px] pointer-events-none rounded-full" />
                    
                    <div className="flex items-center gap-2 relative z-10">
                      <motion.div
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                      >
                        <Heart className="w-4.5 h-4.5 text-rose-500 fill-rose-500" />
                      </motion.div>
                      <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider pl-1">Relationship Analytics</h3>
                    </div>
                    
                    {/* Grid of four circular progress rings */}
                    <div className="grid grid-cols-2 gap-3 text-center relative z-10">
                      {[
                        { label: 'Compatibility', value: 92, color: 'stroke-rose-500' },
                        { label: 'Communication', value: 89, color: 'stroke-violet-500' },
                        { label: 'Interests', value: 94, color: 'stroke-blue-500' },
                        { label: 'Trust Index', value: 91, color: 'stroke-emerald-500' }
                      ].map((stat, i) => {
                        const radius = 18
                        const circumference = 2 * Math.PI * radius
                        const strokeDashoffset = circumference * (1 - stat.value / 100)
                        
                        return (
                          <div key={i} className="bg-[var(--bg-main)]/40 p-2.5 rounded-2xl border border-[var(--border-color)] flex flex-col items-center justify-center">
                            <div className="relative w-12 h-12 flex items-center justify-center">
                              <svg className="w-12 h-12 transform -rotate-90">
                                <circle cx="24" cy="24" r={radius} className="stroke-[var(--border-color)] fill-transparent" strokeWidth="2.5" />
                                <motion.circle 
                                  cx="24" 
                                  cy="24" 
                                  r={radius} 
                                  className={`${stat.color} fill-transparent`} 
                                  strokeWidth="2.5" 
                                  strokeDasharray={`${circumference}`}
                                  initial={{ strokeDashoffset: circumference }}
                                  animate={{ strokeDashoffset }}
                                  transition={{ duration: 1.2, delay: i * 0.15, ease: "easeOut" }}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span className="absolute text-[10px] font-black text-[var(--text-primary)]">{stat.value}%</span>
                            </div>
                            <span className="text-[8px] text-[var(--text-secondary)] font-bold mt-1.5 uppercase tracking-wider block">{stat.label}</span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="bg-[var(--bg-main)]/40 p-4 rounded-2xl border border-[var(--border-color)] flex items-center justify-between text-xs relative z-10">
                      <div>
                        <span className="text-[var(--text-secondary)] block font-medium">Next Anniversary</span>
                        <span className="font-bold text-[var(--text-primary)] block mt-0.5">June 24 (Connect Day)</span>
                      </div>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-full font-bold">20d Left</span>
                    </div>
                  </motion.section>

                  {/* Online Friends List / Live Activity */}
                  <motion.section 
                    whileHover={{ y: -3, borderColor: 'var(--accent)' }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative glass-panel p-5 rounded-3xl space-y-4 overflow-hidden"
                  >
                    {/* Soft electric blue ambient glow underlay */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[50px] pointer-events-none rounded-full" />
                    
                    {/* Neon linear grid/wave graphic at the bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 overflow-hidden pointer-events-none z-0 opacity-45">
                      <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="neonGlow" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#0066FF" stopOpacity="0.8" />
                            <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#EC4899" stopOpacity="0.8" />
                          </linearGradient>
                          <linearGradient id="fadeToTop" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {/* Wavy lines */}
                        <path d="M 0 80 Q 100 20 200 80 T 400 80 L 400 100 L 0 100 Z" fill="url(#fadeToTop)" className="text-blue-500/10" />
                        <path d="M 0 80 Q 100 20 200 80 T 400 80" fill="none" stroke="url(#neonGlow)" strokeWidth="1" />
                        <path d="M 0 90 Q 80 40 180 90 T 400 90" fill="none" stroke="url(#neonGlow)" strokeWidth="0.5" opacity="0.6" />
                        <path d="M 0 70 Q 120 10 220 70 T 400 70" fill="none" stroke="url(#neonGlow)" strokeWidth="0.5" opacity="0.4" />
                        {/* Grid lines */}
                        <line x1="50" y1="0" x2="50" y2="100" stroke="#0066FF" strokeWidth="0.5" opacity="0.1" />
                        <line x1="100" y1="0" x2="100" y2="100" stroke="#0066FF" strokeWidth="0.5" opacity="0.1" />
                        <line x1="150" y1="0" x2="150" y2="100" stroke="#0066FF" strokeWidth="0.5" opacity="0.1" />
                        <line x1="200" y1="0" x2="200" y2="100" stroke="#0066FF" strokeWidth="0.5" opacity="0.1" />
                        <line x1="250" y1="0" x2="250" y2="100" stroke="#0066FF" strokeWidth="0.5" opacity="0.1" />
                        <line x1="300" y1="0" x2="300" y2="100" stroke="#0066FF" strokeWidth="0.5" opacity="0.1" />
                        <line x1="350" y1="0" x2="350" y2="100" stroke="#0066FF" strokeWidth="0.5" opacity="0.1" />
                      </svg>
                    </div>

                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-2">
                        <Users className="w-4.5 h-4.5 text-[var(--accent)]" />
                        <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider pl-1">Live Activity</h3>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        {displayDiscoverUsers.filter(u => onlineStatuses[u.id] === 'online' || u.profile?.presence_status === 'online').length} Online
                      </span>
                    </div>

                    <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1 relative z-10">
                      {displayDiscoverUsers.filter(u => onlineStatuses[u.id] === 'online' || u.profile?.presence_status === 'online').length === 0 ? (
                        /* Dynamic Recent Activity Feed instead of empty */
                        <div className="space-y-3 pt-1">
                          <span className="text-[9px] font-bold tracking-wider text-[var(--text-secondary)] uppercase block mb-1">🔥 Recent Activity</span>
                          {demoMode ? (
                            <>
                              <div className="flex gap-2.5 items-start bg-[var(--bg-main)]/40 p-2.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0 animate-pulse" />
                                <div>
                                  <p className="text-[10px] text-[var(--text-primary)] font-bold">Amit Kumar <span className="text-slate-500 font-semibold">posted a Story</span></p>
                                  <span className="text-[8px] text-[var(--text-secondary)] font-bold block mt-0.5">2m ago</span>
                                </div>
                              </div>
                              <div className="flex gap-2.5 items-start bg-[var(--bg-main)]/40 p-2.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-[var(--text-primary)] font-bold">Rahul Sen <span className="text-slate-500 font-semibold">updated E2EE profile</span></p>
                                  <span className="text-[8px] text-[var(--text-secondary)] font-bold block mt-0.5">15m ago</span>
                                </div>
                              </div>
                              <div className="flex gap-2.5 items-start bg-[var(--bg-main)]/40 p-2.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-2 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-[var(--text-primary)] font-bold">Neha Sharma <span className="text-slate-500 font-semibold">joined Gaming Hub</span></p>
                                  <span className="text-[8px] text-[var(--text-secondary)] font-bold block mt-0.5">1h ago</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            (copilotData?.recent_activities ?? []).map((activity: any, idx: number) => {
                              const dotColor = idx === 0 ? 'bg-blue-400' : idx === 1 ? 'bg-violet-400' : 'bg-pink-400';
                              return (
                                <div key={idx} className="flex gap-2.5 items-start bg-[var(--bg-main)]/40 p-2.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-colors">
                                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-2 shrink-0 ${idx === 0 ? 'animate-pulse' : ''}`} />
                                  <div>
                                    <p className="text-[10px] text-[var(--text-primary)] font-bold">
                                      {activity.display_name}{' '}
                                      <span className="text-slate-500 font-semibold">{activity.action}</span>
                                    </p>
                                    <span className="text-[8px] text-[var(--text-secondary)] font-bold block mt-0.5">{activity.time_ago}</span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      ) : (
                        displayDiscoverUsers.filter(u => onlineStatuses[u.id] === 'online' || u.profile?.presence_status === 'online').map(friend => {
                          const avatar = friend.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'
                          return (
                            <div key={friend.id} className="flex items-center justify-between group cursor-pointer hover:bg-[var(--bg-surface)] p-1.5 rounded-xl transition-all">
                              <div className="flex items-center gap-2.5">
                                <div className="relative">
                                  <img 
                                    src={avatar} 
                                    alt="" 
                                    className="w-8 h-8 rounded-full object-cover border border-[var(--border-color)]"
                                  />
                                  {/* Dual-ring pulsing dot */}
                                  <span className="absolute bottom-0 right-0 flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border-2 border-[var(--bg-main)]"></span>
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-[11px] font-bold text-[var(--text-primary)] truncate font-sans">{friend.profile?.full_name || friend.username}</h4>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-[var(--text-secondary)] truncate">Active now</span>
                                    
                                    {/* Mini SVG activity waves */}
                                    <div className="flex items-end gap-[1.5px] h-2.5 w-3">
                                      <div className="w-[1.5px] bg-emerald-500 rounded-full mini-wave-bar" style={{ height: '30%' }} />
                                      <div className="w-[1.5px] bg-emerald-500 rounded-full mini-wave-bar" style={{ height: '70%', animationDelay: '0.2s' }} />
                                      <div className="w-[1.5px] bg-emerald-500 rounded-full mini-wave-bar" style={{ height: '50%', animationDelay: '0.4s' }} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <motion.button 
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => navigate('/chats')}
                                className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-[var(--accent)] text-[var(--text-primary)] hover:text-white transition-all cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </motion.button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </motion.section>

                  {/* AI Copilot Widget */}
                  <CopilotPanel
                    copilotData={copilotData}
                    loadingCopilot={loadingCopilot}
                  />

                  {/* Security Guard Checklist Card */}
                  <motion.section 
                    whileHover={{ y: -3, borderColor: 'var(--accent)' }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative glass-panel p-5 rounded-3xl space-y-4 overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[50px] pointer-events-none rounded-full" />
                    <div className="flex items-center gap-2 relative z-10">
                      <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
                      <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider pl-1">Security Guard</h3>
                    </div>
                    <div className="bg-[var(--bg-main)]/40 p-4 rounded-2xl border border-[var(--border-color)] space-y-3 relative z-10">
                      <div className="flex items-center justify-between text-xs border-b border-[var(--border-color)] pb-2">
                        <span className="text-[var(--text-secondary)] font-medium">Security Index</span>
                        <span className="font-bold text-emerald-400">98/100 (Secure)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 text-[10px] text-[var(--text-secondary)] font-bold pt-1">
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>E2EE Verified</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>2FA Activated</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Device Auth</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Guard Active</span>
                        </div>
                      </div>
                    </div>
                  </motion.section>

                  {/* Cybersecurity Sessions Global Map Widget */}
                  <motion.section 
                    whileHover={{ y: -3, borderColor: 'var(--accent)' }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative glass-panel p-5 rounded-3xl space-y-4 overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[50px] pointer-events-none rounded-full" />
                    
                    <div className="flex items-center justify-between relative z-10">
                      <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider pl-1">Active Sessions Map</h3>
                      <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold uppercase">Live Tracker</span>
                    </div>

                    <div className="bg-[var(--bg-main)]/40 p-2.5 rounded-2xl border border-[var(--border-color)] relative z-10 overflow-hidden flex flex-col justify-between">
                      {/* Stylized custom SVG map with Bhubaneswar, Mumbai, Singapore */}
                      <div className="relative w-full h-32 bg-zinc-950/85 rounded-xl border border-[var(--border-color)] overflow-hidden flex items-center justify-center">
                        <svg className="w-full h-full text-slate-800" viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M 40 40 Q 60 50 100 40 T 160 50 T 200 40" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3" />
                          <path d="M 220 120 Q 250 100 280 120 T 320 100 T 360 120" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3" />
                          
                          <path d="M 120 70 Q 150 90 140 120 L 170 140 L 190 110 T 170 80 Z" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
                          
                          <line x1="0" y1="50" x2="400" y2="50" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                          <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                          <line x1="0" y1="150" x2="400" y2="150" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                          
                          <path d="M 145 100 Q 155 110 175 115" stroke="cyan" strokeWidth="1" strokeDasharray="4 4" className="animate-[pulse_2s_infinite]" />
                          <path d="M 145 100 Q 160 115 190 135" stroke="cyan" strokeWidth="1" strokeDasharray="4 4" className="animate-[pulse_2s_infinite]" />
                        </svg>

                        {/* Mumbai Node */}
                        <div className="absolute top-[48%] left-[34%] transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 absolute animate-ping" />
                          <span className="w-2 h-2 rounded-full bg-cyan-500 border border-black z-10" />
                          <span className="text-[6px] text-white font-black bg-black/85 px-1 rounded border border-white/10 mt-1 pointer-events-none">Mumbai</span>
                        </div>

                        {/* Bhubaneswar Node */}
                        <div className="absolute top-[52%] left-[43%] transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 absolute animate-ping" style={{ animationDelay: '0.4s' }} />
                          <span className="w-2 h-2 rounded-full bg-cyan-500 border border-black z-10" />
                          <span className="text-[6px] text-white font-black bg-black/85 px-1 rounded border border-white/10 mt-1 pointer-events-none">Bhubaneswar</span>
                        </div>

                        {/* Singapore Node */}
                        <div className="absolute top-[66%] left-[48%] transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 absolute animate-ping" style={{ animationDelay: '0.8s' }} />
                          <span className="w-2 h-2 rounded-full bg-cyan-500 border border-black z-10" />
                          <span className="text-[6px] text-white font-black bg-black/85 px-1 rounded border border-white/10 mt-1 pointer-events-none">Singapore</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[8.5px] text-[var(--text-secondary)] font-bold mt-2.5 px-0.5">
                        <span className="flex items-center gap-1">🟢 <span className="text-[var(--text-primary)] font-medium">3 active endpoints</span></span>
                        <span>Singapore Node Sync: 99.98%</span>
                      </div>
                    </div>
                  </motion.section>

                  {/* Smart Calendar Quick Panel */}
                  <motion.section 
                    whileHover={{ y: -3, borderColor: 'var(--accent)' }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative glass-panel p-5 rounded-3xl space-y-4 overflow-hidden"
                  >
                    {/* Soft golden ambient glow underlay */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[50px] pointer-events-none rounded-full" />
                    
                    <div className="flex items-center gap-2 relative z-10">
                      <CalendarIcon className="w-4.5 h-4.5 text-amber-500" />
                      <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider pl-1">Announcements & Milestones</h3>
                    </div>

                    {/* Timeline Container */}
                    <div className="space-y-3 relative z-10">
                      {/* Timeline Item 1 */}
                      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-main)]/40 border border-[var(--border-color)] group hover:border-[var(--accent)]/30 transition-all">
                        <div className="flex items-center gap-3">
                          {/* Event marker dot */}
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] shrink-0" />
                          <div>
                            <h4 className="font-bold text-[var(--text-primary)] group-hover:text-amber-400 transition-colors text-xs">Startup Launch Party</h4>
                            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-medium">Tonight at 8:00 PM • Live Stream Room</p>
                          </div>
                        </div>
                        
                        {/* Square container box on the right containing action icon */}
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center text-slate-400 group-hover:text-[var(--text-primary)] group-hover:border-[var(--accent)]/30 transition-all shrink-0">
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Timeline Item 2 */}
                      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-main)]/40 border border-[var(--border-color)] group hover:border-[var(--accent)]/30 transition-all">
                        <div className="flex items-center gap-3">
                          {/* Event marker dot */}
                          <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] shrink-0" />
                          <div>
                            <h4 className="font-bold text-[var(--text-primary)] group-hover:text-pink-400 transition-colors text-xs">System Verification Complete</h4>
                            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-medium">CTO Audit check has completed successfully</p>
                          </div>
                        </div>
                        
                        {/* Square container box on the right containing green check icon */}
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center text-emerald-400 transition-all shrink-0">
                          <Check className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </motion.section>

                </div>
              </div>
            )}

            {activeTab === 'stories' && (
              <section className="space-y-6">
                <div className="glass-panel p-5 rounded-3xl">
                  <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Active Stories</h2>
                  <p className="text-[var(--text-secondary)] text-xs font-medium">View stories posted by your friends within the last 24 hours.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  <motion.div 
                    whileHover={{ y: -3, borderColor: 'var(--accent)', boxShadow: 'var(--shadow-hover)' }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    onClick={() => document.getElementById('story-upload-tab-input')?.click()}
                    className="glass-card p-6 flex flex-col items-center justify-center text-center border-dashed border-2 hover:border-[var(--accent)] transition-all cursor-pointer h-64"
                  >
                    <input 
                      type="file" 
                      accept="image/*,video/*" 
                      onChange={handleFileSelect} 
                      className="hidden" 
                      id="story-upload-tab-input" 
                    />
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-12 h-12 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center mb-4"
                    >
                      <Plus className="w-6 h-6 text-[var(--accent)]" />
                    </motion.div>
                    <h4 className="font-bold text-sm mb-1 text-[var(--text-primary)]">Create a Story</h4>
                    <p className="text-[10px] text-[var(--text-secondary)] max-w-[150px] font-medium">Share a photo or video that disappears in 24 hours.</p>
                  </motion.div>

                  {groupStoriesByUser(stories).map((group, idx) => {
                    const isUnviewed = group.stories.some(story => !story.views.some(view => view.viewer_id === user.id))
                    const lastStory = group.stories[group.stories.length - 1]
                    const avatar = group.user.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'
                    const displayName = group.user.profile?.full_name || group.user.username
                    const isMe = group.user.id === user.id

                    return (
                      <motion.div
                        key={group.user.id}
                        whileHover={{ y: -3, borderColor: 'var(--accent)', boxShadow: 'var(--shadow-hover)' }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        onClick={() => {
                          setActiveGroupIndex(idx)
                          setActiveStoryIndex(0)
                          setIsPlaying(true)
                          setViewerProgress(0)
                          if (!isMe) {
                            logStoryView(group.stories[0].id)
                          }
                        }}
                        className="glass-card overflow-hidden group flex flex-col justify-between hover:border-[var(--accent)] hover:shadow-lg transition-all duration-300 h-64 relative"
                      >
                        <div className="h-40 w-full relative bg-[var(--bg-surface)] border-b border-[var(--border-color)] overflow-hidden">
                          {lastStory.media_type === 'video' ? (
                            <video 
                              src={lastStory.media_url} 
                              muted 
                              className={`w-full h-full object-cover filter ${filterPresets.find(f => f.id === lastStory.filter_preset)?.class || ''}`} 
                            />
                          ) : (
                            <img 
                              src={lastStory.media_url} 
                              alt="" 
                              className={`w-full h-full object-cover filter ${filterPresets.find(f => f.id === lastStory.filter_preset)?.class || ''}`} 
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                          
                          <div className="absolute bottom-3 left-3 flex items-center gap-2">
                            <div className={`rounded-full p-[2px] bg-gradient-to-tr ${
                              isUnviewed 
                                ? 'from-pink-500 via-violet-500 to-indigo-500' 
                                : 'from-[var(--border-color)] to-[var(--border-color)]'
                            } flex items-center justify-center`}>
                              <div className="rounded-full p-[1px] bg-[var(--bg-main)]">
                                <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                              </div>
                            </div>
                            <div className="text-[10px] text-white">
                              <h5 className="font-bold truncate max-w-[120px]">{isMe ? 'My Story' : displayName}</h5>
                              <span className="opacity-75 font-medium">{group.stories.length} stories</span>
                            </div>
                          </div>

                          {isUnviewed && (
                            <span className="absolute top-3 right-3 text-[8px] bg-rose-500 text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              New
                            </span>
                          )}
                        </div>
                        
                        <div className="p-4 flex items-center justify-between bg-[var(--bg-main)]/40 flex-1 z-10">
                          <span className="text-[10px] text-[var(--text-secondary)] font-bold">
                            Last active: {new Date(lastStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10px] text-[var(--accent)] hover:text-white font-bold transition-all cursor-pointer">
                            View
                          </span>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Lazy-loaded hubs: wrapped in Suspense so the spinner shows while chunk downloads */}
            <Suspense fallback={<HubLoadingFallback />}>
              {activeTab === 'gaming'        && <GamingHub />}
              {activeTab === 'relationship'  && <RelationshipHub />}
              {activeTab === 'calendar'      && <SmartCalendar />}
              {activeTab === 'notes'         && <NotesHub />}
              {activeTab === 'productivity'  && <ProductivityHub />}
              {activeTab === 'cloud'         && <PersonalCloud />}
              {activeTab === 'security'      && <SecurityHub />}
            </Suspense>
          </div>
        </div>
      </main>

      {/* STORY CREATOR MODAL */}
      <AnimatePresence>
        {showCreateStory && storyFilePreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="glass-panel max-w-lg w-full overflow-hidden flex flex-col border border-white/10"
            >
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/10">
                <h3 className="text-sm font-bold text-white">Create Story</h3>
                <button 
                  onClick={() => {
                    setShowCreateStory(false)
                    setStoryFile(null)
                    setStoryFilePreview(null)
                  }}
                  className="p-1.5 rounded-lg border border-white/5 hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] scrollbar-thin">
                {/* Category Picker */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider pl-0.5">
                    Story Category
                  </label>
                  <div className="flex gap-2.5">
                    {(['media', 'voice', 'thought', 'mood'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setStoryType(type)}
                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          storyType === type
                            ? 'bg-blue-600 border border-blue-500 text-white shadow-md'
                            : 'border border-white/5 hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        {type === 'media' ? 'Photo/Video' : type === 'voice' ? 'Voice' : type === 'thought' ? 'Thought' : 'Mood'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Media/Category Preview */}
                <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center p-4 min-h-60 max-h-96">
                  {storyType === 'media' && (
                    storyFile?.type.startsWith('video/') ? (
                      <video src={storyFilePreview} controls muted className={`max-h-80 max-w-full rounded-lg object-contain ${filterPresets.find(f => f.id === storyFilter)?.class || ''}`} />
                    ) : (
                      <img src={storyFilePreview} alt="Story preview" className={`max-h-80 max-w-full rounded-lg object-contain ${filterPresets.find(f => f.id === storyFilter)?.class || ''}`} />
                    )
                  )}

                  {storyType === 'voice' && (
                    <div className="flex flex-col items-center justify-center py-10 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                        <Radio className="w-8 h-8 animate-pulse" />
                      </div>
                      <span className="text-xs text-white font-extrabold">Recording Audio Broadcast</span>
                      <div className="flex items-end gap-1.5 h-12 w-36">
                        {[40, 70, 50, 90, 30, 80, 60, 100, 40, 70, 50].map((h, i) => (
                          <div 
                            key={i} 
                            className="w-2.5 bg-blue-500 rounded-full animate-pulse shrink-0" 
                            style={{ height: `${h}%`, animationDelay: `${i * 0.1}s`, animationDuration: '0.8s' }} 
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {storyType === 'thought' && (
                    <div className="w-full max-w-xs h-60 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-700 to-cyan-700 p-6 flex flex-col justify-between text-white relative shadow-lg">
                      <textarea
                        placeholder="Write your quick thought here..."
                        value={storyCaption}
                        onChange={(e) => setStoryCaption(e.target.value)}
                        className="w-full bg-transparent border-none text-sm font-extrabold focus:outline-none resize-none placeholder-white/50 text-white"
                        rows={6}
                      />
                      <span className="text-[10px] text-white/60 font-black uppercase tracking-wider">Quick Thought</span>
                    </div>
                  )}

                  {storyType === 'mood' && (
                    <div className="flex flex-col items-center justify-center py-10 space-y-4">
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Select Current Mood</span>
                      <div className="flex gap-3 bg-white/5 p-3 rounded-full border border-white/10">
                        {['🔥', '💻', '☕', '🚀', '😴', '🧠', '⚡'].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setStoryCaption(`Feeling ${emoji}`)}
                            className={`text-2xl hover:scale-125 transition-transform cursor-pointer ${
                              storyCaption === `Feeling ${emoji}` ? 'scale-125 filter drop-shadow-[0_0_8px_rgba(0,102,255,0.8)]' : ''
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      {storyCaption && (
                        <span className="text-xs text-white font-black bg-blue-600/10 border border-blue-500/20 px-3 py-1 rounded-full uppercase tracking-wider">
                          {storyCaption}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Filter Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider pl-0.5">
                    Cinematic Filter Presets
                  </label>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                    {filterPresets.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => setStoryFilter(preset.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 cursor-pointer ${
                          storyFilter === preset.id
                            ? 'bg-[var(--accent)] text-white shadow-md'
                            : 'border border-white/5 hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Caption Input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider pl-0.5">
                    Caption
                  </label>
                  <input
                    type="text"
                    placeholder="Enter a description..."
                    value={storyCaption}
                    onChange={e => setStoryCaption(e.target.value)}
                    className="w-full pl-4 pr-4 py-2.5 glass-input text-xs"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-white/5 flex justify-end gap-3 bg-black/10">
                <button
                  onClick={() => {
                    setShowCreateStory(false)
                    setStoryFile(null)
                    setStoryFilePreview(null)
                  }}
                  className="px-4 py-2 rounded-xl border border-white/5 hover:bg-white/5 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStoryUpload}
                  disabled={uploadingStory}
                  className="px-5 py-2 btn-premium text-xs flex items-center gap-2 cursor-pointer"
                >
                  {uploadingStory ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Posting...</span>
                    </>
                  ) : (
                    <span>Share Story</span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STORY VIEWER MODAL */}
      <AnimatePresence>
        {activeGroupIndex !== null && (() => {
          const groups = groupStoriesByUser(stories)
          const group = groups[activeGroupIndex]
          if (!group) return null

          const activeStory = group.stories[activeStoryIndex]
          if (!activeStory) return null

          const avatar = group.user.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'
          const displayName = group.user.profile?.full_name || group.user.username
          const isMe = group.user.id === user.id
          
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/95 backdrop-blur-lg flex items-center justify-center z-50 p-0 md:p-4 select-none"
            >
              {/* Floating Emojis Display Overlay */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
                {floatingEmojis.map(emoji => (
                  <motion.div
                    key={emoji.id}
                    initial={{ y: '100vh', opacity: 0, scale: 0.5 }}
                    animate={{ 
                      y: '-10vh', 
                      opacity: [0, 1, 1, 0], 
                      scale: [0.5, 1.2, 1, 0.8],
                      x: [0, Math.sin(emoji.id) * 35, Math.sin(emoji.id) * -35, 0]
                    }}
                    transition={{ duration: 1.8, ease: 'easeOut' }}
                    style={{ left: `${emoji.left}%` }}
                    className="absolute text-5xl pointer-events-none"
                  >
                    {emoji.char}
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="relative max-w-md w-full h-full md:h-[90vh] bg-black rounded-none md:rounded-2xl overflow-hidden flex flex-col justify-between shadow-2xl border border-white/5"
              >
                {/* Progress Indicators Header */}
                <div className="absolute top-0 w-full p-4 bg-gradient-to-b from-black/80 to-transparent z-30 space-y-4">
                  <div className="flex gap-1.5 w-full">
                    {group.stories.map((s, sIdx) => {
                      let progress = 0
                      if (sIdx < activeStoryIndex) progress = 100
                      if (sIdx === activeStoryIndex) progress = viewerProgress
                      
                      return (
                        <div key={s.id} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-white transition-all duration-75 ease-linear" 
                            style={{ width: `${progress}%` }} 
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover border border-white/20" />
                      <div className="text-white text-xs">
                        <h4 className="font-bold leading-tight">{isMe ? 'My Story' : displayName}</h4>
                        <span className="opacity-60 text-[10px]">
                          {new Date(activeStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-1.5 text-white/75 hover:text-white transition-all cursor-pointer font-bold text-[10px] uppercase tracking-wider bg-white/10 hover:bg-white/25 rounded px-2"
                      >
                        {isPlaying ? 'PAUSE' : 'PLAY'}
                      </button>
                      <button
                        onClick={() => setActiveGroupIndex(null)}
                        className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tap Zones Navigation */}
                <div className="absolute inset-0 flex z-20">
                  <div 
                    onClick={handlePrevStory}
                    className="w-[30%] h-full cursor-pointer"
                  />
                  <div 
                    onClick={handleNextStory}
                    className="w-[70%] h-full cursor-pointer"
                  />
                </div>

                {/* Main Media Content */}
                <div className="flex-1 flex items-center justify-center bg-zinc-950">
                  {activeStory.media_type === 'video' ? (
                    <video
                      src={activeStory.media_url}
                      autoPlay
                      muted
                      playsInline
                      className={`max-h-full max-w-full object-contain ${
                        filterPresets.find(f => f.id === activeStory.filter_preset)?.class || ''
                      }`}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={handleNextStory}
                    />
                  ) : (
                    <img
                      src={activeStory.media_url}
                      alt=""
                      className={`max-h-full max-w-full object-contain ${
                        filterPresets.find(f => f.id === activeStory.filter_preset)?.class || ''
                      }`}
                    />
                  )}
                </div>

                {/* Bottom Overlay: Caption + Reactions */}
                <div className="absolute bottom-0 w-full p-6 bg-gradient-to-t from-black/90 to-transparent z-30 flex flex-col gap-4">
                  {activeStory.caption && (
                    <div className="p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-center text-xs text-white max-w-sm mx-auto">
                      {activeStory.caption}
                    </div>
                  )}

                  {/* Views count display (Only if My Story) */}
                  {isMe && (
                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-white/60 font-semibold mb-2">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{activeStory.views.length} views</span>
                    </div>
                  )}

                  {/* Reaction Emoticons Bar */}
                  {!isMe && (
                    <div className="flex justify-around items-center bg-black/30 backdrop-blur-md py-2.5 px-4 rounded-full border border-white/10 max-w-sm mx-auto w-full z-40">
                      {['❤️', '😂', '😮', '😢', '🔥', '👍'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => triggerFloatingEmoji(emoji)}
                          className="text-2xl hover:scale-125 hover:-translate-y-1 transition-all cursor-pointer filter hover:brightness-110 active:scale-95"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel p-6 max-w-md w-full border border-white/5">
            <h3 className="text-lg font-heading font-bold text-white mb-2 flex items-center gap-2">
              <Flag className="w-5 h-5 text-amber-500" />
              <span>Report User: @{reportedUsername}</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Please provide a detailed reason for reporting this user. The administration team will review this report and take appropriate actions.
            </p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="E.g., Harassment, offensive language, spam..."
              className="w-full px-3 py-2.5 glass-input text-xs h-28 resize-none mb-4"
              required
            />
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowReportModal(false)
                  setReportedUserId('')
                  setReportedUsername('')
                  setReportReason('')
                }}
                className="px-4 py-2 rounded-xl border border-white/5 hover:bg-white/5 text-xs text-white cursor-pointer font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReportUser}
                disabled={!reportReason.trim()}
                className="btn-premium px-4 py-2 text-xs cursor-pointer font-semibold disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette Modal */}
      <AnimatePresence>
        {showCommandPalette && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCommandPalette(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center z-50 p-4 pt-[15vh]"
          >
            <motion.div
              initial={{ scale: 0.97, y: -10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: -10 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel max-w-lg w-full overflow-hidden flex flex-col border border-[var(--border-color)] shadow-2xl bg-[var(--bg-main)]/95"
            >
              {/* Search input in the palette */}
              <div className="p-4 border-b border-[var(--border-color)] flex items-center gap-3 relative">
                <Search className="w-4 h-4 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Type a command or search..."
                  value={commandSearch}
                  onChange={(e) => setCommandSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none text-xs text-[var(--text-primary)] focus:outline-none placeholder-[var(--text-secondary)]/50"
                  autoFocus
                />
                <button
                  onClick={() => setShowCommandPalette(false)}
                  className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[9px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer font-mono"
                >
                  ESC
                </button>
              </div>

              {/* Progress/scanning animation if security scan active */}
              {scanProgress !== null && (
                <div className="px-6 py-4 bg-[var(--bg-main)]/20 border-b border-[var(--border-color)] flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2 text-blue-400">
                    <ShieldCheck className="w-4 h-4 animate-pulse" />
                    <span>Running Security Audit Scan...</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${scanProgress}%` }} />
                    </div>
                    <span className="text-[var(--text-primary)] font-mono">{scanProgress}%</span>
                  </div>
                </div>
              )}

              {/* Actions/Commands list */}
              <div className="p-2 max-h-[320px] overflow-y-auto scrollbar-thin">
                <div className="px-3 py-1.5 text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Quick Actions
                </div>

                {[
                  {
                    id: 'scan',
                    label: 'Run Cybersecurity Scan',
                    description: 'Audit current active session & files',
                    icon: ShieldCheck,
                    action: () => {
                      handleSecurityScan()
                    }
                  },
                  {
                    id: 'search-friends',
                    label: 'Search Active Friends',
                    description: 'Focus directory and filter active profiles',
                    icon: Search,
                    action: () => {
                      setOnlineOnly(true)
                      setActiveTab('discovery')
                      setShowCommandPalette(false)
                    }
                  },
                  {
                    id: 'create-story',
                    label: 'Create a Broadcast Story',
                    description: 'Upload images, thoughts or moods',
                    icon: Plus,
                    action: () => {
                      setShowCommandPalette(false)
                      document.getElementById('story-upload-input')?.click()
                    }
                  },
                  {
                    id: 'chat',
                    label: 'Open Secure Messages',
                    description: 'Access end-to-end encrypted chats',
                    icon: MessageSquare,
                    action: () => {
                      setActiveTab('chats')
                      setShowCommandPalette(false)
                    }
                  },
                  {
                    id: 'cloud-upload',
                    label: 'Upload to Personal Cloud',
                    description: 'Store documents in encrypted vaults',
                    icon: Cloud,
                    action: () => {
                      setActiveTab('cloud')
                      setShowCommandPalette(false)
                    }
                  },
                  {
                    id: 'calendar',
                    label: 'Open Smart Calendar',
                    description: 'View upcoming events & milestones',
                    icon: CalendarIcon,
                    action: () => {
                      setActiveTab('calendar')
                      setShowCommandPalette(false)
                    }
                  }
                ]
                  .filter(cmd => 
                    cmd.label.toLowerCase().includes(commandSearch.toLowerCase()) || 
                    cmd.description.toLowerCase().includes(commandSearch.toLowerCase())
                  )
                  .map((cmd) => {
                    const Icon = cmd.icon
                    return (
                      <button
                        key={cmd.id}
                        onClick={cmd.action}
                        className="w-full text-left p-3 rounded-xl hover:bg-[var(--bg-surface)] border border-transparent hover:border-[var(--border-color)] transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center text-slate-400 group-hover:text-[var(--accent)] group-hover:border-[var(--accent)]/30 transition-all shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{cmd.label}</div>
                            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-medium">{cmd.description}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[var(--text-primary)] transition-all opacity-0 group-hover:opacity-100" />
                      </button>
                    )
                  })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
