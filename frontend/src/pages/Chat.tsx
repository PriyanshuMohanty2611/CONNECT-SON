import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, Search, Paperclip, Send, Mic, 
  Settings as SettingsIcon, LogOut, Grid,
  Lock, Check, CheckCheck, SmilePlus, CornerUpLeft, RefreshCw, 
  Smile as EmojiIcon, MessageSquare, Image as ImageIcon,
  UserX, Flag, MoreVertical, Gamepad2, Heart, Calendar as CalendarIcon, 
  FileText, Cloud, ShieldCheck, Activity, Sparkles, Folder, ChevronLeft, ChevronRight, X, Briefcase, Plus, UserPlus,
  Pin, Mail, Phone, ExternalLink
} from 'lucide-react'
import EmojiPicker from 'emoji-picker-react'

import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { api } from '../services/api'
import type { UserProfile } from '../context/AuthContext'
import { NotificationsPopover } from '../components/NotificationsPopover'
import { encryptMessage, decryptMessage } from '../services/crypto'
import Sidebar from '../components/Sidebar'

interface Attachment {
  id: string
  file_url: string
  file_type: string
  file_name: string
  file_size: number
}

interface Reaction {
  id: string
  message_id: string
  user_id: string
  reaction: string
}

interface MessageStatus {
  id: string
  message_id: string
  user_id: string
  status: 'sent' | 'delivered' | 'seen'
}

interface Message {
  id: string
  chat_id: string
  sender_id: string
  encrypted_content: string | null
  nonce: string | null
  is_encrypted: boolean
  reply_to_id: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  attachments: Attachment[]
  reactions: Reaction[]
  statuses: MessageStatus[]
}

interface Chat {
  id: string
  type: string
  created_at: string
  participants: UserProfile[]
  last_message: Message | null
  unread_count: number
}

