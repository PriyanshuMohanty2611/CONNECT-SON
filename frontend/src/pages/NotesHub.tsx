import { useState, useEffect, useRef } from 'react'
import { 
  FileText, Shield, Users, Plus, Trash2, Edit3, Share2, 
  Eye, Check, ListTodo, Sparkles, X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { api } from '../services/api'

interface Note {
  id: string
  title: string
  content: string
  note_type: 'personal' | 'shared' | 'quick'
  owner_id: string
  is_encrypted: boolean
  created_at: string
  updated_at: string
  collaborators?: Array<{ id: string; username: string; full_name?: string }>
}

export default function NotesHub() {
  const { user } = useAuth()
  const { socket } = useSocket()

  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [noteTypeFilter, setNoteTypeFilter] = useState<'personal' | 'shared' | 'quick'>('personal')
  
  // Modals/collaborators
  const [showCollabModal, setShowCollabModal] = useState(false)
  const [collabUsername, setCollabUsername] = useState('')
  const [collabSuccess, setCollabSuccess] = useState('')
  
  // Note creation
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<'personal' | 'shared' | 'quick'>('personal')
  const [newEncrypted, setNewEncrypted] = useState(false)

  // Editor mode
  const [previewMode, setPreviewMode] = useState(false)

  const editorTimeoutRef = useRef<any>(null)

  const loadNotes = async () => {
    setLoading(true)
    const { data } = await api.get<Note[]>('/notes')
    setLoading(false)
    if (data) setNotes(data)
  }

  useEffect(() => {
    loadNotes()
  }, [])

  // Socket sync for shared notes collaboration
  useEffect(() => {
    if (!socket || !selectedNote || selectedNote.note_type !== 'shared') return

    socket.emit('join_note_edit', { note_id: selectedNote.id })

    const handleCollaboratorEdit = (data: { note_id: string; content: string; user_id: string }) => {
      if (data.note_id === selectedNote.id) {
        setEditContent(data.content)
      }
    }

    socket.on('note_collaborator_edit', handleCollaboratorEdit)

    return () => {
      socket.off('note_collaborator_edit', handleCollaboratorEdit)
    }
  }, [socket, selectedNote])

  // Save changes locally and sync via API/WebSocket
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setEditContent(val)

    if (!selectedNote) return

    // Emit live socket edit
    if (socket && selectedNote.note_type === 'shared') {
      socket.emit('note_edit_change', {
        note_id: selectedNote.id,
        content: val,
        cursor_position: e.target.selectionStart
      })
    }

    // Debounce database sync saving
    if (editorTimeoutRef.current) clearTimeout(editorTimeoutRef.current)
    editorTimeoutRef.current = setTimeout(async () => {
      await api.put(`/notes/${selectedNote.id}`, {
        content: val
      })
      // Sync list
      setNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, content: val, updated_at: new Date().toISOString() } : n))
    }, 1000)
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setEditTitle(val)
    if (!selectedNote) return

    if (editorTimeoutRef.current) clearTimeout(editorTimeoutRef.current)
    editorTimeoutRef.current = setTimeout(async () => {
      await api.put(`/notes/${selectedNote.id}`, {
        title: val
      })
      setNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, title: val, updated_at: new Date().toISOString() } : n))
    }, 1000)
  }

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    const { data, error } = await api.post<Note>('/notes', {
      title: newTitle,
      content: '',
      note_type: newType,
      is_encrypted: newEncrypted
    })

    if (data && !error) {
      setNewTitle('')
      setShowAddForm(false)
      loadNotes()
      setSelectedNote(data)
      setEditTitle(data.title)
      setEditContent(data.content)
    } else {
      alert(error)
    }
  }

  const handleDeleteNote = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return
    const { error } = await api.delete(`/notes/${id}`)
    if (!error) {
      setSelectedNote(null)
      loadNotes()
    } else {
      alert(error)
    }
  }

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collabUsername.trim() || !selectedNote) return
    setCollabSuccess('')
    const { error } = await api.post(`/notes/${selectedNote.id}/collaborators`, {
      username: collabUsername.trim()
    })
    if (!error) {
      setCollabSuccess(`${collabUsername} successfully added.`)
      setCollabUsername('')
      // Reload details
      const { data } = await api.get<Note[]>('/notes')
      if (data) {
        setNotes(data)
        const updated = data.find(n => n.id === selectedNote.id)
        if (updated) setSelectedNote(updated)
      }
    } else {
      setCollabSuccess(`Error: ${error}`)
    }
  }

  // Markdown parsing helper representation
  const renderMarkdown = (text: string) => {
    if (!text) return '<p class="text-[var(--text-secondary)] italic">Empty note. Start typing...</p>'
    // Simple mock markdown conversions
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/^# (.*$)/gim, '<h1 class="text-xl font-black text-white mt-4 mb-2">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-base font-extrabold text-white mt-3 mb-1.5">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-xs font-black text-white mt-2 mb-1">$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code class="bg-black/40 px-1 py-0.5 rounded text-[var(--accent)] font-semibold">$1</code>')
      .replace(/- \[(x| )\] (.*)/gim, (_, check, task) => {
        const checked = check === 'x'
        return `<div class="flex items-center gap-2 mt-1">
          <input type="checkbox" disabled ${checked ? 'checked' : ''} class="rounded text-[var(--accent)]" />
          <span class="text-xs ${checked ? 'line-through opacity-50' : 'text-white'}">${task}</span>
        </div>`
      })
      .replace(/- (.*)/gim, '<li class="list-disc pl-4 mt-1">$1</li>')
      .replace(/\n/g, '<br />')

    return `<div class="space-y-1">${html}</div>`
  }

  // Filter notes lists
  const filteredNotes = notes.filter(n => n.note_type === noteTypeFilter)

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-[var(--accent)]" />
            Notes Hub
          </h2>
          <p className="text-[var(--text-secondary)] text-sm">Write encrypted reports, shopping lists, or collaborate live on shared files.</p>
        </div>

        <button 
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 rounded-xl btn-premium text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Note</span>
        </button>
      </div>

      {/* Main split view */}
      <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
        
        {/* Left Side: Note List */}
        <div className="w-80 glass-card p-4 flex flex-col justify-between overflow-hidden flex-shrink-0">
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            {/* Notes Category filters */}
            <div className="grid grid-cols-3 gap-1 bg-black/30 p-1 rounded-xl border border-[var(--border-color)]">
              {(['personal', 'shared', 'quick'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setNoteTypeFilter(type)}
                  className={`py-1.5 rounded-lg text-[10px] font-bold capitalize cursor-pointer transition-all ${
                    noteTypeFilter === type ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Note items scroll */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {loading && notes.length === 0 ? (
                <div className="py-20 text-center text-xs text-[var(--text-secondary)]">Loading folders...</div>
              ) : filteredNotes.map(note => {
                const active = selectedNote?.id === note.id
                return (
                  <button
                    key={note.id}
                    onClick={() => {
                      setSelectedNote(note)
                      setEditTitle(note.title)
                      setEditContent(note.content)
                      setPreviewMode(false)
                    }}
                    className={`w-full text-left p-3.5 rounded-xl transition-all cursor-pointer border ${
                      active 
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-md shadow-[var(--accent-glow)]' 
                        : 'border-[var(--border-color)] hover:border-white/20 text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <h5 className="text-xs font-extrabold truncate text-white leading-snug">{note.title || 'Untitled'}</h5>
                      {note.is_encrypted && (
                        <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 ml-1" />
                      )}
                    </div>
                    
                    <p className="text-[10px] truncate opacity-80 mt-1">
                      {note.content || 'Empty note content...'}
                    </p>
                    
                    <span className="text-[8px] opacity-60 block mt-2">
                      Saved {new Date(note.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                )
              })}

              {filteredNotes.length === 0 && !loading && (
                <div className="text-center py-20 text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-color)] rounded-2xl p-4">
                  No notes in this folder.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Active Note Editor */}
        <div className="flex-1 glass-card p-6 flex flex-col justify-between overflow-hidden">
          {selectedNote ? (
            <div className="flex-1 flex flex-col overflow-hidden space-y-4">
              {/* Header Editor panel */}
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4 flex-shrink-0">
                <input 
                  type="text" 
                  value={editTitle}
                  onChange={handleTitleChange}
                  className="bg-transparent border-none text-base font-extrabold text-white focus:outline-none focus:ring-0 w-64"
                  placeholder="Untitled Note"
                />

                <div className="flex items-center gap-2">
                  {selectedNote.note_type === 'shared' && (
                    <button 
                      onClick={() => setShowCollabModal(true)}
                      className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
                      title="Manage Collaborators"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  )}

                  <button 
                    onClick={() => setPreviewMode(!previewMode)}
                    className={`px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-white/5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      previewMode ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    <span>{previewMode ? 'Markdown' : 'Preview'}</span>
                  </button>

                  <button 
                    onClick={() => handleDeleteNote(selectedNote.id)}
                    className="p-2 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 text-rose-500 cursor-pointer"
                    title="Delete Note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Textarea Workspace */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {!previewMode ? (
                  <textarea 
                    value={editContent}
                    onChange={handleContentChange}
                    placeholder="Markdown support enabled! Try using headings (#), lists (-), checkboxes (- [ ]), or code block (``)..."
                    className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 text-xs text-white resize-none font-mono leading-relaxed"
                  />
                ) : (
                  <div 
                    className="text-xs text-white leading-relaxed font-sans"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center">
              <div className="space-y-4 max-w-sm">
                <FileText className="w-12 h-12 text-[var(--text-secondary)] mx-auto opacity-40 animate-pulse" />
                <h4 className="font-extrabold text-sm text-white">Select a Note</h4>
                <p className="text-xs text-[var(--text-secondary)]">Create a new markdown note or open an existing note page from the sidebar panel directory.</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* CREATE NEW NOTE DIALOG */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-panel p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <h4 className="text-base font-extrabold text-white">Create New Note</h4>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">NOTE TITLE</label>
                <input 
                  type="text" 
                  placeholder="e.g. Shopping List, Study Schedule"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2.5 glass-input text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">NOTE TYPE</label>
                  <select 
                    value={newType}
                    onChange={(e: any) => setNewType(e.target.value)}
                    className="w-full px-3 py-2.5 glass-input text-xs focus:ring-0"
                  >
                    <option value="personal">Personal Notes</option>
                    <option value="quick">Quick Notes (Checklist)</option>
                    <option value="shared">Shared Collaboration</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={newEncrypted}
                      onChange={(e) => setNewEncrypted(e.target.checked)}
                      className="rounded accent-[var(--accent)]"
                    />
                    <span className="flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      E2EE Encrypted
                    </span>
                  </label>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-3 rounded-xl btn-premium text-xs font-bold transition-all cursor-pointer"
              >
                Create Note
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SHARE / COLLABORATOR MODAL */}
      {showCollabModal && selectedNote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-panel p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <h4 className="text-base font-extrabold text-white">Manage Collaborators</h4>
              <button 
                onClick={() => {
                  setShowCollabModal(false)
                  setCollabSuccess('')
                }}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCollaborator} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">ADD COLLABORATOR</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter friend username..."
                    value={collabUsername}
                    onChange={(e) => setCollabUsername(e.target.value)}
                    className="flex-1 px-3 py-2.5 glass-input text-xs"
                    required
                  />
                  <button 
                    type="submit"
                    className="px-4 py-2.5 rounded-xl btn-premium text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {collabSuccess && (
                <div className="p-3 bg-black/30 rounded-xl border border-[var(--border-color)] text-[10px] text-emerald-400 font-bold">
                  {collabSuccess}
                </div>
              )}
            </form>

            <div className="space-y-3">
              <span className="text-[10px] font-bold text-[var(--text-secondary)] block uppercase">Active Collaborators:</span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {selectedNote.collaborators?.map((c) => (
                  <div key={c.id} className="p-2.5 bg-black/20 border border-[var(--border-color)] rounded-xl text-xs font-bold text-white">
                    @{c.username} {c.full_name ? `(${c.full_name})` : ''}
                  </div>
                ))}
                {(!selectedNote.collaborators || selectedNote.collaborators.length === 0) && (
                  <span className="text-xs text-[var(--text-secondary)] italic">No other collaborators added yet.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
