import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Gamepad2, Users, Trophy, Play, Star, RotateCcw, X, 
  HelpCircle, Sparkles, Send, Check, AlertCircle, ShieldAlert 
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { api } from '../services/api'

interface GameSession {
  id: string
  chat_id: string
  game_type: string
  status: 'pending' | 'playing' | 'completed'
  board_state: string
  player1_id: string
  player2_id: string
  turn_player_id: string
  winner_id: string | null
}

interface LeaderboardEntry {
  id: string
  user_id: string
  wins: number
  losses: number
  draws: number
  game_type: string
  username?: string
}

export default function GamingHub() {
  const { user } = useAuth()
  const { socket } = useSocket()
  
  const [activeTab, setActiveTab] = useState<'lobby' | 'game' | 'leaderboard'>('lobby')
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [friendsList, setFriendsList] = useState<any[]>([])
  const [selectedFriend, setSelectedFriend] = useState<string>('')
  
  // Game session states
  const [currentSession, setCurrentSession] = useState<GameSession | null>(null)
  const [gameInviteReceived, setGameInviteReceived] = useState<GameSession | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [gameError, setGameError] = useState<string>('')
  
  // Quiz specific states
  const [quizScore, setQuizScore] = useState(0)
  const [quizIndex, setQuizIndex] = useState(0)
  const [showQuizResult, setShowQuizResult] = useState(false)
  const [quizCategory, setQuizCategory] = useState<'python' | 'cricket' | 'movies'>('python')
  
  // Spin the wheel states
  const [wheelDegree, setWheelDegree] = useState(0)
  const [wheelResult, setWheelResult] = useState<string>('')
  const [spinning, setSpinning] = useState(false)

  // Truth or Dare states
  const [todType, setTodType] = useState<'truth' | 'dare' | null>(null)
  const [todPrompt, setTodPrompt] = useState<string>('')

  // Board states parsed
  const [ticBoard, setTicBoard] = useState<string[]>(Array(9).fill(''))
  const [c4Board, setC4Board] = useState<string[][]>(Array(6).fill(null).map(() => Array(7).fill('')))

  const currentUserId = user?.id || ''

  // Load Friends List for Challenge
  useEffect(() => {
    const loadFriends = async () => {
      const { data } = await api.get<any[]>('/friends/')
      if (data) setFriendsList(data)
    }
    loadFriends()
    loadLeaderboard()
  }, [])

  // Socket triggers
  useEffect(() => {
    if (!socket) return

    const handleInvite = (sess: GameSession) => {
      if (sess.player2_id === currentUserId) {
        setGameInviteReceived(sess)
      }
    }

    const handleStarted = (sess: GameSession) => {
      if (sess.player1_id === currentUserId || sess.player2_id === currentUserId) {
        setCurrentSession(sess)
        setGameInviteReceived(null)
        setActiveTab('game')
        setSelectedGame(sess.game_type)
        if (sess.game_type === 'tictactoe') {
          setTicBoard(JSON.parse(sess.board_state))
        } else if (sess.game_type === 'connect4') {
          setC4Board(JSON.parse(sess.board_state))
        }
      }
    }

    const handleUpdate = (sess: GameSession) => {
      if (currentSession && sess.id === currentSession.id) {
        setCurrentSession(sess)
        if (sess.game_type === 'tictactoe') {
          setTicBoard(JSON.parse(sess.board_state))
        } else if (sess.game_type === 'connect4') {
          setC4Board(JSON.parse(sess.board_state))
        }
      }
    }

    socket.on('game_invite_received', handleInvite)
    socket.on('game_started', handleStarted)
    socket.on('game_state_update', handleUpdate)

    return () => {
      socket.off('game_invite_received', handleInvite)
      socket.off('game_started', handleStarted)
      socket.off('game_state_update', handleUpdate)
    }
  }, [socket, currentSession, currentUserId])

  const loadLeaderboard = async () => {
    const { data } = await api.get<LeaderboardEntry[]>('/games/leaderboard')
    if (data) {
      // Resolve usernames
      const usersListRes = await api.get<any[]>('/admin/users')
      const usersMap: Record<string, string> = {}
      if (usersListRes.data) {
        usersListRes.data.forEach((u: any) => {
          usersMap[u.id] = u.username
        })
      }
      const mapped = data.map(entry => ({
        ...entry,
        username: usersMap[entry.user_id] || 'Anonymous'
      }))
      setLeaderboard(mapped)
    }
  }

  // Action: Challenge Friend
  const handleChallenge = async (gameType: string) => {
    if (!selectedFriend) {
      setGameError('Please select a friend to challenge!')
      return
    }
    setGameError('')
    
    // Find chat with friend
    const { data: chats } = await api.get<any[]>('/chats/')
    if (!chats) return
    const friendChat = chats.find(c => 
      c.type === 'direct' && c.participants.some((p: any) => p.id === selectedFriend)
    )

    if (!friendChat) {
      setGameError('No direct chat found with this friend. Make sure you are connected!')
      return
    }

    if (socket) {
      socket.emit('game_invite', { chat_id: friendChat.id, game_type: gameType })
      setGameError('Invite sent! Waiting for partner to accept...')
    }
  }

  // Action: Accept Invite
  const handleAcceptInvite = () => {
    if (socket && gameInviteReceived) {
      socket.emit('game_accept', { session_id: gameInviteReceived.id })
    }
  }

  // Tic Tac Toe Move
  const makeTicMove = (idx: number) => {
    if (!currentSession || ticBoard[idx] !== '' || currentSession.status !== 'playing') return
    if (currentSession.turn_player_id !== currentUserId) return

    const newBoard = [...ticBoard]
    const isP1 = currentSession.player1_id === currentUserId
    newBoard[idx] = isP1 ? 'X' : 'O'
    setTicBoard(newBoard)

    // Check winner
    let winner = null
    const wins = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ]
    for (const win of wins) {
      const [a,b,c] = win
      if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
        winner = currentUserId
        break
      }
    }
    
    if (!winner && newBoard.every(cell => cell !== '')) {
      winner = 'draw'
    }

    const nextPlayer = currentSession.player1_id === currentUserId 
      ? currentSession.player2_id 
      : currentSession.player1_id

    if (socket) {
      socket.emit('game_move', {
        session_id: currentSession.id,
        board_state: JSON.stringify(newBoard),
        turn_player_id: nextPlayer,
        winner_id: winner
      })
    }
  }

  // Connect 4 Move
  const makeC4Move = (col: number) => {
    if (!currentSession || currentSession.status !== 'playing') return
    if (currentSession.turn_player_id !== currentUserId) return

    // Find row index (starts from bottom)
    let rowIdx = -1
    for (let r = 5; r >= 0; r--) {
      if (c4Board[r][col] === '') {
        rowIdx = r
        break
      }
    }
    if (rowIdx === -1) return // Column full

    const newBoard = c4Board.map(row => [...row])
    const isP1 = currentSession.player1_id === currentUserId
    newBoard[rowIdx][col] = isP1 ? 'R' : 'Y'
    setC4Board(newBoard)

    // Check Win Logic (Horizontal, Vertical, Diagonals)
    const checkWin = (b: string[][], mark: string) => {
      // Horizontal
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          if (b[r][c] === mark && b[r][c+1] === mark && b[r][c+2] === mark && b[r][c+3] === mark) return true
        }
      }
      // Vertical
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 7; c++) {
          if (b[r][c] === mark && b[r+1][c] === mark && b[r+2][c] === mark && b[r+3][c] === mark) return true
        }
      }
      // Diagonal Down-Right
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          if (b[r][c] === mark && b[r+1][c+1] === mark && b[r+2][c+2] === mark && b[r+3][c+3] === mark) return true
        }
      }
      // Diagonal Up-Right
      for (let r = 3; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          if (b[r][c] === mark && b[r-1][c+1] === mark && b[r-2][c+2] === mark && b[r-3][c+3] === mark) return true
        }
      }
      return false
    }

    const mark = isP1 ? 'R' : 'Y'
    let winner = null
    if (checkWin(newBoard, mark)) {
      winner = currentUserId
    } else if (newBoard.every(row => row.every(cell => cell !== ''))) {
      winner = 'draw'
    }

    const nextPlayer = currentSession.player1_id === currentUserId 
      ? currentSession.player2_id 
      : currentSession.player1_id

    if (socket) {
      socket.emit('game_move', {
        session_id: currentSession.id,
        board_state: JSON.stringify(newBoard),
        turn_player_id: nextPlayer,
        winner_id: winner
      })
    }
  }

  // Quiz questions
  const quizQuestions = {
    python: [
      { q: "What is the output of print(2 ** 3)?", opts: ["6", "8", "9", "5"], ans: "8" },
      { q: "Which key is used to define a block in Python?", opts: ["Brackets", "Parentheses", "Indentation", "Semicolons"], ans: "Indentation" },
      { q: "What is the mutable ordered collection in Python?", opts: ["List", "Tuple", "Dict", "Set"], ans: "List" }
    ],
    cricket: [
      { q: "How many fielders are allowed outside the circle in powerplay?", opts: ["2", "3", "5", "9"], ans: "2" },
      { q: "Who scored the first double century in ODI history?", opts: ["Virender Sehwag", "Sachin Tendulkar", "Rohit Sharma", "Chris Gayle"], ans: "Sachin Tendulkar" },
      { q: "How many players are on the field in a standard cricket team?", opts: ["10", "11", "12", "9"], ans: "11" }
    ],
    movies: [
      { q: "Which movie won the Best Picture Oscar in 2024?", opts: ["Oppenheimer", "Barbie", "Poor Things", "Past Lives"], ans: "Oppenheimer" },
      { q: "Who played Iron Man in the MCU?", opts: ["Chris Evans", "Robert Downey Jr.", "Chris Hemsworth", "Mark Ruffalo"], ans: "Robert Downey Jr." },
      { q: "What is the highest-grossing film of all time?", opts: ["Avatar", "Avengers: Endgame", "Titanic", "Star Wars: Episode VII"], ans: "Avatar" }
    ]
  }

  const handleQuizAnswer = (opt: string) => {
    const questions = quizQuestions[quizCategory]
    const correct = questions[quizIndex].ans === opt
    if (correct) setQuizScore(prev => prev + 10)
    
    if (quizIndex < questions.length - 1) {
      setQuizIndex(prev => prev + 1)
    } else {
      setShowQuizResult(true)
      // Save stats to Leaderboard on completion
      api.post('/games/leaderboard', {
        wins: correct ? quizScore + 10 : quizScore,
        game_type: `quiz_${quizCategory}`
      }).then(() => loadLeaderboard())
    }
  }

  const resetQuiz = () => {
    setQuizScore(0)
    setQuizIndex(0)
    setShowQuizResult(false)
  }

  // Spin the wheel
  const spinWheel = () => {
    if (spinning) return
    setSpinning(true)
    const challenges = [
      "Sing a song!", "Tell a joke!", "Do 10 pushups!", 
      "Share your last text message!", "Drink a glass of water!", 
      "Imitate your favorite teacher!"
    ]
    const randomDegree = Math.floor(Math.random() * 360) + 1440 // Spin 4+ times
    setWheelDegree(randomDegree)
    
    setTimeout(() => {
      setSpinning(false)
      const index = Math.floor(((randomDegree % 360) / 360) * challenges.length)
      setWheelResult(challenges[index])
    }, 4000)
  }

  // Truth or Dare prompts
  const getTod = (type: 'truth' | 'dare') => {
    setTodType(type)
    const truths = [
      "What is your biggest fear?",
      "Have you ever lied to your best friend?",
      "Who was your first crush?",
      "What is the most embarrassing thing you've done?",
      "What is your worst habit?"
    ]
    const dares = [
      "Do a funny dance for 30 seconds!",
      "Send a random emoji to your crush!",
      "Speak in an accent for the next 5 minutes!",
      "Eat a spoonful of hot sauce or mustard!",
      "Hum a song until someone guesses it!"
    ]
    const list = type === 'truth' ? truths : dares
    setTodPrompt(list[Math.floor(Math.random() * list.length)])
  }

  // Game details map
  const games = [
    { id: 'tictactoe', name: 'Tic Tac Toe', desc: 'Real-time WebSocket match. Get 3 in a row.', image: 'https://images.unsplash.com/photo-1611195974226-a6a9be9dd763?q=80&w=200' },
    { id: 'connect4', name: 'Connect 4', desc: 'Slam chips down columns. Form a row of 4.', image: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?q=80&w=200' },
    { id: 'chess', name: 'Chess', desc: 'Tactical battle. Outwit your friend in the ultimate board game.', image: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?q=80&w=200' },
    { id: 'rps', name: 'Rock Paper Scissors', desc: 'Fast-paced rock, paper, scissors showdown.', image: 'https://images.unsplash.com/photo-1605335606622-6b955c4d081f?q=80&w=200' },
    { id: 'tod', name: 'Truth Or Dare', desc: 'Break the ice with funny prompts and challenges.', image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=200' },
    { id: 'wheel', name: 'Spin The Wheel', desc: 'Spin for random challenges and dares.', image: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=200' },
    { id: 'quiz', name: 'Quiz Battles', desc: 'Quiz yourself in Python, Cricket, or Movies.', image: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?q=80&w=200' },
  ]

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Navigation tabs */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Gamepad2 className="w-7 h-7 text-[var(--accent)]" />
            Gaming Hub
          </h2>
          <p className="text-[var(--text-secondary)] text-sm">Challenge friends and play live inside Connect-On.</p>
        </div>

        <div className="flex gap-2 bg-[var(--bg-card)] p-1 rounded-xl border border-[var(--border-color)]">
          <button 
            onClick={() => setActiveTab('lobby')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'lobby' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            Lobby & Games
          </button>
          {currentSession && (
            <button 
              onClick={() => setActiveTab('game')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'game' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active Game
            </button>
          )}
          <button 
            onClick={() => {
              setActiveTab('leaderboard')
              loadLeaderboard()
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'leaderboard' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            Leaderboard
          </button>
        </div>
      </div>

      {/* ERROR/NOTIFICS HEADER */}
      {gameError && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{gameError}</span>
        </div>
      )}

      {/* GAME INVITE POPUP */}
      <AnimatePresence>
        {gameInviteReceived && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-[var(--bg-card)] border border-[var(--accent)] rounded-xl flex items-center justify-between shadow-lg shadow-[var(--accent-glow)] flex-shrink-0"
          >
            <div className="flex items-center gap-3">
              <Gamepad2 className="w-6 h-6 text-pink-500 animate-bounce" />
              <div>
                <h4 className="text-sm font-bold text-white">Challenge Received!</h4>
                <p className="text-xs text-[var(--text-secondary)]">A friend invited you to play <strong className="text-white capitalize">{gameInviteReceived.game_type}</strong>.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={handleAcceptInvite}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer"
              >
                Accept Challenge
              </button>
              <button 
                onClick={() => setGameInviteReceived(null)}
                className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs font-semibold cursor-pointer hover:bg-red-500/10 hover:text-red-400"
              >
                Decline
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CANVAS CONTENT */}
      <div className="flex-1 overflow-y-auto min-h-0">
        
        {activeTab === 'lobby' && (
          <div className="space-y-6">
            {/* Quick Partner Challenge Selector */}
            <div className="p-5 glass-card flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-[var(--accent)]" />
                <div>
                  <h4 className="text-sm font-bold text-white">Choose opponent & play real-time:</h4>
                  <p className="text-xs text-[var(--text-secondary)]">Your invite request will trigger a dynamic WebSocket alert instantly.</p>
                </div>
              </div>

              <div className="flex w-full md:w-auto gap-3">
                <select 
                  value={selectedFriend}
                  onChange={(e) => setSelectedFriend(e.target.value)}
                  className="px-3 py-2 glass-input text-xs w-48 focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">-- Choose Friend --</option>
                  {friendsList.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.profile?.full_name || f.username}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List of Game Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {games.map(game => (
                <div 
                  key={game.id}
                  onClick={() => {
                    setSelectedGame(game.id)
                    if (game.id === 'tod') {
                      setTodType(null)
                      setTodPrompt('')
                    } else if (game.id === 'quiz') {
                      resetQuiz()
                    } else if (game.id === 'wheel') {
                      setWheelResult('')
                    }
                  }}
                  className={`glass-card overflow-hidden group cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                    selectedGame === game.id ? 'border-[var(--accent)] shadow-lg shadow-[var(--accent-glow)]' : 'hover:border-[var(--border-color)]'
                  }`}
                >
                  <div className="h-32 w-full overflow-hidden relative">
                    <img 
                      src={game.image} 
                      alt={game.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-main)] to-transparent" />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <h4 className="font-extrabold text-sm text-white group-hover:text-[var(--accent)] transition-all">{game.name}</h4>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">{game.desc}</p>
                    </div>

                    <div className="pt-2 border-t border-[var(--border-color)] flex justify-between items-center">
                      <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">
                        {['tictactoe', 'connect4', 'chess', 'rps'].includes(game.id) ? '🏆 1v1 Sync' : '🎮 Solo/Party'}
                      </span>
                      {['tictactoe', 'connect4', 'chess', 'rps'].includes(game.id) ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleChallenge(game.id)
                          }}
                          className="px-3 py-1.5 rounded-lg btn-premium text-[10px] font-bold"
                        >
                          Challenge
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            setSelectedGame(game.id)
                            setActiveTab('game')
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[var(--border-color)] hover:bg-[var(--accent)] hover:text-white transition-all text-[10px] font-bold text-[var(--text-secondary)]"
                        >
                          Play Game
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'game' && (
          <div className="h-full flex items-center justify-center p-4">
            
            {/* 1. TIC TAC TOE */}
            {selectedGame === 'tictactoe' && currentSession && (
              <div className="max-w-md w-full glass-card p-6 flex flex-col items-center space-y-6">
                <div>
                  <h4 className="text-lg font-black text-center text-white">Tic Tac Toe 1v1</h4>
                  <p className="text-xs text-[var(--text-secondary)] text-center">
                    {currentSession.status === 'playing' ? (
                      currentSession.turn_player_id === currentUserId ? (
                        <span className="text-[var(--accent)] font-bold animate-pulse">It is your turn! (Play X/O)</span>
                      ) : (
                        <span>Waiting for partner's turn...</span>
                      )
                    ) : (
                      <span className="text-green-400 font-bold">
                        {currentSession.winner_id === 'draw' ? 'Game ended in a draw!' : currentSession.winner_id === currentUserId ? 'You won!' : 'Opponent won!'}
                      </span>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 w-64 h-64">
                  {ticBoard.map((val, idx) => (
                    <button 
                      key={idx}
                      onClick={() => makeTicMove(idx)}
                      disabled={val !== '' || currentSession.status !== 'playing' || currentSession.turn_player_id !== currentUserId}
                      className="w-full h-full glass-input text-2xl font-black flex items-center justify-center cursor-pointer hover:bg-[var(--accent-glow)] transition-all"
                    >
                      {val === 'X' && <span className="text-[var(--accent)]">X</span>}
                      {val === 'O' && <span className="text-pink-500">O</span>}
                    </button>
                  ))}
                </div>

                {currentSession.status === 'completed' && (
                  <button 
                    onClick={() => {
                      setCurrentSession(null)
                      setActiveTab('lobby')
                    }}
                    className="px-4 py-2 rounded-lg bg-[var(--border-color)] hover:bg-[var(--accent)] text-white text-xs font-bold"
                  >
                    Back to Lobby
                  </button>
                )}
              </div>
            )}

            {/* 2. CONNECT 4 */}
            {selectedGame === 'connect4' && currentSession && (
              <div className="max-w-xl w-full glass-card p-6 flex flex-col items-center space-y-6">
                <div>
                  <h4 className="text-lg font-black text-center text-white">Connect 4 1v1</h4>
                  <p className="text-xs text-[var(--text-secondary)] text-center">
                    {currentSession.status === 'playing' ? (
                      currentSession.turn_player_id === currentUserId ? (
                        <span className="text-[var(--accent)] font-bold animate-pulse">Your turn! Click a column header</span>
                      ) : (
                        <span>Opponent thinking...</span>
                      )
                    ) : (
                      <span className="text-green-400 font-bold">
                        {currentSession.winner_id === 'draw' ? 'Draw match!' : currentSession.winner_id === currentUserId ? 'Victory is Yours!' : 'Defeat! Better luck next time.'}
                      </span>
                    )}
                  </p>
                </div>

                {/* Grid container */}
                <div className="p-4 bg-indigo-950/40 rounded-2xl border border-[var(--border-color)]">
                  {/* Column buttons headers */}
                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {Array(7).fill(0).map((_, cIdx) => (
                      <button 
                        key={cIdx}
                        onClick={() => makeC4Move(cIdx)}
                        disabled={currentSession.status !== 'playing' || currentSession.turn_player_id !== currentUserId}
                        className="w-10 h-6 bg-indigo-500/20 hover:bg-[var(--accent)] rounded text-[10px] font-bold text-white cursor-pointer"
                      >
                        ↓
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-rows-6 gap-2">
                    {c4Board.map((row, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-7 gap-2">
                        {row.map((cell, cIdx) => (
                          <div 
                            key={cIdx} 
                            className="w-10 h-10 rounded-full border border-indigo-900 flex items-center justify-center bg-black/40"
                          >
                            {cell === 'R' && <div className="w-8 h-8 rounded-full bg-rose-500 shadow-md shadow-rose-500/50" />}
                            {cell === 'Y' && <div className="w-8 h-8 rounded-full bg-yellow-400 shadow-md shadow-yellow-500/50" />}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {currentSession.status === 'completed' && (
                  <button 
                    onClick={() => {
                      setCurrentSession(null)
                      setActiveTab('lobby')
                    }}
                    className="px-4 py-2 rounded-lg bg-[var(--border-color)] hover:bg-[var(--accent)] text-white text-xs font-bold"
                  >
                    Exit Match
                  </button>
                )}
              </div>
            )}

            {/* 3. TRUTH OR DARE */}
            {selectedGame === 'tod' && (
              <div className="max-w-md w-full glass-card p-6 flex flex-col items-center space-y-6 text-center">
                <div>
                  <h4 className="text-lg font-black text-white">Truth Or Dare</h4>
                  <p className="text-xs text-[var(--text-secondary)]">Pick truth or dare to get an interactive challenge prompt!</p>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => getTod('truth')}
                    className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:scale-105 transition-all cursor-pointer shadow-md shadow-[var(--accent-glow)]"
                  >
                    Truth
                  </button>
                  <button 
                    onClick={() => getTod('dare')}
                    className="px-5 py-2.5 rounded-xl bg-pink-500 text-white text-xs font-bold hover:scale-105 transition-all cursor-pointer shadow-md shadow-pink-500/20"
                  >
                    Dare
                  </button>
                </div>

                {todType && (
                  <div className="p-5 bg-black/30 rounded-xl border border-[var(--border-color)] w-full">
                    <span className="text-[10px] font-black uppercase px-2 py-1 bg-white/10 rounded text-[var(--accent)]">
                      {todType}
                    </span>
                    <p className="text-sm font-bold text-white mt-4 leading-relaxed">"{todPrompt}"</p>
                  </div>
                )}
              </div>
            )}

            {/* 4. SPIN THE WHEEL */}
            {selectedGame === 'wheel' && (
              <div className="max-w-md w-full glass-card p-6 flex flex-col items-center space-y-6 text-center">
                <div>
                  <h4 className="text-lg font-black text-white">Spin The Wheel</h4>
                  <p className="text-xs text-[var(--text-secondary)]">Give it a spin to select a random prompt task.</p>
                </div>

                {/* Spinning Wheel Mock View */}
                <div className="relative w-48 h-48 rounded-full border-4 border-[var(--border-color)] flex items-center justify-center overflow-hidden">
                  <motion.div 
                    style={{ rotate: wheelDegree }}
                    transition={{ type: "spring", damping: 15, stiffness: 40 }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--accent-glow),_transparent)] rounded-full flex items-center justify-center"
                  >
                    {/* Visual slices */}
                    <div className="absolute w-full h-[2px] bg-[var(--border-color)] rotate-0" />
                    <div className="absolute w-full h-[2px] bg-[var(--border-color)] rotate-45" />
                    <div className="absolute w-full h-[2px] bg-[var(--border-color)] rotate-90" />
                    <div className="absolute w-full h-[2px] bg-[var(--border-color)] rotate-135" />
                    <Gamepad2 className="w-10 h-10 text-[var(--accent)] animate-pulse" />
                  </motion.div>
                  <div className="absolute top-0 w-2 h-4 bg-rose-500 rounded-b z-20" /> {/* Marker */}
                </div>

                <button 
                  onClick={spinWheel}
                  disabled={spinning}
                  className="px-5 py-2.5 rounded-xl btn-premium text-xs font-bold w-32 cursor-pointer"
                >
                  {spinning ? 'Spinning...' : 'Spin!'}
                </button>

                {wheelResult && !spinning && (
                  <div className="p-4 bg-black/40 border border-[var(--border-color)] rounded-xl w-full">
                    <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-1">Challenge:</span>
                    <p className="text-sm font-extrabold text-white">"{wheelResult}"</p>
                  </div>
                )}
              </div>
            )}

            {/* 5. QUIZ BATTLES */}
            {selectedGame === 'quiz' && (
              <div className="max-w-md w-full glass-card p-6 flex flex-col items-center space-y-6">
                <div className="text-center">
                  <h4 className="text-lg font-black text-white">Quiz Battles</h4>
                  <p className="text-xs text-[var(--text-secondary)]">Test your knowledge. Gain leaderboard points.</p>
                </div>

                {!showQuizResult ? (
                  <div className="w-full space-y-4">
                    {/* Category selection */}
                    {quizIndex === 0 && quizScore === 0 && (
                      <div className="flex gap-2 justify-center mb-4">
                        {(['python', 'cricket', 'movies'] as const).map(cat => (
                          <button
                            key={cat}
                            onClick={() => setQuizCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold capitalize cursor-pointer ${
                              quizCategory === cat ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-[var(--text-secondary)]'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-4 bg-black/30 border border-[var(--border-color)] rounded-xl">
                      <span className="text-[9px] font-bold text-[var(--text-secondary)] block mb-1">Question {quizIndex + 1} of 3:</span>
                      <p className="text-xs font-extrabold text-white leading-relaxed">{quizQuestions[quizCategory][quizIndex].q}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {quizQuestions[quizCategory][quizIndex].opts.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          onClick={() => handleQuizAnswer(opt)}
                          className="p-3 text-left glass-input hover:bg-[var(--accent-glow)] text-xs font-semibold cursor-pointer"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-center space-y-4">
                    <Trophy className="w-12 h-12 text-yellow-400 mx-auto" />
                    <div>
                      <h4 className="text-base font-extrabold text-white">Quiz Completed!</h4>
                      <p className="text-xs text-[var(--text-secondary)]">You scored <strong className="text-white">{quizScore} / 30</strong> points.</p>
                    </div>
                    <button 
                      onClick={resetQuiz}
                      className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-bold"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Fallback games details */}
            {!['tictactoe', 'connect4', 'tod', 'wheel', 'quiz'].includes(selectedGame || '') && (
              <div className="glass-card p-8 max-w-sm text-center space-y-4">
                <Gamepad2 className="w-10 h-10 text-[var(--accent)] mx-auto animate-pulse" />
                <h4 className="text-white font-extrabold">Active game screen</h4>
                <p className="text-xs text-[var(--text-secondary)]">To start playing real-time Chess, Rock Paper Scissors, or Tic Tac Toe, invite a friend from the Lobby first!</p>
                <button 
                  onClick={() => setActiveTab('lobby')}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-bold"
                >
                  Go to Lobby
                </button>
              </div>
            )}
            
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="glass-card p-6 max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <div>
                <h4 className="text-base font-extrabold text-white">Leaderboards</h4>
                <p className="text-xs text-[var(--text-secondary)]">Ranked wins from quiz tests and real-time multiplayer challenges.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)]">
                    <th className="py-2.5 font-bold">Rank</th>
                    <th className="py-2.5 font-bold">User</th>
                    <th className="py-2.5 font-bold">Wins</th>
                    <th className="py-2.5 font-bold">Losses</th>
                    <th className="py-2.5 font-bold">Draws</th>
                    <th className="py-2.5 font-bold">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {leaderboard.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-white/5 transition-all">
                      <td className="py-3 font-extrabold text-white">{idx + 1}</td>
                      <td className="py-3 font-semibold text-white">@{item.username}</td>
                      <td className="py-3 text-emerald-400 font-bold">{item.wins}</td>
                      <td className="py-3 text-rose-400">{item.losses}</td>
                      <td className="py-3 text-slate-400">{item.draws}</td>
                      <td className="py-3 text-[var(--text-secondary)] capitalize">{item.game_type}</td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-secondary)]">No rankings logged yet. Be the first to win!</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