export default function Chat() {
  const navigate = useNavigate()
  const { user, loading: authLoading, logout } = useAuth()
  const { socket, onlineStatuses } = useSocket()

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login')
    }
  }, [user, authLoading, navigate])

  // Local constants to avoid typescript null warnings
  const currentUserId = user?.id || ''
  const currentUserProfile = user?.profile
  const currentUserUsername = user?.username

  // Chat lists states
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatSearch, setChatSearch] = useState('')

  const [showRightPanel, setShowRightPanel] = useState(true)
  const [communicationMode, setCommunicationMode] = useState<'chat' | 'email'>('chat')
  const [emailSubject, setEmailSubject] = useState('')
  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('connect_on_pinned_chats') || '[]')
    } catch {
      return []
    }
  })

  // Helper to check if a chat is pinned
  const isPinned = (chatId: string) => pinnedChatIds.includes(chatId)

  // Toggle Pinned
  const togglePinChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedChatIds(prev => {
      const updated = prev.includes(chatId) 
        ? prev.filter(id => id !== chatId) 
        : [...prev, chatId]
      localStorage.setItem('connect_on_pinned_chats', JSON.stringify(updated))
      return updated
    })
  }

  // Parse partner workspace details
  const getPartnerWorkspaceInfo = (partner: UserProfile | undefined) => {
    if (!partner?.profile?.bio) return { role: 'Candidate', company: '', linkedin: '', alternatePhone: '', tags: [] }
    const bioText = partner.profile.bio.trim()
    if (bioText.startsWith('{')) {
      try {
        const parsed = JSON.parse(bioText)
        return {
          role: parsed.jobTitle || 'Candidate',
          company: parsed.company || '',
          linkedin: parsed.linkedin || '',
          alternatePhone: parsed.alternatePhone || '',
          tags: parsed.tags || []
        }
      } catch (e) {
        // ignore JSON errors, fallback
      }
    }
    return { role: partner.profile.bio.slice(0, 30) || 'Candidate', company: '', linkedin: '', alternatePhone: '', tags: [] }
  }

  // Helper to format bytes
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // Loading/pagination states
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  
  // Message input states
  const [inputText, setInputText] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [attachmentsToSend, setAttachmentsToSend] = useState<string[]>([]) // uploaded file IDs
  const [attachmentPreviews, setAttachmentPreviews] = useState<any[]>([]) // previews to show in input
  const [showCreatePollModal, setShowCreatePollModal] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])


  // Typing state
  const typingTimeoutRef = useRef<any>(null)
  const [friendIsTyping, setFriendIsTyping] = useState(false)

  // Voice Recording states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<any>(null)

  // Scroll references
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const chatWindowRef = useRef<HTMLDivElement | null>(null)

  // Decryption state & helper
  const [decryptedContents, setDecryptedContents] = useState<Record<string, string>>({})

  const getMessageText = (msg: Message | null) => {
    if (!msg) return ''
    if (msg.is_encrypted) {
      return decryptedContents[msg.id] || '🔒 [Decrypting...]'
    }
    return msg.encrypted_content || ''
  }

  useEffect(() => {
    const decryptAll = async () => {
      const newDecrypted: Record<string, string> = { ...decryptedContents }
      let updated = false

      // Collect all candidate messages to decrypt
      const candidateMessages: Message[] = [...messages]
      chats.forEach(c => {
        if (c.last_message) {
          candidateMessages.push(c.last_message)
        }
      })

      for (const msg of candidateMessages) {
        if (msg.is_encrypted && msg.encrypted_content && !newDecrypted[msg.id]) {
          // Find the chat of this message
          const msgChat = chats.find(c => c.id === msg.chat_id) || selectedChat
          if (!msgChat) continue

          const isMe = msg.sender_id === currentUserId
          let keyToUse = null

          if (isMe) {
            // Decrypt with recipient's public key (the other user in direct chat)
            const partner = msgChat.participants.find(p => p.id !== currentUserId)
            keyToUse = partner?.profile?.public_key
          } else {
            // Decrypt with sender's public key
            const sender = msgChat.participants.find(p => p.id === msg.sender_id)
            keyToUse = sender?.profile?.public_key
          }

          if (keyToUse && msg.nonce) {
            try {
              const decrypted = await decryptMessage(msg.encrypted_content, msg.nonce, keyToUse, currentUserUsername || '')
              newDecrypted[msg.id] = decrypted
              updated = true
            } catch (err) {
              newDecrypted[msg.id] = '🔒 [Decryption failed]'
              updated = true
            }
          } else {
            newDecrypted[msg.id] = '🔒 [Decrypted: missing key]'
            updated = true
          }
        }
      }

      if (updated) {
        setDecryptedContents(newDecrypted)
      }
    }

    if (user) {
      decryptAll()
    }
  }, [messages, chats, selectedChat, currentUserId, currentUserUsername, user])

  // Fetch Chats
  const loadChats = async () => {
    setLoadingChats(true)
    const { data } = await api.get<Chat[]>('/chats/')
    if (data) {
      setChats(data)
    }
    setLoadingChats(false)
  }

  // Fetch Messages for a specific chat (initial)
  const loadMessages = async (chatId: string) => {
    setLoadingMessages(true)
    setHasMoreMessages(true)
    const { data } = await api.get<Message[]>(`/chats/${chatId}/messages?limit=30`)
    if (data) {
      // API returns messages descending (most recent first)
      setMessages(data.reverse())
      if (data.length < 30) {
        setHasMoreMessages(false)
      }
      // Scroll to bottom
      setTimeout(() => scrollToBottom(), 50)
    }
    setLoadingMessages(false)
  }

  // Fetch more messages (pagination on scroll to top)
  const loadMoreMessages = async () => {
    if (loadingMessages || !hasMoreMessages || !selectedChat || messages.length === 0) return

    setLoadingMessages(true)
    const oldestTimestamp = messages[0].created_at
    const { data } = await api.get<Message[]>(
      `/chats/${selectedChat.id}/messages?before=${encodeURIComponent(oldestTimestamp)}&limit=30`
    )

    if (data && data.length > 0) {
      // Store scroll position to prevent jumping
      const chatWindow = chatWindowRef.current
      const prevScrollHeight = chatWindow ? chatWindow.scrollHeight : 0
      const prevScrollTop = chatWindow ? chatWindow.scrollTop : 0

      setMessages(prev => [...data.reverse(), ...prev])
      
      if (data.length < 30) {
        setHasMoreMessages(false)
      }

      // Restore scroll height diff
      setTimeout(() => {
        if (chatWindow) {
          chatWindow.scrollTop = chatWindow.scrollHeight - prevScrollHeight + prevScrollTop
        }
      }, 30)
    } else {
      setHasMoreMessages(false)
    }
    setLoadingMessages(false)
  }

  // Handlers for Scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0) {
      loadMoreMessages()
    }
  }

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load chats on load
  useEffect(() => {
    if (user) {
      loadChats()
    }
  }, [user])

  // Select Chat actions
  const selectChatRoom = (chat: Chat) => {
    setSelectedChat(chat)
    setMessages([])
    setReplyingTo(null)
    setAttachmentsToSend([])
    setAttachmentPreviews([])
    setChatMood(null)
    setSmartReplies([])
    loadMessages(chat.id)
    fetchChatMood(chat.id)

    // Join room on Socket.IO
    if (socket) {
      socket.emit('join_chat', { chat_id: chat.id })
      
      // Mark unread messages in this chat as seen
      setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread_count: 0 } : c))
    }
  }

  // Moderation state & handlers
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false)

  const handleBlockPartner = async () => {
    if (!selectedChat) return
    const partner = getChatPartner(selectedChat)
    if (!partner) return

    if (!window.confirm(`Are you sure you want to block ${partner.profile?.full_name || partner.username}?`)) {
      return
    }

    const { error } = await api.post(`/friends/block/${partner.id}`)
    if (error) {
      alert(error)
    } else {
      alert('User blocked successfully.')
      setSelectedChat(null)
      loadChats()
    }
    setShowOptionsDropdown(false)
  }

  const handleReportPartner = async () => {
    if (!selectedChat || !reportReason.trim()) return
    const partner = getChatPartner(selectedChat)
    if (!partner) return

    const { error } = await api.post(`/users/report`, {
      reported_id: partner.id,
      reason: reportReason.trim()
    })

    if (error) {
      alert(error)
    } else {
      alert('Report submitted successfully.')
      setShowReportModal(false)
      setReportReason('')
    }
    setShowOptionsDropdown(false)
  }

  // AI summary state & handler
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [chatSummary, setChatSummary] = useState('')
  const [loadingSummary, setLoadingSummary] = useState(false)

  // AI Mood & Smart Replies States
  const [chatMood, setChatMood] = useState<{ mood: string; description: string } | null>(null)
  const [smartReplies, setSmartReplies] = useState<string[]>([])

  const fetchChatMood = async (chatId: string) => {
    const { data } = await api.get<{ mood: string; description: string }>(`/chats/${chatId}/mood`)
    if (data) setChatMood(data)
  }

  const translateMsg = async (msgId: string, txt: string, lang: string) => {
    const { data } = await api.post<{ translated_text: string }>('/ai/translate', { text: txt, target_lang: lang })
    if (data) {
      setDecryptedContents(prev => ({
        ...prev,
        [msgId]: data.translated_text
      }))
    }
  }

  // Load Smart Replies on message update
  useEffect(() => {
    if (!selectedChat || messages.length === 0) {
      setSmartReplies([])
      return
    }
    const fetchReplies = async () => {
      const { data } = await api.get<{ replies: string[] }>(`/chats/${selectedChat.id}/smart-reply`)
      if (data) setSmartReplies(data.replies)
    }
    fetchReplies()
  }, [messages, selectedChat])

  const fetchChatSummary = async () => {
    if (!selectedChat) return
    setLoadingSummary(true)
    const { data, error } = await api.get<{ summary: string }>(`/chats/${selectedChat.id}/summary`)
    setLoadingSummary(false)
    if (data) {
      setChatSummary(data.summary)
      setShowSummaryModal(true)
    } else if (error) {
      alert(`Failed to fetch AI summary: ${error}`)
    }
  }

  // Listen to Socket.IO events
  useEffect(() => {
    if (!socket) return

    // Message handler
    const handleNewMessage = (msg: Message) => {
      if (selectedChat && msg.chat_id === selectedChat.id) {
        setMessages(prev => [...prev, msg])
        scrollToBottom()
        // Trigger seen status tick immediately
        socket.emit('message_status', { message_id: msg.id, status: 'seen' })
      } else {
        // Increment unread count for that chat
        setChats(prev => prev.map(c => {
          if (c.id === msg.chat_id) {
            return {
              ...c,
              last_message: msg,
              unread_count: c.unread_count + 1
            }
          }
          return c
        }))
      }
    }

    // Status ticks handler
    const handleStatusChange = (data: { message_id: string; user_id: string; status: 'sent' | 'delivered' | 'seen'; chat_id: string }) => {
      if (selectedChat && data.chat_id === selectedChat.id) {
        setMessages(prev => prev.map(m => {
          if (m.id === data.message_id) {
            const hasStatus = m.statuses.some(s => s.user_id === data.user_id)
            const updatedStatuses = hasStatus
              ? m.statuses.map(s => s.user_id === data.user_id ? { ...s, status: data.status, updated_at: new Date().toISOString() } : s)
              : [...m.statuses, { id: Math.random().toString(), message_id: m.id, user_id: data.user_id, status: data.status, updated_at: new Date().toISOString() }]
            return { ...m, statuses: updatedStatuses as any[] }
          }
          return m
        }))
      }
    }

    // Reaction handler
    const handleReaction = (data: { message_id: string; user_id: string; reaction: string | null; chat_id: string; removed: boolean }) => {
      if (selectedChat && data.chat_id === selectedChat.id) {
        setMessages(prev => prev.map(m => {
          if (m.id === data.message_id) {
            const updatedReactions = data.removed
              ? m.reactions.filter(r => r.user_id !== data.user_id)
              : m.reactions.some(r => r.user_id === data.user_id)
              ? m.reactions.map(r => r.user_id === data.user_id ? { ...r, reaction: data.reaction || '' } : r)
              : [...m.reactions, { id: Math.random().toString(), message_id: m.id, user_id: data.user_id, reaction: data.reaction || '' }]
            return { ...m, reactions: updatedReactions }
          }
          return m
        }))
      }
    }

    // Typing handler
    const handleTyping = (data: { chat_id: string; user_id: string; is_typing: boolean }) => {
      if (selectedChat && data.chat_id === selectedChat.id) {
        setFriendIsTyping(data.is_typing)
      }
    }

    socket.on('new_message', handleNewMessage)
    socket.on('status_change', handleStatusChange)
    socket.on('new_reaction', handleReaction)
    socket.on('typing', handleTyping)

    return () => {
      socket.off('new_message', handleNewMessage)
      socket.off('status_change', handleStatusChange)
      socket.off('new_reaction', handleReaction)
      socket.off('typing', handleTyping)
    }
  }, [socket, selectedChat])

  // Trigger typing notification
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value)

    if (socket && selectedChat) {
      socket.emit('typing', { chat_id: selectedChat.id, is_typing: true })

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { chat_id: selectedChat.id, is_typing: false })
      }, 2000)
    }
  }

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if ((!text && attachmentsToSend.length === 0) || !selectedChat) return

    let finalContent = text
    if (communicationMode === 'email') {
      const emailSubjectLine = emailSubject.trim() || 'No Subject'
      finalContent = `[Email] Subject: ${emailSubjectLine}\n\n${text}`
    }

    let encryptedContent = finalContent || null
    let nonce: string | null = null
    let isEncrypted = false

    if (finalContent && selectedChat.type === 'direct') {
      const partner = getChatPartner(selectedChat)
      const partnerPubKey = partner?.profile?.public_key
      if (partnerPubKey) {
        try {
          const enc = await encryptMessage(finalContent, partnerPubKey, currentUserUsername || '')
          encryptedContent = enc.ciphertext
          nonce = enc.nonce
          isEncrypted = true
        } catch (err) {
          console.error("Encryption failed, sending as fallback plaintext:", err)
        }
      }
    }

    const payload = {
      chat_id: selectedChat.id,
      encrypted_content: encryptedContent,
      nonce: nonce,
      is_encrypted: isEncrypted,
      reply_to_id: replyingTo ? replyingTo.id : null,
      attachment_ids: attachmentsToSend.length > 0 ? attachmentsToSend : undefined
    }

    if (socket) {
      socket.emit('send_message', payload, (res: any) => {
        if (res && res.error) {
          alert(`Error sending: ${res.error}`)
        }
      })
    }

    setInputText('')
    setEmailSubject('')
    setReplyingTo(null)
    setAttachmentsToSend([])
    setAttachmentPreviews([])
    setShowEmojiPicker(false)
  }

  // Create and send a poll
  const handleCreatePollSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pollQuestion.trim() || !selectedChat) return
    const activeOptions = pollOptions.filter(opt => opt.trim() !== '')
    if (activeOptions.length < 2) {
      alert("Please provide at least 2 options for the poll.")
      return
    }

    const pollData = {
      type: 'poll',
      question: pollQuestion.trim(),
      options: activeOptions
    }
    const text = JSON.stringify(pollData)

    let encryptedContent = text
    let nonce: string | null = null
    let isEncrypted = false

    if (selectedChat.type === 'direct') {
      const partner = getChatPartner(selectedChat)
      const partnerPubKey = partner?.profile?.public_key
      if (partnerPubKey) {
        try {
          const enc = await encryptMessage(text, partnerPubKey, currentUserUsername || '')
          encryptedContent = enc.ciphertext
          nonce = enc.nonce
          isEncrypted = true
        } catch (err) {
          console.error("Encryption failed, sending as fallback plaintext:", err)
        }
      }
    }

    const payload = {
      chat_id: selectedChat.id,
      encrypted_content: encryptedContent,
      nonce: nonce,
      is_encrypted: isEncrypted,
      reply_to_id: null,
      attachment_ids: undefined
    }

    if (socket) {
      socket.emit('send_message', payload, (res: any) => {
        if (res && res.error) {
          alert(`Error sending poll: ${res.error}`)
        }
      })
    }

    setPollQuestion('')
    setPollOptions(['', ''])
    setShowCreatePollModal(false)
  }


  // Voice Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())

        if (audioChunksRef.current.length === 0) return

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([audioBlob], `voicenote_${Date.now()}.webm`, { type: 'audio/webm' })

        setUploadingFile(true)
        const formData = new FormData()
        formData.append('file', file)

        const { data, error } = await api.post<Attachment>(
          `/chats/attachments?chat_id=${selectedChat?.id}`,
          formData
        )
        setUploadingFile(false)

        if (data) {
          const payload = {
            chat_id: selectedChat?.id,
            encrypted_content: null,
            nonce: null,
            is_encrypted: false,
            attachment_ids: [data.id]
          }
          if (socket) {
            socket.emit('send_message', payload)
          }
        } else {
          alert(`Failed to upload voice note: ${error || 'Unknown error'}`)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

    } catch (err: any) {
      alert(`Could not start voice recording: ${err.message || err}`)
    }
  }

  const stopRecording = (shouldSend: boolean) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (!shouldSend) {
        audioChunksRef.current = []
      }
      mediaRecorderRef.current.stop()
    }

    setIsRecording(false)
    setRecordingDuration(0)
  }

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60)
    const seconds = secs % 60
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  // Emoji selection helper
  const onEmojiClick = (emojiData: any) => {
    setInputText(prev => prev + emojiData.emoji)
  }

  // File attachments helper
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedChat) return

    setUploadingFile(true)
    setShowAttachMenu(false)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      if (file.size > 20 * 1024 * 1024) {
        alert('File size exceeds the 20MB limit.')
        continue
      }

      const formData = new FormData()
      formData.append('file', file)

      const { data, error } = await api.post<Attachment>(
        `/chats/attachments?chat_id=${selectedChat.id}`,
        formData,
        { headers: {} }
      )

      if (data) {
        setAttachmentsToSend(prev => [...prev, data.id])
        setAttachmentPreviews(prev => [...prev, {
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          url: data.file_url
        }])
      } else {
        alert(`Upload failed: ${error || 'Unknown error'}`)
      }
    }
    setUploadingFile(false)
  }

  // Message Reaction handler
  const sendReaction = (messageId: string, emoji: string) => {
    if (socket) {
      socket.emit('add_reaction', { message_id: messageId, reaction: emoji })
    }
  }

  // Get other participant in Direct Chat
  const getChatPartner = (chat: Chat) => {
    return chat.participants.find(p => p.id !== currentUserId)
  }

  // Filter chats by search query
  const filteredChats = chats.filter(c => {
    const partner = getChatPartner(c)
    const name = partner?.profile?.full_name || partner?.username || ''
    return name.toLowerCase().includes(chatSearch.toLowerCase())
  })

  const pinnedChats = filteredChats.filter(c => pinnedChatIds.includes(c.id))
  const candidateChats = filteredChats.filter(c => !pinnedChatIds.includes(c.id))

  const renderChatItem = (c: Chat) => {
    const partner = getChatPartner(c)
    const status = partner ? (onlineStatuses[partner.id] || partner.profile?.presence_status || 'offline') : 'offline'
    const active = selectedChat?.id === c.id
    const ws = getPartnerWorkspaceInfo(partner)
    const isChatPinned = isPinned(c.id)

    // Status colors
    const charSum = (partner?.username || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const statuses = ["Replied", "Active", "Shortlisted", "Applied", "Under Review"]
    const statusColors = [
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
      "bg-purple-500/10 text-purple-400 border-purple-500/20",
      "bg-amber-500/10 text-amber-400 border-amber-500/20",
      "bg-rose-500/10 text-rose-400 border-rose-500/20"
    ]
    const itemStatus = statuses[charSum % statuses.length]
    const statusColor = statusColors[charSum % statusColors.length]

    return (
      <div
        key={c.id}
        onClick={() => selectChatRoom(c)}
        className={`w-full flex items-start gap-3 p-3.5 rounded-xl transition-all cursor-pointer text-left border mb-2 group/item relative ${
          active 
            ? 'bg-gradient-to-br from-[var(--accent)] to-[#4f2ee3] text-white border-transparent shadow-lg shadow-[var(--accent-glow)] scale-[1.01]' 
            : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-white/5 text-[var(--text-secondary)] hover:text-white hover:translate-x-0.5'
        }`}
      >
        <div className="relative flex-shrink-0 mt-0.5">
          <img 
            src={partner?.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
            alt="" 
            className="w-10 h-10 rounded-full object-cover border border-white/10"
          />
          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--bg-main)] ${
            status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-amber-500' : status === 'busy' ? 'bg-red-500' : 'bg-slate-500'
          }`} />
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex justify-between items-baseline w-full">
            <h4 className="text-xs font-black truncate text-white group-hover/item:text-[var(--accent)] transition-colors font-heading">
              {partner?.profile?.full_name || partner?.username}
            </h4>
            {c.last_message && (
              <span className="text-[9px] opacity-60 flex-shrink-0 ml-1 font-semibold">
                {new Date(c.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-bold opacity-80 ${active ? 'text-white/80' : 'text-[var(--text-secondary)]'}`}>
              {ws.role}
            </span>
            <span className="text-[8px] opacity-30">•</span>
            <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${active ? 'bg-white/20 text-white border-white/20' : statusColor}`}>
              {itemStatus}
            </span>
          </div>
          
          <div className="flex items-center justify-between mt-1">
            <p className={`text-[10px] truncate max-w-[140px] ${active ? 'text-white/95' : 'text-[var(--text-secondary)]/90'}`}>
              {getMessageText(c.last_message) || (c.last_message?.attachments?.length ? 'Shared a file' : 'Start chatting...')}
            </p>
            <div className="flex items-center gap-1.5">
              {c.unread_count > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {c.unread_count}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => togglePinChat(c.id, e)}
                className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all text-slate-400 hover:text-white cursor-pointer"
                title={isChatPinned ? "Unpin conversation" : "Pin conversation"}
              >
                <Pin className={`w-3 h-3 ${isChatPinned ? 'fill-current text-amber-400' : ''}`} />
              </button>
            </div>
          </div>
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
    <div className="flex h-screen w-screen overflow-hidden bg-transparent text-[var(--text-primary)]">
      {/* Background decoration */}
      <div className="absolute top-[-30%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--accent)] opacity-[0.08] blur-[150px] pointer-events-none" />
      
      {/* COLUMN 1: SIDEBAR NAVIGATION */}
      <Sidebar activeTab="chats" />

      {/* COLUMN 2: ACTIVE CHATS COLUMN (Left Side) */}
      <section className="w-80 h-full border-r border-[var(--border-color)] flex flex-col z-10 flex-shrink-0 glass-panel rounded-none border-y-0 bg-opacity-10">
        <div className="p-6 border-b border-[var(--border-color)] space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-tight text-white font-heading">Recruitment Inbox</h2>
            <NotificationsPopover />
          </div>
          
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-[var(--text-secondary)]" />
            <input 
              type="text" 
              placeholder="Search candidate or role..."
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 glass-input text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {loadingChats ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto" />
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="text-center py-20 text-[var(--text-secondary)] text-xs">
              No candidates found.
            </div>
          ) : (
            <>
              {/* Pinned Candidates */}
              {pinnedChats.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest px-2.5 block mb-1">
                    Pinned Candidates ({pinnedChats.length})
                  </span>
                  {pinnedChats.map(renderChatItem)}
                </div>
              )}

              {/* All Candidate Inbox */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest px-2.5 block mb-1">
                  Candidate Inbox ({candidateChats.length})
                </span>
                {candidateChats.map(renderChatItem)}
              </div>
            </>
          )}
        </div>
      </section>

      {/* COLUMN 3: SECURE MESSAGING CHAT WINDOW */}
      <section className="flex-1 h-full flex flex-col z-10 overflow-hidden bg-transparent">
        <AnimatePresence mode="wait">
          {!selectedChat ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center p-8"
            >
              <div className="max-w-md space-y-6">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[var(--accent)] to-pink-500 flex items-center justify-center mx-auto shadow-2xl shadow-[var(--accent-glow)]">
                  <Lock className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-black tracking-tight glow-text font-heading">Secure Talent Communications</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Select a candidate from the recruitment inbox to begin exchanging end-to-end encrypted messages or dispatch official onboarding emails.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="active-chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col h-full overflow-hidden"
            >
              {/* Redesigned Header with toggles */}
              {(() => {
                const partner = getChatPartner(selectedChat)
                const ws = getPartnerWorkspaceInfo(partner)
                const status = partner ? (onlineStatuses[partner.id] || partner.profile?.presence_status || 'offline') : 'offline'
                return (
                  <header className="h-16 border-b border-[var(--border-color)] px-8 flex items-center justify-between flex-shrink-0 glass-panel rounded-none border-t-0 border-x-0 bg-opacity-30">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setSelectedChat(null)}
                        className="md:hidden p-1 rounded-lg border border-[var(--border-color)]"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <img 
                          src={partner?.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
                          alt="" 
                          className="w-10 h-10 rounded-full object-cover border border-[var(--border-color)]"
                        />
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--bg-main)] ${
                          status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-amber-500' : status === 'busy' ? 'bg-red-500' : 'bg-slate-500'
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold leading-tight">{partner?.profile?.full_name || partner?.username}</h4>
                        <span className="text-[10px] text-[var(--accent)] font-bold tracking-wide block">{ws.role}</span>
                      </div>
                    </div>

                    {/* Mode Toggle Switch (Chat vs Email) */}
                    <div className="flex bg-[var(--border-color)] p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setCommunicationMode('chat')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          communicationMode === 'chat'
                            ? 'bg-[var(--accent)] text-white shadow-sm'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Chat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommunicationMode('email')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          communicationMode === 'email'
                            ? 'bg-[var(--accent)] text-white shadow-sm'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      {communicationMode === 'chat' && (
                        <div className="flex items-center gap-1 bg-[var(--accent-glow)] border border-[var(--accent)]/20 px-3 py-1.5 rounded-full text-[10px] text-[var(--accent)] font-bold">
                          <Lock className="w-3.5 h-3.5" />
                          <span className="uppercase tracking-widest">E2EE Secured</span>
                        </div>
                      )}

                      {chatMood && (
                        <div 
                          className="hidden sm:flex items-center gap-1 bg-pink-500/10 border border-pink-500/20 px-3 py-1.5 rounded-full text-[10px] text-pink-400 font-bold"
                          title={chatMood.description}
                        >
                          <span>🎭 Mood: {chatMood.mood}</span>
                        </div>
                      )}

                      <button
                        onClick={fetchChatSummary}
                        disabled={loadingSummary}
                        className="flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-full text-[10px] text-indigo-400 font-bold transition-all cursor-pointer disabled:opacity-50"
                        title="AI Summarize Chat"
                      >
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                        <span className="uppercase tracking-wider">AI Summary</span>
                      </button>

                      <div className="relative">
                        <button
                          onClick={() => setShowOptionsDropdown(!showOptionsDropdown)}
                          className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer text-[var(--text-secondary)] hover:text-white"
                          title="Options"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {showOptionsDropdown && (
                          <div className="absolute right-0 mt-2 w-40 glass-card p-1.5 shadow-2xl border border-[var(--border-color)] z-40 text-xs">
                            <button
                              onClick={() => {
                                setShowOptionsDropdown(false)
                                setShowReportModal(true)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-white transition-all text-left cursor-pointer font-semibold"
                            >
                              <Flag className="w-3.5 h-3.5 text-amber-500" />
                              <span>Report User</span>
                            </button>
                            <button
                              onClick={handleBlockPartner}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-500 transition-all text-left cursor-pointer font-semibold"
                            >
                              <UserX className="w-3.5 h-3.5 text-rose-500" />
                              <span>Block User</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right Panel Toggle Arrow */}
                      <button
                        onClick={() => setShowRightPanel(!showRightPanel)}
                        className={`p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-white/5 transition-all cursor-pointer ${
                          showRightPanel ? 'text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)]'
                        }`}
                        title="Toggle Profile Panel"
                      >
                        <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showRightPanel ? 'rotate-180' : ''}`} />
                      </button>

                    </div>
                  </header>
                )
              })()}

              {/* Chat Message Scroll Content */}
              <div 
                ref={chatWindowRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-8 space-y-6"
              >
                {loadingMessages && (
                  <div className="text-center py-4">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[var(--accent)]" />
                  </div>
                )}
                
                {messages.map((msg) => {
                  const isMe = msg.sender_id === currentUserId
                  const otherStatus = msg.statuses.find(s => s.user_id !== currentUserId)
                  const tickStatus = otherStatus?.status || 'sent'
                  const rawText = getMessageText(msg)
                  
                  // Check if it's an email style message
                  const isEmail = rawText && rawText.startsWith('[Email] Subject:')
                  let emailSubjectText = ''
                  let emailBodyText = rawText
                  if (isEmail) {
                    const subjectMatch = rawText.match(/^\[Email\] Subject:\s*(.*?)\n\n([\s\S]*)$/)
                    if (subjectMatch) {
                      emailSubjectText = subjectMatch[1]
                      emailBodyText = subjectMatch[2]
                    }
                  }

                  if (isEmail) {
                    return (
                      <div 
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} w-full`}
                      >
                        <div className="p-5 rounded-2xl border text-sm max-w-[80%] bg-[var(--bg-card)] border-[var(--border-color)] shadow-md hover:shadow-lg transition-all">
                          <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-3 mb-3">
                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                              <Mail className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block">Official Connection Email</span>
                              <h4 className="text-xs font-bold text-white truncate max-w-[250px]" title={emailSubjectText}>
                                {emailSubjectText}
                              </h4>
                            </div>
                          </div>
                          
                          <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                            {emailBodyText}
                          </p>

                          <div className="mt-3 flex justify-between items-center text-[9px] text-[var(--text-secondary)] font-bold border-t border-[var(--border-color)]/30 pt-2.5">
                            <span>Sent via Connect-On Mail Channel</span>
                            <span>{new Date(msg.created_at).toLocaleDateString()} at {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  
                  return (
                    <div 
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      {msg.reply_to_id && (() => {
                        const repliedMsg = messages.find(m => m.id === msg.reply_to_id)
                        return (
                          <div className="text-[10px] text-[var(--text-secondary)] mb-1 flex items-center gap-1 opacity-70 bg-[var(--border-color)] px-2 py-0.5 rounded-md">
                            <CornerUpLeft className="w-3 h-3" />
                            <span>Replied: {getMessageText(repliedMsg || null) || 'shared item'}</span>
                          </div>
                        )
                      })()}

                      <div className="flex items-center gap-2 group max-w-[70%]">
                        {!isMe && (
                          <button 
                            onClick={() => sendReaction(msg.id, '❤️')}
                            className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] text-xs cursor-pointer hover:bg-[var(--border-color)]"
                            title="React with Love"
                          >
                            <SmilePlus className="w-3.5 h-3.5 text-[var(--text-secondary)] hover:text-red-500" />
                          </button>
                        )}

                        <div className={`p-4 rounded-2xl text-sm relative border backdrop-blur-md transition-all duration-300 ${
                          isMe 
                            ? 'bg-gradient-to-br from-[var(--accent)] to-[#0052cc] text-white border-[var(--accent)]/30 rounded-tr-none shadow-[var(--accent-glow)] shadow-md hover:shadow-lg' 
                            : 'bg-white/5 border-white/10 text-[var(--text-primary)] rounded-tl-none hover:bg-white/8'
                        }`}>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mb-2 space-y-2">
                              {msg.attachments.map(att => {
                                if (att.file_type === 'audio') {
                                  return (
                                    <div key={att.id} className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex flex-col gap-3 min-w-[240px] shadow-lg">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Mic className="w-4 h-4 text-rose-500 animate-pulse" />
                                          <span className="text-[10px] uppercase font-black tracking-widest text-[var(--text-secondary)]">Secure Voice Note</span>
                                        </div>
                                        <div className="voice-waveform">
                                          <span className="voice-waveform-bar active" style={{ animationDelay: '0.1s' }} />
                                          <span className="voice-waveform-bar active" style={{ animationDelay: '0.3s' }} />
                                          <span className="voice-waveform-bar active" style={{ animationDelay: '0.5s' }} />
                                          <span className="voice-waveform-bar active" style={{ animationDelay: '0.2s' }} />
                                          <span className="voice-waveform-bar active" style={{ animationDelay: '0.4s' }} />
                                        </div>
                                      </div>
                                      <audio
                                        src={att.file_url}
                                        controls
                                        className="w-full h-8 accent-[var(--accent)] bg-transparent outline-none rounded-md opacity-80"
                                      />
                                    </div>
                                  )
                                }
                                
                                // CV / Resume custom viewcard logic
                                const isCV = att.file_name.toLowerCase().includes('cv') || 
                                             att.file_name.toLowerCase().includes('resume') || 
                                             att.file_name.toLowerCase().includes('portfolio') || 
                                             att.file_name.toLowerCase().endsWith('.pdf')
                                
                                if (isCV) {
                                  return (
                                    <div key={att.id} className="p-3 rounded-xl bg-black/20 hover:bg-black/35 border border-white/5 flex items-center justify-between gap-3 min-w-[240px] shadow-md transition-all group/file">
                                      <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400 group-hover/file:scale-105 transition-all">
                                          <FileText className="w-4.5 h-4.5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-bold text-white truncate max-w-[140px]" title={att.file_name}>
                                            {att.file_name}
                                          </p>
                                          <span className="text-[9px] text-[var(--text-secondary)] block font-semibold">
                                            {formatFileSize(att.file_size)} • CV Card
                                          </span>
                                        </div>
                                      </div>
                                      <a 
                                        href={att.file_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[9px] font-black uppercase tracking-wider transition-all"
                                      >
                                        View
                                      </a>
                                    </div>
                                  )
                                }

                                return (
                                  <a 
                                    key={att.id} 
                                    href={att.file_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="block p-2 rounded-xl bg-black/20 hover:bg-black/30 transition-all text-xs font-semibold"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Paperclip className="w-4 h-4" />
                                      <span className="truncate max-w-[150px]">{att.file_name}</span>
                                    </div>
                                  </a>
                                )
                              })}
                            </div>
                          )}

                          {(() => {
                            const rawText = getMessageText(msg)
                            if (rawText && rawText.startsWith('{"type":"poll"')) {
                              try {
                                const poll = JSON.parse(rawText)
                                // Calculate total reactions for voting
                                const votes = msg.reactions.filter(r => r.reaction.startsWith('v_'))
                                const totalVotes = votes.length
                                
                                // Group votes by option index
                                const optionsVotes = poll.options.map((_: any, idx: number) => {
                                  const optionKey = `v_${idx}`
                                  const optionVotes = votes.filter(r => r.reaction === optionKey)
                                  const percent = totalVotes > 0 ? Math.round((optionVotes.length / totalVotes) * 100) : 0
                                  const userHasVoted = optionVotes.some(v => v.user_id === currentUserId)
                                  
                                  // Find profile details of voters for avatars display
                                  const voterProfiles = optionVotes.map(v => {
                                    return selectedChat.participants.find(p => p.id === v.user_id)
                                  }).filter(Boolean) as UserProfile[]

                                  return { idx, optionVotes, percent, userHasVoted, voterProfiles }
                                })

                                const handleVote = (optionIndex: number) => {
                                  if (socket) {
                                    socket.emit('add_reaction', {
                                      message_id: msg.id,
                                      reaction: `v_${optionIndex}`
                                    })
                                  }
                                }

                                return (
                                  <div className="w-full min-w-[260px] md:min-w-[320px] p-2 space-y-4">
                                    {/* Poll header */}
                                    <div className="flex items-center gap-2">
                                      <div className="p-1.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
                                        <Activity className="w-4 h-4 text-[var(--accent)]" />
                                      </div>
                                      <div>
                                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">Team Poll</span>
                                        <p className="text-[10px] text-[var(--text-secondary)]">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</p>
                                      </div>
                                    </div>

                                    {/* Poll Question */}
                                    <h4 className="text-sm font-bold text-white leading-snug break-words font-heading">
                                      {poll.question}
                                    </h4>

                                    {/* Poll Options */}
                                    <div className="space-y-2.5">
                                      {poll.options.map((opt: string, idx: number) => {
                                        const { percent, userHasVoted, voterProfiles } = optionsVotes[idx]
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleVote(idx)}
                                            className={`w-full relative p-3 rounded-xl border transition-all text-left flex flex-col justify-center gap-1 cursor-pointer overflow-hidden ${
                                              userHasVoted
                                                ? 'border-[var(--accent)] bg-[var(--accent-glow)]'
                                                : 'border-white/5 bg-white/5 hover:bg-white/10'
                                            }`}
                                          >
                                            {/* Progress bar overlay */}
                                            <div 
                                              className="absolute left-0 top-0 bottom-0 bg-[var(--accent)]/10 transition-all duration-500 ease-out" 
                                              style={{ width: `${percent}%` }}
                                            />

                                            <div className="relative z-10 flex justify-between items-center w-full">
                                              <span className={`text-xs font-semibold break-words pr-2 ${userHasVoted ? 'text-white font-bold' : 'text-[var(--text-primary)]'}`}>
                                                {opt}
                                              </span>
                                              <span className="text-xs font-black text-[var(--accent)]">
                                                {percent}%
                                              </span>
                                            </div>

                                            {/* Voters mini avatars */}
                                            {voterProfiles.length > 0 && (
                                              <div className="relative z-10 flex -space-x-1.5 mt-1">
                                                {voterProfiles.map((voter: UserProfile) => (
                                                  <img
                                                    key={voter.id}
                                                    src={voter.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'}
                                                    alt={voter.username}
                                                    title={`@${voter.username}`}
                                                    className="w-4 h-4 rounded-full object-cover border border-[var(--bg-main)]"
                                                  />
                                                ))}
                                              </div>
                                            )}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              } catch (e) {
                                return <p className="leading-relaxed break-words">{rawText}</p>
                              }
                            }
                            return <p className="leading-relaxed break-words">{rawText}</p>
                          })()}
                          
                          {msg.encrypted_content && !isEmail && (
                            <div className="mt-2 flex gap-2 items-center text-[9px] font-semibold opacity-70 select-none">
                              <span className="text-[8px] text-[var(--text-secondary)] font-bold">AI TRANSLATE:</span>
                              <button 
                                onClick={() => translateMsg(msg.id, getMessageText(msg), 'hindi')} 
                                className="hover:underline text-indigo-300 font-bold cursor-pointer"
                              >
                                Hindi
                              </button>
                              <button 
                                onClick={() => translateMsg(msg.id, getMessageText(msg), 'japanese')} 
                                className="hover:underline text-indigo-300 font-bold cursor-pointer"
                              >
                                Japanese
                              </button>
                              <button 
                                onClick={() => translateMsg(msg.id, getMessageText(msg), 'english')} 
                                className="hover:underline text-indigo-300 font-bold cursor-pointer"
                              >
                                Original
                              </button>
                            </div>
                          )}

                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="absolute bottom-[-10px] right-2 flex gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] px-1.5 py-0.5 rounded-full text-xs shadow-md">
                              {msg.reactions.map(r => (
                                <span key={r.id}>{r.reaction}</span>
                              ))}
                            </div>
                          )}
                        </div>

                        {isMe && (
                          <button 
                            onClick={() => sendReaction(msg.id, '👍')}
                            className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] text-xs cursor-pointer hover:bg-[var(--border-color)]"
                            title="React Thumbs Up"
                          >
                            <SmilePlus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                          </button>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] opacity-60">
                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && (
                          <span className="flex items-center">
                            {tickStatus === 'sent' && <Check className="w-3.5 h-3.5 text-slate-400" />}
                            {tickStatus === 'delivered' && <CheckCheck className="w-3.5 h-3.5 text-slate-400" />}
                            {tickStatus === 'seen' && <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={messageEndRef} />
              </div>

              {friendIsTyping && (
                <div className="px-8 py-2 text-xs text-[var(--text-secondary)] flex items-center gap-2 select-none animate-pulse">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>Partner is typing...</span>
                </div>
              )}

              {replyingTo && (
                <div className="px-8 py-3 bg-[var(--bg-card)] border-t border-[var(--border-color)] flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <CornerUpLeft className="w-4 h-4" />
                    <span>Replying to: <strong>{getMessageText(replyingTo) || 'shared item'}</strong></span>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="text-rose-500 font-bold hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Email Mode Subject composer line */}
              {communicationMode === 'email' && (
                <div className="px-8 py-3.5 border-t border-[var(--border-color)] flex items-center gap-3 bg-[var(--bg-card)]/50 select-none">
                  <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Subject:</span>
                  <input 
                    type="text"
                    required
                    placeholder="Enter email subject line (e.g. Design Interview Feedback)..."
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="flex-1 bg-transparent text-xs text-white border-0 outline-none focus:ring-0 placeholder:text-slate-500 font-semibold"
                  />
                </div>
              )}

              {/* Message Input Controls */}
              <div className="p-6 border-t border-[var(--border-color)] flex-shrink-0 relative">
                {showEmojiPicker && (
                  <div className="absolute bottom-28 left-6 z-30 shadow-2xl">
                    <EmojiPicker onEmojiClick={onEmojiClick} theme={'dark' as any} />
                  </div>
                )}

                {showAttachMenu && (
                  <div className="absolute bottom-28 left-16 z-30 glass-card p-3 border border-[var(--border-color)] space-y-2 w-48 shadow-xl">
                    <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--border-color)] text-xs font-semibold cursor-pointer text-slate-200">
                      <ImageIcon className="w-4 h-4 text-pink-500" />
                      <span>Upload Photos</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileChange}
                        multiple
                        className="hidden" 
                      />
                    </label>
                    <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--border-color)] text-xs font-semibold cursor-pointer text-slate-200">
                      <Paperclip className="w-4 h-4 text-[var(--accent)]" />
                      <span>Upload Files/PDF</span>
                      <input 
                        type="file" 
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" 
                        onChange={handleFileChange}
                        multiple
                        className="hidden" 
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAttachMenu(false)
                        setShowCreatePollModal(true)
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--border-color)] text-xs font-semibold cursor-pointer text-slate-200 text-left bg-transparent border-0"
                    >
                      <Activity className="w-4 h-4 text-emerald-400" />
                      <span>Create Poll</span>
                    </button>
                  </div>
                )}


                {attachmentPreviews.length > 0 && (
                  <div className="flex gap-3 mb-3 p-3 glass-card border border-[var(--border-color)] rounded-xl overflow-x-auto">
                    {attachmentPreviews.map((prev, index) => (
                      <div key={index} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-[var(--border-color)] bg-black/20 flex items-center justify-center p-1">
                        {prev.type === 'image' ? (
                          <img src={prev.url} className="w-full h-full object-cover rounded-md" alt="" />
                        ) : (
                          <Paperclip className="w-6 h-6 text-[var(--accent)]" />
                        )}
                        <button 
                          onClick={() => {
                            setAttachmentsToSend(prevList => prevList.filter((_, i) => i !== index))
                            setAttachmentPreviews(prevList => prevList.filter((_, i) => i !== index))
                          }}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5 text-[9px] font-bold"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {smartReplies.length > 0 && (
                  <div className="flex gap-2 mb-3.5 flex-wrap">
                    {smartReplies.map((reply, rIdx) => (
                      <button
                        key={rIdx}
                        type="button"
                        onClick={() => setInputText(reply)}
                        className="px-3 py-1.5 rounded-full border border-[var(--border-color)] hover:border-[var(--accent)] hover:bg-[var(--accent-glow)] text-[10px] font-bold text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}

                {isRecording ? (
                  <div className="flex w-full items-center justify-between p-3 glass-card border border-rose-500/20 bg-rose-500/5 rounded-xl animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-xs text-rose-400 font-bold uppercase tracking-wider">Recording Voice Note...</span>
                      <span className="text-sm font-mono text-white font-bold">{formatDuration(recordingDuration)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => stopRecording(false)}
                        className="px-4 py-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5 text-xs text-white cursor-pointer font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => stopRecording(true)}
                        className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer flex items-center gap-1 shadow-md shadow-rose-500/25"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Note</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="flex gap-4 items-center">
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={() => {
                          setShowEmojiPicker(false)
                          setShowAttachMenu(!showAttachMenu)
                        }}
                        className="p-3 rounded-xl border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer text-[var(--text-secondary)] hover:text-white"
                        title="Attach Item"
                      >
                        <Paperclip className="w-4.5 h-4.5" />
                      </button>
                      
                      <button 
                        type="button" 
                        onClick={() => {
                          setShowAttachMenu(false)
                          setShowEmojiPicker(!showEmojiPicker)
                        }}
                        className="p-3 rounded-xl border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all cursor-pointer text-[var(--text-secondary)] hover:text-white"
                        title="Emojis"
                      >
                        <EmojiIcon className="w-4.5 h-4.5" />
                      </button>
                    </div>

                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        placeholder={communicationMode === 'email' ? "Type your official onboarding or status email..." : "Write your encrypted message..."}
                        value={inputText}
                        onChange={handleInputChange}
                        className="w-full py-3 pl-4 pr-12 glass-input text-xs focus:ring-[var(--accent-glow)]"
                      />
                      
                      <button 
                        type="button" 
                        onClick={startRecording}
                        className="absolute right-3.5 top-3.5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
                        title="Record Voice Note"
                      >
                        <Mic className="w-4.5 h-4.5" />
                      </button>
                    </div>

                    <button 
                      type="submit" 
                      disabled={uploadingFile || (!inputText.trim() && attachmentsToSend.length === 0)}
                      className="p-3 rounded-xl btn-premium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {uploadingFile ? <RefreshCw className="w-4.5 h-4.5 animate-spin" /> : <Send className="w-4.5 h-4.5" />}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* COLUMN 4: COLLAPSIBLE CANDIDATE DETAILS PANEL + UTILITY BAR */}
      {selectedChat && (
        <div className="flex h-full border-l border-[var(--border-color)] flex-shrink-0 z-10 bg-transparent layer-content">
          {/* Slide-out Candidate Details Panel */}
          <AnimatePresence>
            {showRightPanel && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="h-full flex flex-col overflow-y-auto bg-[var(--bg-surface)] backdrop-blur-md p-6 select-none"
              >
                {/* Panel Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-extrabold text-white tracking-wide uppercase font-heading">Candidate Profile</h3>
                  <button 
                    onClick={() => setShowRightPanel(false)}
                    className="p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Candidate Overview Card */}
                {(() => {
                  const partner = getChatPartner(selectedChat)
                  const ws = getPartnerWorkspaceInfo(partner)
                  const status = partner ? (onlineStatuses[partner.id] || partner.profile?.presence_status || 'offline') : 'offline'
                  const charSum = (partner?.username || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                  const mockScore = (charSum % 3) + 3 // 3, 4, or 5
                  
                  return (
                    <div className="space-y-6">
                      <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-md">
                        <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[var(--accent)] mb-3 shadow-lg">
                          <img 
                            src={partner?.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
                            alt="" 
                            className="w-full h-full object-cover"
                          />
                          <span className={`absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--bg-main)] ${
                            status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-amber-500' : status === 'busy' ? 'bg-red-500' : 'bg-slate-500'
                          }`} />
                        </div>
                        <h4 className="text-base font-bold text-white leading-snug truncate max-w-[200px] font-heading">
                          {partner?.profile?.full_name || partner?.username}
                        </h4>
                        <p className="text-xs text-[var(--accent)] font-semibold mt-1">
                          {ws.role}
                        </p>
                        {ws.company && (
                          <p className="text-[10px] text-[var(--text-secondary)] font-semibold">
                            @{ws.company}
                          </p>
                        )}
                        
                        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                          {ws.tags.length > 0 ? (
                            ws.tags.map((tag: string, idx: number) => (
                              <span key={idx} className="text-[9px] bg-white/5 border border-white/10 text-[var(--text-secondary)] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                {tag}
                              </span>
                            ))
                          ) : (
                            ['Figma', 'Product', 'UX'].map((tag, idx) => (
                              <span key={idx} className="text-[9px] bg-white/5 border border-white/10 text-[var(--text-secondary)] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                {tag}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Stage Rating / Progress */}
                      <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-[var(--text-secondary)] uppercase tracking-wider text-[10px]">Evaluation Stage</span>
                          <span className="text-[var(--accent)]">{mockScore} / 5</span>
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          {[1, 2, 3, 4, 5].map((dot) => (
                            <div 
                              key={dot}
                              className={`h-1.5 flex-1 rounded-full ${dot <= mockScore ? 'bg-[var(--accent)] shadow-sm shadow-[var(--accent-glow)]' : 'bg-[var(--border-color)]'}`}
                            />
                          ))}
                        </div>
                        <p className="text-[9px] text-[var(--text-secondary)] mt-2 italic leading-relaxed">
                          Assessed based on technical skills, professional portfolio review, and matching tag specialties.
                        </p>
                      </div>

                      {/* Contact Credentials */}
                      <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-3">
                        <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Contact Info</h4>
                        
                        <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                          <Mail className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                          <span className="truncate text-white font-semibold" title={partner?.email}>{partner?.email}</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                          <Phone className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                          <span className="text-white font-semibold">{ws.alternatePhone || '+1 (555) 234-5678'}</span>
                        </div>

                        {ws.linkedin ? (
                          <a 
                            href={ws.linkedin} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] hover:text-white transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                            <span className="text-indigo-400 hover:underline truncate font-semibold">LinkedIn Profile</span>
                          </a>
                        ) : (
                          <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                            <ExternalLink className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            <span className="text-slate-400 italic">No LinkedIn link</span>
                          </div>
                        )}
                      </div>

                      {/* Mock Interview Schedule */}
                      <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                        <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Interview Schedules</h4>
                        <div className="space-y-2.5">
                          {[
                            { title: 'Technical Coding Round', date: 'June 10, 10:00 AM', status: 'Scheduled', color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5' },
                            { title: 'System Design Assessment', date: 'June 12, 02:30 PM', status: 'Pending', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
                            { title: 'HR Culture & Onboarding', date: 'June 15, 11:00 AM', status: 'Under Review', color: 'text-purple-400 border-purple-500/20 bg-purple-500/5' }
                          ].map((sched, sIdx) => (
                            <div key={sIdx} className="p-3 rounded-xl border border-white/5 bg-white/5 space-y-1.5 hover:border-white/10 transition-all select-none">
                              <div className="flex justify-between items-start gap-1">
                                <p className="text-xs font-black text-white leading-tight truncate max-w-[150px] font-heading">{sched.title}</p>
                                <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${sched.color}`}>
                                  {sched.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 font-semibold">
                                <CalendarIcon className="w-3 h-3 text-[var(--text-secondary)]" />
                                <span>{sched.date}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  );
                })()}

              </motion.div>
            )}
          </AnimatePresence>

          {/* Narrow Right Utility Icon Ribbon */}
          <div className="w-14 h-full border-l border-[var(--border-color)] bg-[var(--bg-surface)] backdrop-blur-md flex flex-col items-center py-6 justify-between flex-shrink-0 select-none">
            <div className="flex flex-col items-center gap-5">
              {/* Toggle panel button if collapsed */}
              {!showRightPanel && (
                <button 
                  onClick={() => setShowRightPanel(true)}
                  className="p-2.5 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-all mb-4 shadow-sm cursor-pointer"
                  title="Expand Details"
                >
                  <ChevronLeft className="w-4.5 h-4.5" />
                </button>
              )}

              {[
                { icon: Cloud, label: 'Google Drive Sync' },
                { icon: FileText, label: 'Notion Documents' },
                { icon: MessageSquare, label: 'Slack Workspace' },
                { icon: CalendarIcon, label: 'Interview Calendar' },
                { icon: Folder, label: 'Shared Attachments' }
              ].map((tool, tIdx) => {
                const IconComponent = tool.icon
                return (
                  <button
                    key={tIdx}
                    className="w-10 h-10 rounded-xl flex items-center justify-center border border-transparent hover:border-[var(--border-color)] hover:bg-white/5 text-[var(--text-secondary)] hover:text-white transition-all duration-300 relative group cursor-pointer"
                    title={tool.label}
                  >
                    <IconComponent className="w-4.5 h-4.5" />
                    
                    {/* Hover Tooltip label */}
                    <div className="absolute right-12 bg-[#0F172A] border border-[var(--border-color)] text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                      {tool.label}
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => navigate('/settings')}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer"
              title="Global Settings"
            >
              <SettingsIcon className="w-4.5 h-4.5" />
            </button>
          </div>

        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in layer-modal">
          <div className="glass-panel p-6 max-w-md w-full border border-[var(--border-color)]">
            <h3 className="text-lg font-heading font-bold text-white mb-2 flex items-center gap-2">
              <Flag className="w-5 h-5 text-amber-500" />
              <span>Report User</span>
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
                  setReportReason('')
                }}
                className="px-4 py-2 rounded-xl border border-[var(--border-color)] hover:bg-white/5 text-xs text-white cursor-pointer font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReportPartner}
                disabled={!reportReason.trim()}
                className="btn-premium px-4 py-2 text-xs cursor-pointer font-semibold disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 layer-modal">
          <div className="glass-panel p-6 max-w-md w-full border border-[var(--border-color)]">
            <h3 className="text-lg font-heading font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>AI Chat Summary</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4 font-semibold">
              Here is a generated summary of your recent conversations in this chat room:
            </p>
            <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap font-sans mb-4">
              {chatSummary}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowSummaryModal(false)
                  setChatSummary('')
                }}
                className="btn-premium px-5 py-2.5 text-xs cursor-pointer font-semibold"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Poll Modal */}
      {showCreatePollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 layer-modal">
          <div className="glass-panel p-6 max-w-md w-full border border-[var(--border-color)]">
            <h3 className="text-lg font-heading font-bold text-white mb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span>Create Team Poll</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Gather opinions from your chat members. Provide a question and at least 2 options.
            </p>

            <form onSubmit={handleCreatePollSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-1">
                  Poll Question
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="E.g., Which feature should we prioritize next?"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full px-4 py-2.5 glass-input text-xs"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-1">
                  Options
                </label>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      required={idx < 2}
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...pollOptions]
                        newOpts[idx] = e.target.value
                        setPollOptions(newOpts)
                      }}
                      className="flex-1 px-4 py-2.5 glass-input text-xs"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== idx))}
                        className="px-2.5 py-2 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 text-rose-400 rounded-lg text-xs font-bold transition-all cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}

                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions(prev => [...prev, ''])}
                    className="text-xs font-bold text-[var(--accent)] hover:underline mt-1 cursor-pointer block bg-transparent border-0"
                  >
                    + Add Option
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreatePollModal(false)
                    setPollQuestion('')
                    setPollOptions(['', ''])
                  }}
                  className="px-4 py-2 rounded-xl border border-[var(--border-color)] hover:bg-white/5 text-xs text-white cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-premium px-5 py-2 text-xs cursor-pointer font-semibold"
                >
                  Create Poll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
