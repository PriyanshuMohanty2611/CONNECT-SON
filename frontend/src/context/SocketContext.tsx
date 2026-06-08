import React, { createContext, useContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { getTokens, API_HOST_URL } from '../services/api'

interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
  onlineStatuses: Record<string, string> // maps user_id -> status ('online', 'away', 'busy', 'offline')
  updateMyPresence: (status: 'online' | 'away' | 'busy' | 'invisible') => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, string>>({})

  useEffect(() => {
    // Only connect if user is authenticated
    if (!user) {
      if (socket) {
        socket.disconnect()
        setSocket(null)
        setIsConnected(false)
      }
      return
    }

    const { access } = getTokens()
    if (!access) return

    // Initialize Socket.IO connection
    // WS endpoint matches the backend ASGI mount path
    const newSocket = io(API_HOST_URL, {
      path: '/ws',
      auth: {
        token: access
      },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    newSocket.on('connect', () => {
      setIsConnected(true)
      console.log('Socket.IO connected successfully!')
    })

    newSocket.on('disconnect', () => {
      setIsConnected(false)
      console.log('Socket.IO disconnected.')
    })

    // Listen to real-time presence changes
    newSocket.on('presence_change', (data: { user_id: string; status: string }) => {
      setOnlineStatuses(prev => ({
        ...prev,
        [data.user_id]: data.status
      }))
    })

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [user])

  const updateMyPresence = (status: 'online' | 'away' | 'busy' | 'invisible') => {
    if (socket && isConnected) {
      socket.emit('update_presence', { status }, (response: any) => {
        if (response && !response.error) {
          console.log(`Presence updated to: ${status}`)
        }
      })
    }
  }

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        onlineStatuses,
        updateMyPresence
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
