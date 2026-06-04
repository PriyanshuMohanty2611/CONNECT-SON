import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Heart, Sparkles, Calendar, Camera, Clock, 
  Upload, Trash2, ShieldCheck, HelpCircle, Activity 
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import AIMemoryView from '../components/AIMemoryView'

interface Memory {
  id: string
  user_id: string
  partner_id: string
  title: string
  description: string | null
  file_url: string
  file_type: string
  is_encrypted: boolean
  created_at: string
}

interface Anniversary {
  id: string
  title: string
  anniversary_date: string
  reminder_days_before: number
}

interface TimelineStats {
  first_chat_date: string | null
  first_friend_request_date: string | null
  total_messages: number
  shared_photos_count: number
}

export default function RelationshipHub() {
  const { user } = useAuth()
  
  const [activeTab, setActiveTab] = useState<'calculator' | 'compatibility' | 'anniversaries' | 'memories' | 'timeline'>('calculator')
  
  const [friendsList, setFriendsList] = useState<any[]>([])
  const [selectedPartner, setSelectedPartner] = useState<string>('')
  
  // Love Calc
  const [name1, setName1] = useState(user?.profile?.full_name || user?.username || '')
  const [name2, setName2] = useState('')
  const [lovePercentage, setLovePercentage] = useState<number | null>(null)
  const [lovePhrase, setLovePhrase] = useState('')
  const [calculating, setCalculating] = useState(false)

  // Compatibility
  const [compatResult, setCompatResult] = useState<any | null>(null)
  const [loadingCompat, setLoadingCompat] = useState(false)

  // Anniversary state
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([])
  const [newAnnivTitle, setNewAnnivTitle] = useState('')
  const [newAnnivDate, setNewAnnivDate] = useState('')
  const [savingAnniv, setSavingAnniv] = useState(false)

  // Memory Vault state
  const [memories, setMemories] = useState<Memory[]>([])
  const [memoryFile, setMemoryFile] = useState<File | null>(null)
  const [memoryTitle, setMemoryTitle] = useState('')
  const [memoryDesc, setMemoryDesc] = useState('')
  const [isEncryptedMemory, setIsEncryptedMemory] = useState(false)
  const [uploadingMemory, setUploadingMemory] = useState(false)

  // Timeline stats
  const [timelineStats, setTimelineStats] = useState<TimelineStats | null>(null)

  useEffect(() => {
    // Load friends/partners
    api.get<any[]>('/friends/').then(res => {
      if (res.data) setFriendsList(res.data)
    })
  }, [])

  useEffect(() => {
    if (selectedPartner) {
      loadAnniversaries()
      loadMemories()
      loadTimelineStats()
      loadCompatibility()
    }
  }, [selectedPartner])

  // Love Calculator Run
  const handleLoveCalc = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name2.trim()) return
    setCalculating(true)
    setLovePercentage(null)
    
    // Call endpoints
    const { data } = await api.get<any>(`/relationship/love-calc?name1=${encodeURIComponent(name1)}&name2=${encodeURIComponent(name2)}`)
    setTimeout(() => {
      setCalculating(false)
      if (data) {
        setLovePercentage(data.percentage)
        setLovePhrase(data.vibe)
      }
    }, 1500)
  }

  // Load Compatibility
  const loadCompatibility = async () => {
    if (!selectedPartner) return
    setLoadingCompat(true)
    const { data } = await api.get<any>(`/relationship/compatibility/${selectedPartner}`)
    setLoadingCompat(false)
    if (data) setCompatResult(data)
  }

  // Load Anniversaries
  const loadAnniversaries = async () => {
    const { data } = await api.get<Anniversary[]>('/relationship/anniversary')
    if (data) {
      // Filter anniversaries for selected partner
      setAnniversaries(data)
    }
  }

  const handleSaveAnniversary = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAnnivTitle.trim() || !newAnnivDate || !selectedPartner) return
    setSavingAnniv(true)
    const { error } = await api.post('/relationship/anniversary', {
      partner_id: selectedPartner,
      title: newAnnivTitle,
      anniversary_date: newAnnivDate,
      reminder_days_before: 1
    })
    setSavingAnniv(false)
    if (!error) {
      setNewAnnivTitle('')
      setNewAnnivDate('')
      loadAnniversaries()
    }
  }

  const handleDeleteAnniversary = async (id: string) => {
    await api.delete(`/relationship/anniversary/${id}`)
    loadAnniversaries()
  }

  // Load Memory Vault
  const loadMemories = async () => {
    if (!selectedPartner) return
    const { data } = await api.get<Memory[]>(`/relationship/memories/${selectedPartner}`)
    if (data) setMemories(data)
  }

  const handleUploadMemory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memoryFile || !memoryTitle.trim() || !selectedPartner) return
    setUploadingMemory(true)

    const formData = new FormData()
    formData.append('file', memoryFile)

    const endpoint = `/relationship/memories?title=${encodeURIComponent(memoryTitle)}&description=${encodeURIComponent(memoryDesc)}&partner_id=${selectedPartner}&is_encrypted=${isEncryptedMemory}`
    const { error } = await api.post(endpoint, formData)
    setUploadingMemory(false)
    if (!error) {
      setMemoryTitle('')
      setMemoryDesc('')
      setMemoryFile(null)
      loadMemories()
    } else {
      alert(error)
    }
  }

  // Load Couple Timeline Stats
  const loadTimelineStats = async () => {
    if (!selectedPartner) return
    const { data } = await api.get<TimelineStats>(`/relationship/timeline/${selectedPartner}`)
    if (data) setTimelineStats(data)
  }

  // Countdown timer calculation
  const getCountdown = (dateStr: string) => {
    const eventDate = new Date(dateStr)
    const now = new Date()
    // Set to current year to count down to upcoming
    eventDate.setFullYear(now.getFullYear())
    if (eventDate.getTime() < now.getTime()) {
      eventDate.setFullYear(now.getFullYear() + 1)
    }
    const diff = eventDate.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return `${days} Days Left`
  }

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between flex-shrink-0 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Heart className="w-7 h-7 text-rose-500 fill-rose-500" />
            Relationship Hub
          </h2>
          <p className="text-[var(--text-secondary)] text-sm">Calculate compatibility, set anniversaries, and save vaulted memories.</p>
        </div>

        {/* Selected Partner Selector */}
        <div className="flex items-center gap-2 bg-[var(--bg-card)] p-2 rounded-xl border border-[var(--border-color)]">
          <span className="text-xs font-bold text-[var(--text-secondary)] pl-1">Partner:</span>
          <select 
            value={selectedPartner}
            onChange={(e) => setSelectedPartner(e.target.value)}
            className="px-3 py-1.5 glass-input text-xs w-48 border-none focus:ring-0"
          >
            <option value="">-- Choose Partner --</option>
            {friendsList.map((f: any) => (
              <option key={f.id} value={f.id}>{f.profile?.full_name || f.username}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border-color)] pb-2 flex-shrink-0">
        {(['calculator', 'compatibility', 'anniversaries', 'memories', 'timeline'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            disabled={tab !== 'calculator' && !selectedPartner}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === tab 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                : 'text-[var(--text-secondary)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <span className="capitalize">{tab === 'anniversaries' ? 'Anniversaries' : tab === 'calculator' ? 'Love Calculator' : tab}</span>
          </button>
        ))}
      </div>

      {/* Main workspace */}
      <div className="flex-1 overflow-y-auto min-h-0">
        
        {/* 1. LOVE CALCULATOR */}
        {activeTab === 'calculator' && (
          <div className="max-w-md mx-auto glass-card p-8 text-center space-y-6">
            <h4 className="text-lg font-black text-white">Love Calculator Percentage</h4>
            <p className="text-xs text-[var(--text-secondary)]">Enter two names to calculate their fun cosmic match rating.</p>
            
            <form onSubmit={handleLoveCalc} className="space-y-4">
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Your Name"
                  value={name1}
                  onChange={(e) => setName1(e.target.value)}
                  className="w-full px-4 py-3 glass-input text-xs font-bold"
                  required
                />
                <input 
                  type="text" 
                  placeholder="Partner's Name"
                  value={name2}
                  onChange={(e) => setName2(e.target.value)}
                  className="w-full px-4 py-3 glass-input text-xs font-bold"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={calculating}
                className="w-full py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-all shadow-md shadow-rose-500/20 cursor-pointer"
              >
                {calculating ? 'Analyzing cosmic waves...' : 'Calculate Love %'}
              </button>
            </form>

            {/* Heart score layout */}
            {lovePercentage !== null && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative py-6 flex flex-col items-center"
              >
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <Heart className="w-full h-full text-rose-500 fill-rose-500/20 animate-pulse absolute filter drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                  <span className="text-3xl font-black text-rose-100 z-10 font-heading drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{lovePercentage}%</span>
                </div>
                <h5 className="font-extrabold text-sm text-white mt-4">"{lovePhrase}"</h5>
              </motion.div>
            )}
          </div>
        )}

        {/* 2. COMPATIBILITY METER */}
        {activeTab === 'compatibility' && selectedPartner && (
          <div className="max-w-xl mx-auto glass-card p-6 space-y-6">
            <h4 className="text-lg font-black text-white text-center">Compatibility Analysis</h4>
            <p className="text-xs text-[var(--text-secondary)] text-center">Calculated based on overlapping interests, music, movies, and hobbies.</p>

            {loadingCompat ? (
              <div className="py-12 text-center text-[var(--text-secondary)]">Analyzing profiles...</div>
            ) : compatResult ? (
              <div className="space-y-6">
                {/* Score bar */}
                <div className="flex flex-col items-center">
                  <div className="text-3xl font-black text-rose-400">{compatResult.score}%</div>
                  <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-1">Overlay rating</span>
                  <div className="w-full bg-white/5 h-3 rounded-full overflow-hidden mt-3 max-w-sm border border-white/5 p-[1px]">
                    <div 
                      className="bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(244,63,94,0.5)]" 
                      style={{ width: `${compatResult.score}%` }} 
                    />
                  </div>
                </div>

                {/* Overlaps lists */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border-color)]">
                  <div className="p-3 bg-black/20 rounded-xl">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-1">Common Hobbies</span>
                    <ul className="text-xs text-white space-y-1 list-disc pl-4">
                      {compatResult.common_hobbies.map((h: string, idx: number) => <li key={idx}>{h}</li>)}
                      {compatResult.common_hobbies.length === 0 && <span className="text-[10px] text-[var(--text-secondary)]">None shared yet.</span>}
                    </ul>
                  </div>

                  <div className="p-3 bg-black/20 rounded-xl">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-1">Common Interests</span>
                    <ul className="text-xs text-white space-y-1 list-disc pl-4">
                      {compatResult.common_interests.map((h: string, idx: number) => <li key={idx}>{h}</li>)}
                      {compatResult.common_interests.length === 0 && <span className="text-[10px] text-[var(--text-secondary)]">None shared yet.</span>}
                    </ul>
                  </div>

                  <div className="p-3 bg-black/20 rounded-xl">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-1">Common Music</span>
                    <ul className="text-xs text-white space-y-1 list-disc pl-4">
                      {compatResult.common_music.map((h: string, idx: number) => <li key={idx}>{h}</li>)}
                      {compatResult.common_music.length === 0 && <span className="text-[10px] text-[var(--text-secondary)]">None shared yet.</span>}
                    </ul>
                  </div>

                  <div className="p-3 bg-black/20 rounded-xl">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-1">Common Movies</span>
                    <ul className="text-xs text-white space-y-1 list-disc pl-4">
                      {compatResult.common_movies.map((h: string, idx: number) => <li key={idx}>{h}</li>)}
                      {compatResult.common_movies.length === 0 && <span className="text-[10px] text-[var(--text-secondary)]">None shared yet.</span>}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* 3. ANNIVERSARIES */}
        {activeTab === 'anniversaries' && selectedPartner && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Create Anniversary */}
            <div className="glass-card p-6 space-y-4">
              <h4 className="text-base font-extrabold text-white">Save Anniversary Date</h4>
              <p className="text-xs text-[var(--text-secondary)]">Connect-On will automatically push alerts 1 day before the anniversary date.</p>
              
              <form onSubmit={handleSaveAnniversary} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">TITLE</label>
                  <input 
                    type="text" 
                    placeholder="e.g. First Proposal, Engagement"
                    value={newAnnivTitle}
                    onChange={(e) => setNewAnnivTitle(e.target.value)}
                    className="w-full px-3 py-2.5 glass-input text-xs font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">ANNIVERSARY DATE</label>
                  <input 
                    type="date" 
                    value={newAnnivDate}
                    onChange={(e) => setNewAnnivDate(e.target.value)}
                    className="w-full px-3 py-2.5 glass-input text-xs font-semibold"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  disabled={savingAnniv}
                  className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer transition-all"
                >
                  {savingAnniv ? 'Saving date...' : 'Save Date'}
                </button>
              </form>
            </div>

            {/* List anniversaries */}
            <div className="glass-card p-6 space-y-4">
              <h4 className="text-base font-extrabold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-rose-500" />
                Active Calendars
              </h4>

              <div className="space-y-3">
                {anniversaries.map((ann) => (
                  <div 
                    key={ann.id}
                    className="p-4 bg-black/20 border border-[var(--border-color)] rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <h5 className="text-xs font-bold text-white">{ann.title}</h5>
                      <span className="text-[10px] text-[var(--text-secondary)] block mt-0.5">
                        {new Date(ann.anniversary_date).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black px-2.5 py-1 bg-rose-500/10 text-rose-400 rounded-full">
                        {getCountdown(ann.anniversary_date)}
                      </span>
                      <button 
                        onClick={() => handleDeleteAnniversary(ann.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {anniversaries.length === 0 && (
                  <div className="text-center py-12 text-xs text-[var(--text-secondary)]">No anniversaries configured.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 4. MEMORY VAULT */}
        {activeTab === 'memories' && selectedPartner && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Upload Memory Form */}
            <div className="glass-card p-6">
              <h4 className="text-base font-extrabold text-white mb-2">Upload Vault Memories</h4>
              <p className="text-xs text-[var(--text-secondary)] mb-4">Store couple photos, letters, and voice clips inside our private encrypted vault.</p>

              <form onSubmit={handleUploadMemory} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">TITLE</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Beach Picnic Trip"
                      value={memoryTitle}
                      onChange={(e) => setMemoryTitle(e.target.value)}
                      className="w-full px-3 py-2.5 glass-input text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">DESCRIPTION</label>
                    <textarea 
                      placeholder="A short note about this memory..."
                      value={memoryDesc}
                      onChange={(e) => setMemoryDesc(e.target.value)}
                      className="w-full px-3 py-2.5 glass-input text-xs h-16"
                    />
                  </div>
                </div>

                <div className="space-y-4 flex flex-col justify-between">
                  <div className="flex gap-4 items-center">
                    <input 
                      type="file" 
                      onChange={(e) => setMemoryFile(e.target.files?.[0] || null)}
                      className="hidden" 
                      id="memory-file-input"
                    />
                    <button 
                      type="button"
                      onClick={() => document.getElementById('memory-file-input')?.click()}
                      className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-xs font-bold text-white hover:bg-white/5 cursor-pointer flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{memoryFile ? memoryFile.name : 'Select File'}</span>
                    </button>

                    <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isEncryptedMemory}
                        onChange={(e) => setIsEncryptedMemory(e.target.checked)}
                        className="rounded accent-rose-500"
                      />
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Encrypted
                      </span>
                    </label>
                  </div>

                  <button 
                    type="submit"
                    disabled={uploadingMemory || !memoryFile}
                    className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-all cursor-pointer"
                  >
                    {uploadingMemory ? 'Uploading to vault...' : 'Upload Memory'}
                  </button>
                </div>
              </form>
            </div>

            {/* Memories listing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {memories.map((mem) => (
                <div 
                  key={mem.id}
                  className="glass-card overflow-hidden group border border-[var(--border-color)] hover:border-rose-500/30 transition-all flex flex-col"
                >
                  <div className="h-40 w-full bg-slate-900 overflow-hidden relative">
                    {mem.file_type.startsWith('image/') ? (
                      <img 
                        src={mem.file_url} 
                        alt={mem.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                      />
                    ) : mem.file_type.startsWith('video/') ? (
                      <video src={mem.file_url} controls className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="w-10 h-10 text-[var(--text-secondary)]" />
                      </div>
                    )}

                    {mem.is_encrypted && (
                      <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Secure</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h5 className="font-extrabold text-xs text-white">{mem.title}</h5>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-1 line-clamp-2">{mem.description || 'No description.'}</p>
                    </div>

                    <span className="text-[9px] text-[var(--text-secondary)] block mt-3">
                      Uploaded {new Date(mem.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}

              {memories.length === 0 && (
                <div className="text-center py-20 border-dashed border-2 border-[var(--border-color)] rounded-2xl col-span-3 text-xs text-[var(--text-secondary)]">
                  Memory vault is currently empty. Start uploading photos to create a history log!
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. TIMELINE */}
        {activeTab === 'timeline' && selectedPartner && (
          <AIMemoryView 
            partnerId={selectedPartner} 
            partnerName={friendsList.find(f => f.id === selectedPartner)?.profile?.full_name || friendsList.find(f => f.id === selectedPartner)?.username || 'Partner'} 
          />
        )}

      </div>
    </div>
  )
}
