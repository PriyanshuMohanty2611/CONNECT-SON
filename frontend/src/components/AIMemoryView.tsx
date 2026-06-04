import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Heart, Calendar, Camera, Clock, Award, BookOpen, Compass } from 'lucide-react'
import { api } from '../services/api'

interface AIMemoryViewProps {
  partnerId: string
  partnerName: string
}

export default function AIMemoryView({ partnerId, partnerName }: AIMemoryViewProps) {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeSection, setActiveSection] = useState<'timeline' | 'journal' | 'recap'>('timeline')

  useEffect(() => {
    if (partnerId) {
      loadRecap()
    }
  }, [partnerId])

  const loadRecap = async () => {
    setLoading(true)
    const { data: recapData } = await api.get<any>(`/relationship/ai-memory/recap/${partnerId}`)
    setLoading(false)
    if (recapData) {
      setData(recapData)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
        <p className="text-xs text-[var(--text-secondary)] font-medium animate-pulse">Syncing cosmic memories and compiling timeline...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 glass-card max-w-md mx-auto space-y-4">
        <Sparkles className="w-12 h-12 text-rose-400 mx-auto opacity-80" />
        <h4 className="text-sm font-bold text-white">No AI Memory compilation found</h4>
        <p className="text-xs text-[var(--text-secondary)] px-4">Start messaging and uploading pictures to your private vault to generate an AI memory capsule.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Dynamic Summary Panel */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-[var(--border-color)] bg-gradient-to-br from-rose-500/10 via-purple-500/5 to-transparent p-6 md:p-8"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full filter blur-3xl -z-10 animate-pulse" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 rounded-full flex items-center gap-1 border border-rose-500/30">
                <Sparkles className="w-3 h-3 fill-rose-400 animate-pulse" />
                AI Memory Capsule
              </span>
              <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">
                {data.yearly_summary?.communication_rank || 'Connected'}
              </span>
            </div>
            <h3 className="text-xl md:text-2xl font-black text-white leading-tight">
              A Journey with {partnerName}
            </h3>
            <p className="text-xs md:text-sm text-[var(--text-secondary)] leading-relaxed">
              {data.summary}
            </p>
          </div>
          
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4 flex-shrink-0">
            <div className="bg-black/35 border border-[var(--border-color)] rounded-2xl p-4 text-center min-w-[100px]">
              <span className="text-xl md:text-2xl font-black text-rose-400">{data.metrics?.total_messages || 0}</span>
              <span className="text-[9px] text-[var(--text-secondary)] block font-bold uppercase mt-1">Messages</span>
            </div>
            <div className="bg-black/35 border border-[var(--border-color)] rounded-2xl p-4 text-center min-w-[100px]">
              <span className="text-xl md:text-2xl font-black text-purple-400">{data.metrics?.total_memories || 0}</span>
              <span className="text-[9px] text-[var(--text-secondary)] block font-bold uppercase mt-1">Memories</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Sub Tabs */}
      <div className="flex justify-center gap-2 border-b border-[var(--border-color)] pb-3">
        {[
          { id: 'timeline', label: 'Memory Timeline', icon: Clock },
          { id: 'journal', label: 'Life Journal', icon: BookOpen },
          { id: 'recap', label: 'Friendship Recap', icon: Compass }
        ].map(sect => {
          const Icon = sect.icon
          return (
            <button
              key={sect.id}
              onClick={() => setActiveSection(sect.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                activeSection === sect.id
                  ? 'bg-white/10 text-white border-white/20'
                  : 'text-[var(--text-secondary)] border-transparent hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{sect.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      <div className="min-h-[300px]">
        <AnimatePresence mode="wait">
          {activeSection === 'timeline' && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="relative border-l border-rose-500/20 ml-4 md:ml-8 pl-6 md:pl-10 space-y-8 py-4"
            >
              {data.timeline?.map((item: any, idx: number) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative group"
                >
                  {/* Bullet Node */}
                  <span className="absolute -left-[31px] md:-left-[47px] top-1.5 w-4 h-4 rounded-full bg-gradient-to-tr from-rose-500 to-purple-500 border-2 border-black group-hover:scale-125 transition-transform duration-300 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
                  
                  {/* Time bubble */}
                  <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                    {new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>

                  {/* Card content */}
                  <div className="mt-2 bg-white/5 border border-white/10 p-5 rounded-2xl group-hover:border-rose-500/35 transition-all duration-300 max-w-2xl hover:bg-white/8 hover:translate-x-1 shadow-md hover:shadow-lg">
                    <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                      {item.type === 'anniversary' && <Calendar className="w-3.5 h-3.5 text-yellow-400" />}
                      {item.type === 'connection' && <Award className="w-3.5 h-3.5 text-emerald-400" />}
                      {item.type === 'memory' && <Camera className="w-3.5 h-3.5 text-purple-400" />}
                      {item.title}
                    </h4>
                    <p className="text-[10px] md:text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
                      {item.description}
                    </p>

                    {item.file_url && (
                      <div className="mt-4 rounded-xl overflow-hidden max-h-60 bg-slate-900 border border-[var(--border-color)]">
                        {item.file_type?.startsWith('image/') ? (
                          <img src={item.file_url} alt={item.title} className="w-full object-cover max-h-60" />
                        ) : (
                          <video src={item.file_url} controls className="w-full max-h-60 object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {activeSection === 'journal' && (
            <motion.div
              key="journal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {data.life_journal?.map((entry: any, idx: number) => (
                <div key={idx} className="glass-card overflow-hidden flex flex-col justify-between border border-[var(--border-color)] hover:border-white/10 transition-all">
                  {entry.media_url && (
                    <div className="h-48 w-full bg-slate-900 overflow-hidden">
                      {entry.media_type?.startsWith('image/') ? (
                        <img src={entry.media_url} alt={entry.title} className="w-full h-full object-cover" />
                      ) : (
                        <video src={entry.media_url} className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <span className="text-[10px] text-[var(--text-secondary)] font-bold">{entry.date}</span>
                      <h4 className="text-sm font-black text-white">{entry.title}</h4>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
                        "{entry.content}"
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeSection === 'recap' && (
            <motion.div
              key="recap"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-xl mx-auto space-y-6"
            >
              <div className="glass-card p-6 border border-[var(--border-color)] text-center space-y-4 bg-gradient-to-b from-purple-500/5 to-transparent">
                <Sparkles className="w-10 h-10 text-purple-400 mx-auto" />
                <h4 className="text-base font-extrabold text-white">Sentiment & Recap</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {data.yearly_summary?.text}
                </p>
                <div className="pt-2">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block">Compatibility Sentiment</span>
                  <span className="text-lg font-black text-rose-400 mt-1 block">{data.yearly_summary?.sentiment}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-4 border border-[var(--border-color)]">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-2">Common Hobbies</span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.friendship_recap?.common_hobbies?.map((h: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] text-white font-bold">{h}</span>
                    ))}
                    {(!data.friendship_recap?.common_hobbies || data.friendship_recap.common_hobbies.length === 0) && (
                      <span className="text-[10px] text-[var(--text-secondary)]">None identified yet.</span>
                    )}
                  </div>
                </div>

                <div className="glass-card p-4 border border-[var(--border-color)]">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-2">Common Music</span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.friendship_recap?.common_music?.map((h: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] text-white font-bold">{h}</span>
                    ))}
                    {(!data.friendship_recap?.common_music || data.friendship_recap.common_music.length === 0) && (
                      <span className="text-[10px] text-[var(--text-secondary)]">None identified yet.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card p-4 border border-[var(--border-color)] text-center text-xs text-[var(--text-secondary)]">
                {data.friendship_recap?.description}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
