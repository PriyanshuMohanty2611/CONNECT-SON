import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { SocketProvider } from './context/SocketContext.tsx'
import { NotificationProvider } from './context/NotificationContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SocketProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </SocketProvider>
    </AuthProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('PWA Service Worker registered:', reg.scope))
      .catch(err => console.error('PWA Service Worker registration failed:', err));
  });
}
