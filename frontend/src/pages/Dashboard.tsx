import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, Filter, MessageSquare, Settings as SettingsIcon, 
  LogOut, ShieldAlert, Sparkles, UserPlus, UserCheck, UserX,
  Clock, RefreshCw, Smile, Image as ImageIcon, MapPin, Grid,
  X, Eye, Flag, Gamepad2, Heart, Calendar as CalendarIcon, 
  FileText, Cloud, ShieldCheck, Activity, Plus, Users
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { UserProfile } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { api } from '../services/api'
import { NotificationsPopover } from '../components/NotificationsPopover'

import GamingHub from './GamingHub'
import RelationshipHub from './RelationshipHub'
import SmartCalendar from './SmartCalendar'
import NotesHub from './NotesHub'
import ProductivityHub from './ProductivityHub'
import PersonalCloud from './PersonalCloud'
import SecurityHub from './SecurityHub'

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

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, logout } = useAuth()
  const { onlineStatuses } = useSocket()
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    (location.state as any)?.tab || 'discovery'
  )

  // Real-time Clock
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Dynamic Greeting by time of day
  const getGreeting = () => {
    const hours = time.getHours()
    if (hours < 12) return 'Good Morning'
    if (hours < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login')
    }
  }, [user, authLoading, navigate])
  
  // Discovery State
  const [discoverUsers, setDiscoverUsers] = useState<DiscoverUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stories State
  const [stories, setStories] = useState<Story[]>([])
  const [loadingStories, setLoadingStories] = useState(true)
  
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
  const loadUsers = async () => {
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
  }

  // Trigger search on query or filter toggle
  useEffect(() => {
    if (user) {
      const delayDebounce = setTimeout(() => {
        loadUsers()
      }, 300)
      return () => clearTimeout(delayDebounce)
    }
  }, [searchQuery, onlineOnly, user])

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

    const { error: apiErr } = await api.post('/stories/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

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
    const groups = groupStoriesByUser(stories)
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
      const groups = groupStoriesByUser(stories)
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
    const groups = groupStoriesByUser(stories)
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
  }, [activeGroupIndex, activeStoryIndex, isPlaying, stories])

  const handleAddFriend = async (receiverId: string) => {
    const { error: apiErr } = await api.post(`/friends/request/${receiverId}`)
    if (!apiErr) {
      loadUsers()
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    const { error: apiErr } = await api.post(`/friends/accept/${requestId}`)
    if (!apiErr) {
      loadUsers()
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    const { error: apiErr } = await api.post(`/friends/reject/${requestId}`)
    if (!apiErr) {
      loadUsers()
    }
  }

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
      <aside className="w-64 h-full glass-panel rounded-none border-y-0 border-l-0 flex flex-col justify-between p-6 z-20 flex-shrink-0 bg-black/40 backdrop-blur-[40px]">
        <div className="space-y-8">
          <div className="flex items-center gap-3 px-2 cursor-pointer" onClick={() => setActiveTab('discovery')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[var(--accent)] to-fuchsia-500 flex items-center justify-center shadow-lg shadow-[var(--accent-glow)] transform transition-transform hover:scale-105 active:scale-95">
              <Sparkles className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-wider text-[var(--accent)] glow-text leading-none font-heading">CONNECT-ON</h1>
              <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest leading-none block mt-1">Digital Memory OS</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('discovery')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'discovery' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Grid className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Home Feed</span>
              </div>
            </button>

            <button
              onClick={() => {
                setActiveTab('chats')
                navigate('/chats')
              }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group hover:bg-white/5 text-[var(--text-secondary)] hover:text-white"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Secure Chats</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[var(--accent)] text-white text-[8px] font-black scale-90">3</span>
            </button>

            <button
              onClick={() => setActiveTab('stories')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'stories' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Stories</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-fuchsia-500 text-white text-[8px] font-black scale-90">{stories.length}</span>
            </button>

            <div className="h-px bg-white/5 my-3" />

            <button
              onClick={() => setActiveTab('gaming')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'gaming' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Gamepad2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Gaming Hub</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-bold mr-1">Live</span>
            </button>

            <button
              onClick={() => setActiveTab('relationship')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'relationship' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Heart className="w-4 h-4 group-hover:scale-110 transition-transform text-rose-500" />
                <span>Relationship Hub</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'calendar' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Smart Calendar</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('notes')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'notes' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Collaborative Notes</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('productivity')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'productivity' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Productivity Hub</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('cloud')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'cloud' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Cloud className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Personal Cloud</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                activeTab === 'security' 
                  ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-glow)]' 
                  : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Security Hub</span>
              </div>
            </button>

            <div className="h-px bg-white/5 my-3" />

            <button
              onClick={() => {
                setActiveTab('settings')
                navigate('/settings')
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer hover:bg-white/5 text-[var(--text-secondary)] hover:text-white"
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Settings</span>
            </button>

            {user.is_admin && (
              <button
                onClick={() => {
                  setActiveTab('admin')
                  navigate('/admin')
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer hover:bg-rose-500/10 text-rose-400 hover:text-rose-300"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Admin Panel</span>
              </button>
            )}
          </nav>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-4">
          <div className="flex items-center justify-between bg-white/3 border border-white/5 p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Streak</span>
            </div>
            <span className="text-[11px] font-black text-white bg-gradient-to-r from-orange-500 to-amber-400 px-2 py-0.5 rounded-full shadow-md shadow-orange-500/20">7 🔥</span>
          </div>

          <div className="flex items-center gap-3 px-1">
            <div className="relative">
              <img 
                src={user.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
                alt="My Profile" 
                className="w-10 h-10 rounded-full object-cover border border-[var(--accent)]"
              />
              <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--bg-main)]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-extrabold truncate leading-tight">{user.profile?.full_name || user.username}</h4>
              <p className="text-[10px] text-[var(--text-secondary)] truncate">@{user.username}</p>
            </div>
          </div>

          <button 
            onClick={logout}
            className="w-full py-2.5 rounded-xl border border-white/5 hover:bg-rose-500/10 hover:border-rose-500/20 text-rose-500 text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CANVAS */}
      <main className="flex-1 h-full flex flex-col z-10 overflow-hidden bg-black/10">
        {/* PREMIUM COMMAND CENTER TOP BAR */}
        <header className="h-18 border-b border-white/5 px-8 flex items-center justify-between flex-shrink-0 bg-black/30 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block leading-none">{getGreeting()}</span>
              <span className="text-sm font-extrabold text-white leading-none mt-1 block">
                {user.profile?.full_name || user.username} ✨
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
              className="w-full pl-9 pr-4 py-2 glass-input text-xs border-white/5 rounded-full"
            />
          </div>

          <div className="flex items-center gap-4">
            {/* Live Weather Card */}
            <div className="hidden lg:flex items-center gap-2 bg-white/3 border border-white/5 rounded-full px-3 py-1.5 text-[10px] font-bold">
              <span className="text-yellow-400">☀️</span>
              <span className="text-white">24°C Sunny</span>
            </div>

            {/* Live Clock Card */}
            <div className="hidden sm:flex items-center gap-2 bg-white/3 border border-white/5 rounded-full px-3 py-1.5 text-[10px] font-bold">
              <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-white font-mono">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>

            {/* Quick Create Button */}
            <button 
              onClick={() => document.getElementById('story-upload-input')?.click()}
              className="px-3.5 py-1.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-black transition-all flex items-center gap-1.5 shadow-md shadow-[var(--accent-glow)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>

            {/* Notification triggers */}
            <NotificationsPopover />

            {/* User Presence Ring */}
            <div className="text-[10px] px-3 py-1.5 rounded-full bg-white/3 border border-white/5 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{user.profile?.presence_status || 'online'}</span>
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
                  <section className="bg-white/3 border border-white/5 p-5 rounded-3xl space-y-4 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold text-white uppercase tracking-wider pl-1">Stories Broadcast</h3>
                      <span className="text-[10px] font-bold text-[var(--accent)]">Disappears in 24h</span>
                    </div>
                    
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                      <div 
                        onClick={() => document.getElementById('story-upload-input')?.click()}
                        className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0"
                      >
                        <input 
                          type="file" 
                          accept="image/*,video/*" 
                          onChange={handleFileSelect} 
                          className="hidden" 
                          id="story-upload-input" 
                        />
                        <div className="relative w-15 h-15 rounded-full p-[2px] bg-gradient-to-tr from-white/10 to-white/10 flex items-center justify-center">
                          <div className="w-full h-full rounded-full bg-black/40 flex items-center justify-center border border-white/5 hover:border-[var(--accent)] transition-all">
                            <Plus className="w-5 h-5 text-[var(--accent)]" />
                          </div>
                          <div className="absolute bottom-0 right-0 w-4.5 h-4.5 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[10px] font-black border-2 border-[var(--bg-main)]">+</div>
                        </div>
                        <span className="text-[9px] font-bold text-[var(--text-secondary)]">Add Story</span>
                      </div>

                      {groupStoriesByUser(stories).map((group, idx) => {
                        const isUnviewed = group.stories.some(story => !story.views.some(view => view.viewer_id === user.id))
                        const avatar = group.user.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'
                        const displayName = group.user.profile?.full_name || group.user.username
                        const isMe = group.user.id === user.id
                        
                        return (
                          <div 
                            key={group.user.id} 
                            onClick={() => {
                              setActiveGroupIndex(idx)
                              setActiveStoryIndex(0)
                              setIsPlaying(true)
                              setViewerProgress(0)
                              if (!isMe) {
                                logStoryView(group.stories[0].id)
                              }
                            }}
                            className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0"
                          >
                            <div className={`w-15 h-15 rounded-full p-[2px] bg-gradient-to-tr ${
                              isUnviewed 
                                ? 'from-pink-500 via-[var(--accent)] to-yellow-500' 
                                : 'from-white/10 to-white/10'
                            } flex items-center justify-center transform transition-transform hover:scale-105`}>
                              <img 
                                src={avatar} 
                                alt="" 
                                className="w-full h-full rounded-full object-cover border-2 border-slate-950"
                              />
                            </div>
                            <span className="text-[9px] font-bold text-[var(--text-secondary)] text-center w-16 truncate">
                              {isMe ? 'My Story' : displayName}
                            </span>
                          </div>
                        )
                      })}

                      {loadingStories && stories.length === 0 && (
                        <div className="flex gap-4">
                          {[1, 2, 3].map(n => (
                            <div key={n} className="flex flex-col items-center gap-2 animate-pulse">
                              <div className="w-15 h-15 rounded-full bg-white/5 border border-white/5" />
                              <div className="w-10 h-2 bg-white/5 rounded" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Discover People Section */}
                  <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/3 border border-white/5 p-5 rounded-3xl backdrop-blur-md">
                      <div>
                        <h2 className="text-lg font-heading font-extrabold text-white">Social Network Directory</h2>
                        <p className="text-[var(--text-secondary)] text-xs">Discover verified users and link encryption profiles.</p>
                      </div>

                      <div className="flex w-full sm:w-auto gap-3 flex-shrink-0">
                        <button 
                          onClick={() => setOnlineOnly(!onlineOnly)}
                          className={`px-4 py-2 rounded-full border text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${
                            onlineOnly 
                              ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-md' 
                              : 'border-white/5 hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
                          }`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                          <span>Online Only</span>
                        </button>
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
                    ) : discoverUsers.length === 0 ? (
                      <div className="text-center py-16 border border-dashed border-white/5 rounded-3xl p-8 glass-card bg-white/3">
                        <UserPlus className="w-10 h-10 text-[var(--text-secondary)] mx-auto mb-4 opacity-50" />
                        <h4 className="font-extrabold text-sm mb-1 text-white">No active matches found</h4>
                        <p className="text-[10px] text-[var(--text-secondary)] max-w-xs mx-auto">Try typing a different name or clearing filters.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <AnimatePresence>
                          {discoverUsers.map((item, idx) => {
                            const currentStatus = onlineStatuses[item.id] || item.profile?.presence_status || 'offline'
                            return (
                              <motion.div
                                key={item.id}
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                transition={{ duration: 0.3, delay: idx * 0.03 }}
                                className="glass-card overflow-hidden group flex flex-col justify-between hover:border-[var(--accent)] transition-all duration-300 bg-white/3 border-white/5"
                              >
                                <div className="h-24 w-full relative bg-slate-900 overflow-hidden">
                                  <button
                                    onClick={() => {
                                      setReportedUserId(item.id)
                                      setReportedUsername(item.username)
                                      setShowReportModal(true)
                                    }}
                                    className="absolute top-3 left-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 border border-white/10 text-white cursor-pointer z-20 transition-transform hover:scale-105"
                                    title="Report User"
                                  >
                                    <Flag className="w-3 h-3 text-amber-400" />
                                  </button>

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

                                <div className="p-5 text-center relative flex-1 flex flex-col justify-between">
                                  <div className="w-16 h-16 rounded-full border-4 border-slate-950 shadow-md overflow-hidden mx-auto mt-[-40px] relative z-10 bg-[var(--bg-card)]">
                                    <img 
                                      src={item.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
                                      alt={item.username} 
                                      className="w-full h-full object-cover group-hover:scale-105 transition-all"
                                    />
                                  </div>

                                  <div className="mt-2.5 flex-1 flex flex-col justify-between">
                                    <div>
                                      <h4 className="font-extrabold text-sm text-white hover:text-[var(--accent)] transition-all truncate">
                                        {item.profile?.full_name || item.username}
                                      </h4>
                                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">@{item.username}</p>
                                      
                                      <p className="text-[11px] text-[var(--text-secondary)] mt-3 line-clamp-2 px-1 leading-relaxed">
                                        {item.profile?.bio || 'Connect-On security user.'}
                                      </p>
                                    </div>

                                    {item.profile?.country && (
                                      <div className="mt-4 flex items-center justify-center gap-1 text-[9px] font-black text-[var(--text-secondary)]">
                                        <MapPin className="w-3 h-3 text-rose-500" />
                                        <span className="uppercase tracking-wider">{item.profile.country}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-4 pt-4 border-t border-white/5">
                                    {item.relationship_status === 'none' && (
                                      <button 
                                        onClick={() => handleAddFriend(item.id)}
                                        className="w-full py-2 rounded-xl border border-white/5 hover:border-[var(--accent)] hover:bg-[var(--accent-glow)] text-white text-[11px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                      >
                                        <UserPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                                        <span>Add Friend</span>
                                      </button>
                                    )}

                                    {item.relationship_status === 'pending_sent' && (
                                      <div className="w-full py-2 rounded-xl bg-white/5 text-[var(--text-secondary)] text-[11px] font-bold flex items-center justify-center gap-2">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Pending Request</span>
                                      </div>
                                    )}

                                    {item.relationship_status === 'pending_received' && (
                                      <div className="w-full flex gap-2">
                                        <button 
                                          onClick={() => handleAcceptRequest(item.request_id || '')}
                                          className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                          <UserCheck className="w-3.5 h-3.5" />
                                          <span>Accept</span>
                                        </button>
                                        <button 
                                          onClick={() => handleRejectRequest(item.request_id || '')}
                                          className="px-3 py-2 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 text-xs font-bold transition-all flex items-center justify-center cursor-pointer"
                                        >
                                          <UserX className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}

                                    {item.relationship_status === 'friends' && (
                                      <button 
                                        onClick={() => navigate('/chats')}
                                        className="w-full py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[var(--accent-glow)]"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        <span>Chat Securely</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </section>
                </div>

                {/* Right Side Social Signals & Live Activity Feed */}
                <div className="space-y-8 lg:col-span-1">
                  
                  {/* Dynamic Relationship Card */}
                  <section className="bg-white/3 border border-white/5 p-5 rounded-3xl backdrop-blur-md space-y-4">
                    <div className="flex items-center gap-2">
                      <Heart className="w-4.5 h-4.5 text-rose-500" />
                      <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Friendship Status</h3>
                    </div>
                    
                    <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)] font-semibold">Calculated Synergy</span>
                        <span className="font-extrabold text-rose-400">92% Match</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-rose-500 to-purple-600 rounded-full" style={{ width: '92%' }} />
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                        Interests in dynamic programming, modern UI/UX design, and distributed tracing are highly aligned!
                      </p>
                    </div>

                    <div className="bg-black/20 p-4 rounded-2xl border border-white/5 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[var(--text-secondary)] block font-semibold">Next Anniversary</span>
                        <span className="font-bold text-white block mt-0.5">June 24 (Connect Day)</span>
                      </div>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-full font-black">20d Left</span>
                    </div>
                  </section>

                  {/* Online Friends List */}
                  <section className="bg-white/3 border border-white/5 p-5 rounded-3xl backdrop-blur-md space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4.5 h-4.5 text-[var(--accent)]" />
                        <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Live Activity</h3>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        {getOnlineCount()} Online
                      </span>
                    </div>

                    <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
                      {discoverUsers.filter(u => onlineStatuses[u.id] === 'online').length === 0 ? (
                        <p className="text-[10px] text-[var(--text-secondary)] italic text-center py-4">No friends currently online.</p>
                      ) : (
                        discoverUsers.filter(u => onlineStatuses[u.id] === 'online').map(friend => (
                          <div key={friend.id} className="flex items-center justify-between group cursor-pointer hover:bg-white/3 p-1.5 rounded-xl transition-all">
                            <div className="flex items-center gap-2.5">
                              <div className="relative">
                                <img 
                                  src={friend.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
                                  alt="" 
                                  className="w-8 h-8 rounded-full object-cover border border-white/10"
                                />
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-[11px] font-bold text-white truncate">{friend.profile?.full_name || friend.username}</h4>
                                <span className="text-[9px] text-[var(--text-secondary)] truncate block">Active now</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => navigate('/chats')}
                              className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-[var(--accent)] text-white transition-all transform hover:scale-105 active:scale-95"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* Smart Calendar Quick Panel */}
                  <section className="bg-white/3 border border-white/5 p-5 rounded-3xl backdrop-blur-md space-y-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4.5 h-4.5 text-amber-500" />
                      <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Announcements & Milestones</h3>
                    </div>

                    <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-3 text-xs">
                      <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <h4 className="font-bold text-white">Startup Launch Party</h4>
                          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Tonight at 8:00 PM • Live Stream Room</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <h4 className="font-bold text-white">System Verification Complete</h4>
                          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">CTO Audit check has completed successfully</p>
                        </div>
                      </div>
                    </div>
                  </section>

                </div>
              </div>
            )}

            {activeTab === 'stories' && (
              <section className="space-y-6">
                <div className="bg-white/3 border border-white/5 p-5 rounded-3xl backdrop-blur-md">
                  <h2 className="text-lg font-heading font-extrabold text-white">Active Stories</h2>
                  <p className="text-[var(--text-secondary)] text-xs">View stories posted by your friends within the last 24 hours.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  <div 
                    onClick={() => document.getElementById('story-upload-tab-input')?.click()}
                    className="glass-card p-6 flex flex-col items-center justify-center text-center border-dashed border-2 border-white/5 hover:border-[var(--accent)] transition-all cursor-pointer h-64 bg-white/3"
                  >
                    <input 
                      type="file" 
                      accept="image/*,video/*" 
                      onChange={handleFileSelect} 
                      className="hidden" 
                      id="story-upload-tab-input" 
                    />
                    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center mb-4">
                      <Plus className="w-6 h-6 text-[var(--accent)]" />
                    </div>
                    <h4 className="font-extrabold text-sm mb-1 text-white">Create a Story</h4>
                    <p className="text-[10px] text-[var(--text-secondary)] max-w-[150px]">Share a photo or video that disappears in 24 hours.</p>
                  </div>

                  {groupStoriesByUser(stories).map((group, idx) => {
                    const isUnviewed = group.stories.some(story => !story.views.some(view => view.viewer_id === user.id))
                    const lastStory = group.stories[group.stories.length - 1]
                    const avatar = group.user.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'
                    const displayName = group.user.profile?.full_name || group.user.username
                    const isMe = group.user.id === user.id

                    return (
                      <div
                        key={group.user.id}
                        onClick={() => {
                          setActiveGroupIndex(idx)
                          setActiveStoryIndex(0)
                          setIsPlaying(true)
                          setViewerProgress(0)
                          if (!isMe) {
                            logStoryView(group.stories[0].id)
                          }
                        }}
                        className="glass-card overflow-hidden group flex flex-col justify-between hover:border-[var(--accent)] hover:shadow-lg transition-all duration-300 h-64 bg-white/3 border-white/5"
                      >
                        <div className="h-40 w-full relative bg-slate-900 overflow-hidden">
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
                            <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-[var(--accent)]" />
                            <div className="text-[10px] text-white">
                              <h5 className="font-bold truncate max-w-[120px]">{isMe ? 'My Story' : displayName}</h5>
                              <span className="opacity-75">{group.stories.length} stories</span>
                            </div>
                          </div>

                          {isUnviewed && (
                            <span className="absolute top-3 right-3 text-[8px] bg-rose-500 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              New
                            </span>
                          )}
                        </div>
                        
                        <div className="p-4 flex items-center justify-between bg-black/10 flex-1">
                          <span className="text-[10px] text-[var(--text-secondary)] font-bold">
                            Last active: {new Date(lastStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button className="text-[10px] text-[var(--accent)] hover:text-white font-bold transition-all">
                            View
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {activeTab === 'gaming' && <GamingHub />}
            {activeTab === 'relationship' && <RelationshipHub />}
            {activeTab === 'calendar' && <SmartCalendar />}
            {activeTab === 'notes' && <NotesHub />}
            {activeTab === 'productivity' && <ProductivityHub />}
            {activeTab === 'cloud' && <PersonalCloud />}
            {activeTab === 'security' && <SecurityHub />}
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
                {/* Media Preview */}
                <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center p-2 min-h-60 max-h-96">
                  {storyFile?.type.startsWith('video/') ? (
                    <video 
                      src={storyFilePreview} 
                      controls 
                      muted 
                      className={`max-h-80 max-w-full rounded-lg object-contain ${
                        filterPresets.find(f => f.id === storyFilter)?.class || ''
                      }`} 
                    />
                  ) : (
                    <img 
                      src={storyFilePreview} 
                      alt="Story preview" 
                      className={`max-h-80 max-w-full rounded-lg object-contain ${
                        filterPresets.find(f => f.id === storyFilter)?.class || ''
                      }`} 
                    />
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
    </div>
  )
}
