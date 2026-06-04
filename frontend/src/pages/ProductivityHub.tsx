import { useState, useEffect, useRef } from 'react'
import { 
  CheckCircle, Play, Pause, RotateCcw, Plus, Trash2, 
  Flame, Award, Check, Sparkles, Droplets, Target, Activity 
} from 'lucide-react'
import { api } from '../services/api'

interface Goal {
  id: string
  title: string
  is_completed: boolean
  date: string
}

interface Habit {
  id: string
  name: string
  streak: number
  max_streak: number
  last_done_date: string | null
}

export default function ProductivityHub() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [loadingGoals, setLoadingGoals] = useState(false)
  const [loadingHabits, setLoadingHabits] = useState(false)

  // Goal Form
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [savingGoal, setSavingGoal] = useState(false)

  // Habit Form
  const [newHabitName, setNewHabitName] = useState('')
  const [savingHabit, setSavingHabit] = useState(false)

  // Pomodoro timer states
  const [minutes, setMinutes] = useState(25)
  const [seconds, setSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus')
  const timerRef = useRef<any>(null)

  useEffect(() => {
    loadGoals()
    loadHabits()
  }, [])

  const loadGoals = async () => {
    setLoadingGoals(true)
    const { data } = await api.get<Goal[]>('/productivity/goals')
    setLoadingGoals(false)
    if (data) setGoals(data)
  }

  const loadHabits = async () => {
    setLoadingHabits(true)
    const { data } = await api.get<Habit[]>('/productivity/habits')
    setLoadingHabits(false)
    if (data) setHabits(data)
  }

  // Daily goals handlers
  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGoalTitle.trim()) return
    setSavingGoal(true)
    const todayStr = new Date().toISOString().split('T')[0]
    const { error } = await api.post('/productivity/goals', {
      title: newGoalTitle.trim(),
      date: todayStr
    })
    setSavingGoal(false)
    if (!error) {
      setNewGoalTitle('')
      loadGoals()
    }
  }

  const handleToggleGoal = async (id: string, currentStatus: boolean) => {
    const { error } = await api.put(`/productivity/goals/${id}`, {
      is_completed: !currentStatus
    })
    if (!error) {
      setGoals(prev => prev.map(g => g.id === id ? { ...g, is_completed: !currentStatus } : g))
    }
  }

  // Habits handlers
  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHabitName.trim()) return
    setSavingHabit(true)
    const { error } = await api.post('/productivity/habits', {
      name: newHabitName.trim()
    })
    setSavingHabit(false)
    if (!error) {
      setNewHabitName('')
      loadHabits()
    }
  }

  const handleHabitCheckin = async (id: string) => {
    const { data, error } = await api.post<any>(`/productivity/habits/${id}/checkin`)
    if (data && !error) {
      alert(data.message)
      loadHabits()
    } else {
      alert(error)
    }
  }

  // Pomodoro timer logic
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        if (seconds > 0) {
          setSeconds(seconds - 1)
        } else if (minutes > 0) {
          setMinutes(minutes - 1)
          setSeconds(59)
        } else {
          // Switch modes
          clearInterval(timerRef.current)
          setTimerRunning(false)
          
          if (timerMode === 'focus') {
            alert('Focus session completed! Time for a short break.')
            setTimerMode('break')
            setMinutes(5)
          } else {
            alert('Break completed! Back to focus.')
            setTimerMode('focus')
            setMinutes(25)
          }
          setSeconds(0)
        }
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timerRunning, minutes, seconds, timerMode])

  const toggleTimer = () => setTimerRunning(!timerRunning)

  const resetTimer = () => {
    setTimerRunning(false)
    setTimerMode('focus')
    setMinutes(25)
    setSeconds(0)
  }

  // Goal Progress bar percentage
  const goalProgress = goals.length > 0 
    ? Math.round((goals.filter(g => g.is_completed).length / goals.length) * 100)
    : 0

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Header */}
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Activity className="w-7 h-7 text-[var(--accent)]" />
          Productivity Hub
        </h2>
        <p className="text-[var(--text-secondary)] text-sm">Drink water, log habits, study DSA, and focus with Pomodoro focus sessions.</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto min-h-0 pr-1">
        
        {/* Left Side: Daily Goals & Checklists */}
        <div className="glass-card p-6 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            <div className="flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-400" />
                Daily Checklist
              </h3>
              <span className="text-[10px] text-indigo-400 font-bold px-2 py-0.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                {goalProgress}% done
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden flex-shrink-0">
              <div 
                className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${goalProgress}%` }}
              />
            </div>

            {/* Goals form list */}
            <form onSubmit={handleAddGoal} className="flex gap-2 flex-shrink-0 pt-2">
              <input 
                type="text" 
                placeholder="Drink 3L water, Workout..."
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                className="flex-1 px-3 py-2 glass-input text-xs"
                required
              />
              <button 
                type="submit"
                disabled={savingGoal}
                className="px-3 py-2 rounded-xl btn-premium text-xs font-bold cursor-pointer"
              >
                Add
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 pt-2">
              {loadingGoals ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">Syncing checklist...</div>
              ) : goals.map((goal) => (
                <button
                  key={goal.id}
                  onClick={() => handleToggleGoal(goal.id, goal.is_completed)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left cursor-pointer ${
                    goal.is_completed 
                      ? 'border-indigo-500/30 bg-indigo-500/5 text-[var(--text-secondary)]' 
                      : 'border-[var(--border-color)] hover:border-white/20 text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                      goal.is_completed ? 'border-indigo-500 bg-indigo-500' : 'border-[var(--border-color)]'
                    }`}>
                      {goal.is_completed && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-xs truncate ${goal.is_completed ? 'line-through opacity-60' : ''}`}>{goal.title}</span>
                  </div>
                </button>
              ))}

              {goals.length === 0 && !loadingGoals && (
                <div className="text-center py-16 text-xs text-[var(--text-secondary)]">No goals configured for today. Plan ahead!</div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Habit Tracker Grid */}
        <div className="glass-card p-6 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2 flex-shrink-0">
              <Flame className="w-5 h-5 text-orange-500" />
              Habit Streaks
            </h3>

            <form onSubmit={handleAddHabit} className="flex gap-2 flex-shrink-0">
              <input 
                type="text" 
                placeholder="Study DSA, Meditate, Gym..."
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                className="flex-1 px-3 py-2 glass-input text-xs"
                required
              />
              <button 
                type="submit"
                disabled={savingHabit}
                className="px-3 py-2 rounded-xl btn-premium text-xs font-bold cursor-pointer"
              >
                Create
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {loadingHabits ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">Syncing streaks...</div>
              ) : habits.map((habit) => (
                <div 
                  key={habit.id}
                  className="p-4 bg-black/20 border border-[var(--border-color)] rounded-xl flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-white truncate">{habit.name}</h5>
                    <span className="text-[10px] text-[var(--text-secondary)] block mt-0.5">
                      Max streak: {habit.max_streak} days
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full text-orange-400 text-xs font-extrabold">
                      <Flame className="w-3.5 h-3.5 fill-orange-500/20" />
                      <span>{habit.streak}d</span>
                    </div>

                    <button 
                      onClick={() => handleHabitCheckin(habit.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-bold cursor-pointer transition-all shadow-md shadow-[var(--accent-glow)]"
                    >
                      Check-in
                    </button>
                  </div>
                </div>
              ))}

              {habits.length === 0 && !loadingHabits && (
                <div className="text-center py-16 text-xs text-[var(--text-secondary)]">No habits tracked. Start logging habits to build streaks!</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Pomodoro Focus Timer */}
        <div className="glass-card p-6 flex flex-col justify-center items-center text-center space-y-6">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-white/10 rounded-full text-[var(--accent)] border border-white/5">
              {timerMode === 'focus' ? 'Focus Session' : 'Short Break'}
            </span>
            <h3 className="text-sm text-[var(--text-secondary)] pt-2">Pomodoro focus block</h3>
          </div>

          {/* Large countdown circle display */}
          <div className="relative w-44 h-44 rounded-full border-4 border-[var(--border-color)] flex flex-col items-center justify-center bg-black/10">
            <span className="text-4xl font-black text-white leading-none">
              {minutes}:{seconds < 10 ? '0' : ''}{seconds}
            </span>
            <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-2">
              {timerRunning ? 'Timer Active' : 'Paused'}
            </span>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={toggleTimer}
              className="px-5 py-2.5 rounded-xl btn-premium text-xs font-bold cursor-pointer"
            >
              {timerRunning ? 'Pause' : 'Start Focus'}
            </button>
            <button 
              onClick={resetTimer}
              className="p-2.5 rounded-xl border border-[var(--border-color)] hover:bg-white/5 text-[var(--text-secondary)] hover:text-white cursor-pointer"
              title="Reset Timer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
