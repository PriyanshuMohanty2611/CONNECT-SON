import React, { useState, useRef, useEffect } from 'react'
import { Bell, Check, X, MessageSquare, UserPlus, UserCheck, Heart, Trash2, Clock, ShieldAlert } from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'
import type { Notification } from '../context/NotificationContext'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'

export const NotificationsPopover: React.FC = () => {
  const navigate = useNavigate()
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, fetchNotifications } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<'all' | 'security' | 'social' | 'system'>('all')
  const popoverRef = useRef<HTMLDivElement>(null)

  // Demo mode state
  const [demoMode, setDemoMode] = useState(false)
  useEffect(() => {
    const checkDemo = () => {
      setDemoMode(localStorage.getItem('connecton_demo_mode') === 'true')
    }
    checkDemo()
    window.addEventListener('storage', checkDemo)
    const interval = setInterval(checkDemo, 1000)
    return () => {
      window.removeEventListener('storage', checkDemo)
      clearInterval(interval)
    }
  }, [])

  // Format date helper
  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      
      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  // Handle outside click to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  const handleNotificationClick = async (notif: Notification) => {
    if (notif.id.startsWith('demo-')) return // Ignore click actions for demo items
    if (!notif.is_read) {
      await markAsRead(notif.id)
    }
    
    // Action-specific navigation
    if (notif.type === 'new_message' || notif.type === 'reaction') {
      setIsOpen(false)
      navigate('/chats')
    }
  }

  const handleFriendAction = async (e: React.MouseEvent, notif: Notification, action: 'accept' | 'reject') => {
    e.stopPropagation()
    if (notif.id.startsWith('demo-')) return
    if (!notif.target_id) return

    const endpoint = `/friends/${action}/${notif.target_id}`
    const { error } = await api.post(endpoint)
    
    if (!error) {
      await markAsRead(notif.id)
      await deleteNotification(notif.id)
      fetchNotifications()
    }
  }

  // Generate high-fidelity demo notifications when demoMode is active
  const demoNotifications: any[] = demoMode ? [
    {
      id: 'demo-sec-1',
      type: 'security_alert',
      sender_id: 'system',
      receiver_id: 'me',
      is_read: false,
      created_at: new Date(Date.now() - 3 * 60000).toISOString(),
      sender: {
        id: 'system',
        username: 'security_bot',
        profile: {
          full_name: 'Shield Gate',
          avatar_url: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?q=80&w=100'
        }
      }
    },
    {
      id: 'demo-match-1',
      type: 'relation_match',
      sender_id: 'amit',
      receiver_id: 'me',
      is_read: false,
      created_at: new Date(Date.now() - 14 * 60000).toISOString(),
      sender: {
        id: 'amit',
        username: 'amit_kumar',
        profile: {
          full_name: 'Amit Kumar',
          avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=100'
        }
      }
    },
    {
      id: 'demo-sys-1',
      type: 'system_alert',
      sender_id: 'system',
      receiver_id: 'me',
      is_read: true,
      created_at: new Date(Date.now() - 45 * 60000).toISOString(),
      sender: {
        id: 'system',
        username: 'system_core',
        profile: {
          full_name: 'Core System',
          avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100'
        }
      }
    }
  ] : []

  const getNotifDetails = (notif: Notification) => {
    const name = notif.sender?.profile?.full_name || notif.sender?.username || 'Someone'
    
    switch (notif.type) {
      case 'security_alert':
        return {
          icon: <ShieldAlert className="w-4 h-4 text-amber-500" />,
          text: (
            <span>
              <strong className="text-white">New login approved</strong> from Singapore (IP: 182.56.24.12)
            </span>
          ),
          hasActions: false
        }
      case 'relation_match':
        return {
          icon: <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />,
          text: (
            <span>
              New relationship synergy match with <strong className="text-white">{name}</strong> (92%).
            </span>
          ),
          hasActions: false
        }
      case 'system_alert':
        return {
          icon: <Clock className="w-4 h-4 text-blue-400" />,
          text: (
            <span>
              Upcoming event: <strong className="text-white">Startup Launch Party</strong> in 30 mins.
            </span>
          ),
          hasActions: false
        }
      case 'friend_request':
        return {
          icon: <UserPlus className="w-4 h-4 text-indigo-400" />,
          text: (
            <span>
              <strong className="text-white">{name}</strong> sent you a friend request.
            </span>
          ),
          hasActions: true
        }
      case 'friend_accept':
        return {
          icon: <UserCheck className="w-4 h-4 text-emerald-400" />,
          text: (
            <span>
              <strong className="text-white">{name}</strong> accepted your friend request.
            </span>
          ),
          hasActions: false
        }
      case 'new_message':
        return {
          icon: <MessageSquare className="w-4 h-4 text-sky-400" />,
          text: (
            <span>
              New message from <strong className="text-white">{name}</strong>.
            </span>
          ),
          hasActions: false
        }
      case 'reaction':
        return {
          icon: <Heart className="w-4 h-4 text-pink-400 animate-pulse" />,
          text: (
            <span>
              <strong className="text-white">{name}</strong> reacted to your message.
            </span>
          ),
          hasActions: false
        }
      default:
        return {
          icon: <Bell className="w-4 h-4 text-slate-400" />,
          text: <span>New notification.</span>,
          hasActions: false
        }
    }
  }

  const getCategory = (type: string) => {
    if (type === 'security_alert') return 'security'
    if (type === 'system_alert') return 'system'
    return 'social'
  }

  const combinedNotifications = [...demoNotifications, ...notifications]
  
  const filteredNotifications = combinedNotifications.filter(n => {
    if (activeCategory === 'all') return true
    return getCategory(n.type) === activeCategory
  })

  const displayUnreadCount = unreadCount + demoNotifications.filter(n => !n.is_read).length

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer ${
          isOpen ? 'bg-[var(--border-color)] text-white' : 'text-[var(--text-secondary)] hover:text-white'
        }`}
      >
        <Bell className="w-4 h-4" />
        {displayUnreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-md shadow-rose-500/20 scale-110">
            {displayUnreadCount > 9 ? '9+' : displayUnreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 max-h-[500px] glass-panel border border-[var(--border-color)] flex flex-col z-50 overflow-hidden shadow-2xl scale-100 origin-top-right transition-all">
          {/* Header */}
          <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between bg-black/20">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] font-bold text-[var(--accent)] hover:text-[var(--text-primary)] transition-all cursor-pointer uppercase tracking-wider"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex border-b border-[var(--border-color)] bg-black/10 px-2 py-1.5 gap-1 shrink-0">
            {(['all', 'security', 'social', 'system'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-1 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-blue-600/20 border border-blue-500/35 text-white'
                    : 'text-[var(--text-secondary)] hover:text-white border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-color)] max-h-[300px] scrollbar-thin">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-secondary)]">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-[var(--text-secondary)]" />
                <p className="text-xs font-semibold">No notifications found</p>
                <p className="text-[10px] opacity-75 mt-0.5">Filter category is currently empty!</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const details = getNotifDetails(notif)
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 flex gap-3 cursor-pointer hover:bg-white/3 transition-all ${
                      !notif.is_read ? 'bg-[var(--accent)]/5 border-l-2 border-l-[var(--accent)]' : ''
                    }`}
                  >
                    {/* Avatar / Icon */}
                    <div className="relative flex-shrink-0">
                      <img
                        src={notif.sender?.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover border border-[var(--border-color)]"
                      />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center shadow">
                        {details.icon}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-xs text-[var(--text-primary)] leading-normal break-words">
                        {details.text}
                      </div>
                      
                      <div className="flex items-center gap-1 text-[9px] text-[var(--text-secondary)] font-medium">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatTime(notif.created_at)}</span>
                      </div>

                      {/* Action buttons (Friend Request) */}
                      {details.hasActions && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={(e) => handleFriendAction(e, notif, 'accept')}
                            className="flex-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm shadow-emerald-500/10"
                          >
                            <Check className="w-3 h-3" />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={(e) => handleFriendAction(e, notif, 'reject')}
                            className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 text-[10px] font-bold transition-all flex items-center justify-center cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Delete button */}
                    {!notif.id.startsWith('demo-') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNotification(notif.id)
                        }}
                        className="p-1 rounded-md text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 transition-all self-start cursor-pointer opacity-0 group-hover:opacity-100 md:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-black/10 border-t border-[var(--border-color)] text-center">
            <button
              onClick={() => setIsOpen(false)}
              className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer uppercase tracking-wider"
            >
              Close Panel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
