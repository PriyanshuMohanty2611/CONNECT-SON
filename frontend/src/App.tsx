import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Chat from './pages/Chat'

function CinematicBackground() {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[-20] overflow-hidden">
      <div className="cinematic-bg" />
      <div className="cinematic-glow-1" />
      <div className="cinematic-glow-2" />
      <div className="mouse-glow" />
      
      {/* Floating particles */}
      <div className="particle" style={{ left: '8%', animationDelay: '0s', animationDuration: '22s' }} />
      <div className="particle" style={{ left: '25%', animationDelay: '3s', animationDuration: '18s' }} />
      <div className="particle" style={{ left: '45%', animationDelay: '1s', animationDuration: '25s' }} />
      <div className="particle" style={{ left: '70%', animationDelay: '5s', animationDuration: '16s' }} />
      <div className="particle" style={{ left: '90%', animationDelay: '2s', animationDuration: '20s' }} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <CinematicBackground />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chats" element={<Chat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
