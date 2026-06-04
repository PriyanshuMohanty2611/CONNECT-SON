import React, { useState, useRef, useEffect } from 'react'
import { Bell, Check, X, MessageSquare, UserPlus, UserCheck, Heart, Trash2, Clock } from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'
import type { Notification } from '../context/NotificationContext'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'

export const NotificationsPopover: React.FC = () => {
  const navigate = useNavigate()
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, fetchNotifications } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

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
    e.stopPropagation() // Prevent triggering parent notification click
    if (!notif.target_id) return

    const endpoint = `/friends/${action}/${notif.target_id}`
    const { error } = await api.post(endpoint)
    
    if (!error) {
      // Mark as read and delete this friend request notification
      await markAsRead(notif.id)
      await deleteNotification(notif.id)
      // Trigger reload of notifications and potentially current page states
      fetchNotifications()
    }
  }

  const getNotifDetails = (notif: Notification) => {
    const name = notif.sender?.profile?.full_name || notif.sender?.username || 'Someone'
    
    switch (notif.type) {
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

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer ${
          isOpen ? 'bg-[var(--border-color)] text-white' : 'text-[var(--text-secondary)] hover:text-white'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-md shadow-rose-500/20 scale-110">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 max-h-[460px] glass-panel border border-[var(--border-color)] flex flex-col z-50 overflow-hidden shadow-2xl scale-100 origin-top-right transition-all">
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

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-color)] max-h-[320px] scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-secondary)]">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-[var(--text-secondary)]" />
                <p className="text-xs font-semibold">No notifications yet</p>
                <p className="text-[10px] opacity-75 mt-0.5">We'll alert you when something happens!</p>
              </div>
            ) : (
              notifications.map((notif) => {
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
