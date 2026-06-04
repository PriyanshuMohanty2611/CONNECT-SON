import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../services/api'
import { useSocket } from './SocketContext'
import { useAuth } from './AuthContext'

export interface Notification {
  id: string
  user_id: string
  type: 'friend_request' | 'friend_accept' | 'new_message' | 'reaction' | 'profile_visit'
  sender_id?: string | null
  target_id?: string | null
  is_read: boolean
  created_at: string
  sender?: {
    id: string
    username: string
    email: string
    profile?: {
      full_name: string
      avatar_url: string | null
    } | null
  } | null
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (id: string) => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const { socket } = useSocket()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const fetchNotifications = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await api.get<Notification[]>('/notifications/')
    if (data && !error) {
      setNotifications(data)
    }
    setLoading(false)
  }

  const markAsRead = async (id: string) => {
    const { error } = await api.put<Notification>(`/notifications/${id}/read`)
    if (!error) {
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      )
    }
  }

  const markAllAsRead = async () => {
    const { error } = await api.put('/notifications/read-all')
    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    }
  }

  const deleteNotification = async (id: string) => {
    const { error } = await api.delete(`/notifications/${id}`)
    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }
  }

  // Load notifications initially
  useEffect(() => {
    if (user) {
      fetchNotifications()
    } else {
      setNotifications([])
    }
  }, [user])

  // WebSocket real-time updates
  useEffect(() => {
    if (!socket) return

    const handleNewNotification = (notif: Notification) => {
      console.log('Received new notification via socket:', notif)
      setNotifications(prev => [notif, ...prev])
      
      // Optional: Browser notification or play sound
      if (Notification.permission === 'granted') {
        let title = 'New Notification'
        let body = ''
        const senderName = notif.sender?.profile?.full_name || notif.sender?.username || 'Someone'

        if (notif.type === 'friend_request') {
          title = 'Friend Request'
          body = `${senderName} sent you a friend request.`
        } else if (notif.type === 'friend_accept') {
          title = 'Friend Request Accepted'
          body = `${senderName} accepted your friend request.`
        } else if (notif.type === 'new_message') {
          title = 'New Message'
          body = `${senderName} sent you a message.`
        } else if (notif.type === 'reaction') {
          title = 'New Reaction'
          body = `${senderName} reacted to your message.`
        }

        new window.Notification(title, {
          body,
          icon: notif.sender?.profile?.avatar_url || '/favicon.ico'
        })
      }
    }

    socket.on('new_notification', handleNewNotification)

    return () => {
      socket.off('new_notification', handleNewNotification)
    }
  }, [socket])

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && window.Notification.permission === 'default') {
      window.Notification.requestPermission()
    }
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}
