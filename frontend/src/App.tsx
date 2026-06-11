import { useEffect, useRef, useState, memo, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Critical path pages: eagerly loaded (they are needed before auth resolves)
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'

// Heavy pages: lazy loaded to cut initial bundle size
const Settings = lazy(() => import('./pages/Settings'))
const Admin    = lazy(() => import('./pages/Admin'))
const Chat     = lazy(() => import('./pages/Chat'))

// Simple full-page loading spinner for lazy route fallback
const PageSpinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-main, #0f0f12)' }}>
    <div style={{ width: 40, height: 40, border: '4px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

// React.memo: CinematicBackground never re-renders unless theme prop changes.
// Without this it re-mounts on every route transition, resetting the canvas.
const CinematicBackground = memo(function CinematicBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'tiimi');

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          setTheme(document.documentElement.getAttribute('data-theme') || 'tiimi');
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Track mouse globally relative to window
    const mouse = { x: 0, y: 0, active: false };

    const handleWindowMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };

    const handleWindowMouseLeave = () => {
      mouse.active = false;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    document.addEventListener('mouseleave', handleWindowMouseLeave);

    // Setup canvas dimension with DPR support for high resolution rendering
    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      initParticles();
    };

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      alpha: number;
    }

    let particles: Particle[] = [];
    const connectionDistance = 120;
    const mouseConnectionDistance = 180;

    const initParticles = () => {
      particles = [];
      // Dynamic count based on screen area to keep it elegant, minimal, and performant
      const particleCount = Math.min(70, Math.floor((window.innerWidth * window.innerHeight) / 25000));
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          // Extremely slow speed for smooth, futuristic constellation float (never hectic!)
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          radius: Math.random() * 2.0 + 1.5,
          alpha: Math.random() * 0.15 + 0.05, // Visible but elegant default opacity (5% - 20%)
        });
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Determine drawing colors based on theme
      const isLightTheme = theme === 'light' || theme === 'tiimi';
      const particleRGB = isLightTheme ? '0, 102, 255' : '0, 102, 255'; // Royal/Electric Blue
      const glowRGB = isLightTheme ? '0, 102, 255' : '0, 102, 255';
      const highlightRGB = isLightTheme ? '0, 82, 204' : '0, 150, 255'; // Richer contrast blue for light background

      // Precalculate distances to mouse for physics and hover effects
      const particlesWithMouseDist = particles.map(p => {
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return { p, dist, dx, dy };
        }
        return { p, dist: Infinity, dx: 0, dy: 0 };
      });

      // Update and Draw Particles
      particlesWithMouseDist.forEach(({ p, dist, dx, dy }) => {
        p.x += p.vx;
        p.y += p.vy;

        // Bounce gently at boundary
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        p.x = Math.max(0, Math.min(width, p.x));
        p.y = Math.max(0, Math.min(height, p.y));

        let finalAlpha = p.alpha;
        let finalRadius = p.radius;

        // Apply mouse interaction if close
        if (mouse.active && dist < mouseConnectionDistance) {
          const factor = 1 - dist / mouseConnectionDistance;
          finalAlpha = Math.min(0.85, p.alpha + factor * 0.7); // Brighten up to 85%
          finalRadius = p.radius + factor * 1.5; // Grow slightly to look like a glowing dot
          
          // Softer magnetic pull physics
          const force = factor * 0.15;
          p.x -= (dx / dist) * force;
          p.y -= (dy / dist) * force;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, finalRadius, 0, Math.PI * 2);

        // Add soft glow effect to active particles near mouse
        if (mouse.active && dist < mouseConnectionDistance) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = `rgba(${glowRGB}, 0.8)`;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = `rgba(${particleRGB}, ${finalAlpha})`;
        ctx.fill();
      });
      ctx.shadowBlur = 0; // Reset shadow for lines

      // Connections between particles
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        const dist1 = mouse.active ? particlesWithMouseDist[i].dist : Infinity;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist2 = mouse.active ? particlesWithMouseDist[j].dist : Infinity;
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            let lineAlpha = (1 - dist / connectionDistance) * 0.08;
            let strokeColor = `rgba(${particleRGB}, ${lineAlpha})`;
            let strokeWidth = 0.8;

            // If both particles are hovering near the mouse, draw a bright, glowing neural path!
            if (mouse.active && dist1 < mouseConnectionDistance && dist2 < mouseConnectionDistance) {
              const factor1 = 1 - dist1 / mouseConnectionDistance;
              const factor2 = 1 - dist2 / mouseConnectionDistance;
              const avgFactor = (factor1 + factor2) / 2;
              lineAlpha = 0.08 + avgFactor * 0.45; // Up to 50%+ opacity
              strokeColor = `rgba(${highlightRGB}, ${lineAlpha})`;
              strokeWidth = 1.2;
            }

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
            ctx.stroke();
          }
        }

        // Connections to mouse
        if (mouse.active) {
          const { dist } = particlesWithMouseDist[i];

          if (dist < mouseConnectionDistance) {
            const factor = 1 - dist / mouseConnectionDistance;
            const lineAlpha = factor * 0.35; // Fades out with distance
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = `rgba(${highlightRGB}, ${lineAlpha})`;
            ctx.lineWidth = 1.0;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleWindowMouseMove);
      document.removeEventListener('mouseleave', handleWindowMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[-20] overflow-hidden bg-[var(--bg-main)] transition-colors duration-500">
      <div className="cinematic-bg transition-all duration-500" />
      <div className="cinematic-glow-1" />
      <div className="cinematic-glow-2" />
      <div className="mouse-glow" />
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[-19]"
      />
    </div>
  );
}) // end React.memo(CinematicBackground)

function App() {
  return (
    <BrowserRouter>
      <CinematicBackground />
      <Suspense fallback={<PageSpinner />}>
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
      </Suspense>
    </BrowserRouter>
  )
}

export default App
