import { useState, useEffect } from 'react'
import { 
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, 
  Plus, Trash2, Bell, AlertCircle, RefreshCw, X
} from 'lucide-react'
import { api } from '../services/api'

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  event_type: 'birthday' | 'meeting' | 'exam' | 'anniversary' | 'task' | 'reminder'
  start_time: string
  reminder_minutes_before: number
  is_notified: boolean
  created_at: string
}

export default function SmartCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Event creation form
  const [showAddForm, setShowAddForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<'birthday' | 'meeting' | 'exam' | 'anniversary' | 'task' | 'reminder'>('reminder')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('12:00')
  const [reminderMin, setReminderMin] = useState(60)
  const [saving, setSaving] = useState(false)

  // Selected cell focus
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ]

  const loadEvents = async () => {
    setLoading(true)
    setError(null)
    const monthNum = currentDate.getMonth() + 1
    const yearNum = currentDate.getFullYear()
    const { data, error: apiErr } = await api.get<CalendarEvent[]>(
      `/calendar/events?month=${monthNum}&year=${yearNum}`
    )
    setLoading(false)
    if (apiErr) {
      setError(apiErr)
    } else if (data) {
      setEvents(data)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [currentDate])

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    setSelectedDay(null)
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    setSelectedDay(null)
  }

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !eventDate || !eventTime) return
    setSaving(true)

    // Parse datetime string
    const start_time = new Date(`${eventDate}T${eventTime}:00`).toISOString()

    const { error: apiErr } = await api.post('/calendar/events', {
      title,
      description: description.trim() || null,
      event_type: eventType,
      start_time,
      reminder_minutes_before: reminderMin
    })

    setSaving(false)
    if (!apiErr) {
      setTitle('')
      setDescription('')
      setEventDate('')
      setShowAddForm(false)
      loadEvents()
    } else {
      alert(apiErr)
    }
  }

  const handleDeleteEvent = async (id: string) => {
    const { error: apiErr } = await api.delete(`/calendar/events/${id}`)
    if (!apiErr) {
      loadEvents()
    } else {
      alert(apiErr)
    }
  }

  // Days in month calculation
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDayIndex = new Date(year, month, 1).getDay()
    const lastDay = new Date(year, month + 1, 0).getDate()

    const days = []
    // Padding for empty days from previous month
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null)
    }
    for (let i = 1; i <= lastDay; i++) {
      days.push(i)
    }
    return days
  }

  const daysGrid = getDaysInMonth()

  // Find events on a specific day number
  const getEventsForDay = (dayNum: number) => {
    return events.filter(e => {
      const eDate = new Date(e.start_time)
      return eDate.getDate() === dayNum &&
             eDate.getMonth() === currentDate.getMonth() &&
             eDate.getFullYear() === currentDate.getFullYear()
    })
  }

  const getEventBgColor = (type: string) => {
    switch (type) {
      case 'birthday': return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      case 'meeting': return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      case 'exam': return 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      case 'anniversary': return 'bg-pink-500/20 text-pink-300 border-pink-500/30'
      case 'task': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      default: return 'bg-sky-500/20 text-sky-300 border-sky-500/30'
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Header panel */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <CalendarIcon className="w-7 h-7 text-[var(--accent)]" />
            Smart Calendar
          </h2>
          <p className="text-[var(--text-secondary)] text-sm">Organize your reminders, meetings, exams, and anniversaries visually.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 rounded-xl btn-premium text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* Main planner content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        
        {/* Left Side: Monthly Grid */}
        <div className="lg:col-span-2 glass-card p-6 flex flex-col justify-between overflow-hidden">
          {/* Controls */}
          <div className="flex justify-between items-center mb-6 flex-shrink-0">
            <h3 className="text-base font-extrabold text-white">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>

            <div className="flex gap-2">
              <button 
                onClick={handlePrevMonth}
                className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={handleNextMonth}
                className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar Table Grid */}
          <div className="flex-1 grid grid-cols-7 gap-2 min-h-0 text-xs">
            {/* Headers */}
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className="text-center font-bold text-[var(--text-secondary)] uppercase tracking-wider py-1 select-none">
                {day}
              </div>
            ))}

            {/* Days Cells */}
            {daysGrid.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="bg-transparent rounded-xl" />
              const dayEvents = getEventsForDay(day)
              const selected = selectedDay === day
              const today = new Date()
              const isToday = today.getDate() === day && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear()

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`w-full h-full p-2 border flex flex-col justify-between rounded-xl transition-all text-left relative cursor-pointer ${
                    selected 
                      ? 'border-[var(--accent)] bg-[var(--accent-glow)]' 
                      : isToday
                      ? 'border-emerald-500 bg-emerald-500/5'
                      : 'border-[var(--border-color)] hover:border-[var(--text-secondary)] hover:bg-white/5'
                  }`}
                >
                  <span className={`font-bold ${isToday ? 'text-emerald-400 font-black' : 'text-white'}`}>{day}</span>
                  
                  {/* Event indicators */}
                  {dayEvents.length > 0 && (
                    <div className="flex gap-1 overflow-x-auto w-full mt-2 scrollbar-none">
                      {dayEvents.slice(0, 3).map(e => (
                        <div 
                          key={e.id}
                          className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] flex-shrink-0"
                          title={e.title}
                          style={{
                            backgroundColor: e.event_type === 'birthday' ? '#f59e0b' : e.event_type === 'exam' ? '#f43f5e' : e.event_type === 'task' ? '#10b981' : '#6366f1'
                          }}
                        />
                      ))}
                      {dayEvents.length > 3 && <span className="text-[8px] font-bold text-[var(--text-secondary)] leading-none">+</span>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Side: Day Details & Reminders */}
        <div className="glass-card p-6 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden space-y-6">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Bell className="w-5 h-5 text-[var(--accent)]" />
              <h4 className="text-sm font-extrabold text-white">
                {selectedDay 
                  ? `Agenda for ${monthNames[currentDate.getMonth()]} ${selectedDay}`
                  : 'Monthly Overview'
                }
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {loading ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
                  <span>Syncing agenda...</span>
                </div>
              ) : error ? (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
                  {error}
                </div>
              ) : (
                (selectedDay ? getEventsForDay(selectedDay) : events).map(event => (
                  <div 
                    key={event.id}
                    className={`p-4 border rounded-xl flex items-start justify-between transition-all ${getEventBgColor(event.event_type)}`}
                  >
                    <div className="min-w-0 space-y-1">
                      <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-black/25 rounded-md border border-white/5">
                        {event.event_type}
                      </span>
                      <h5 className="text-xs font-bold text-white truncate pt-1">{event.title}</h5>
                      <p className="text-[10px] opacity-80 line-clamp-2">{event.description || 'No details provided.'}</p>
                      
                      <div className="flex items-center gap-1 text-[8px] font-semibold pt-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {new Date(event.start_time).toLocaleDateString()} @ {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <button 
                      onClick={() => handleDeleteEvent(event.id)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-rose-400 flex-shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}

              {((selectedDay ? getEventsForDay(selectedDay) : events).length === 0) && !loading && (
                <div className="text-center py-20 text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-color)] rounded-xl p-4">
                  No events or reminders logged for this day. Click "Add Event" to plan ahead!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL EVENT CREATOR */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-panel p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <h4 className="text-base font-extrabold text-white">Create New Event</h4>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">EVENT TITLE</label>
                <input 
                  type="text" 
                  placeholder="e.g. Coding DSA Session, Exam Review"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 glass-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">DESCRIPTION</label>
                <textarea 
                  placeholder="Details/reminders..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2.5 glass-input text-xs h-16"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">DATE</label>
                  <input 
                    type="date" 
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2.5 glass-input text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">TIME</label>
                  <input 
                    type="time" 
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-full px-3 py-2.5 glass-input text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">EVENT CATEGORY</label>
                  <select 
                    value={eventType}
                    onChange={(e: any) => setEventType(e.target.value)}
                    className="w-full px-3 py-2.5 glass-input text-xs focus:ring-0"
                  >
                    <option value="reminder">Reminder</option>
                    <option value="birthday">Birthday</option>
                    <option value="meeting">Meeting</option>
                    <option value="exam">Exam</option>
                    <option value="anniversary">Anniversary</option>
                    <option value="task">Task</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">REMINDER BEFORE</label>
                  <select 
                    value={reminderMin}
                    onChange={(e) => setReminderMin(Number(e.target.value))}
                    className="w-full px-3 py-2.5 glass-input text-xs focus:ring-0"
                  >
                    <option value={0}>At event time</option>
                    <option value={15}>15 minutes before</option>
                    <option value={60}>1 hour before</option>
                    <option value={1440}>1 day before</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl btn-premium text-xs font-bold transition-all cursor-pointer"
              >
                {saving ? 'Creating event...' : 'Create Event'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
