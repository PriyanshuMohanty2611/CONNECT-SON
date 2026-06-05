import { useEffect, useRef } from 'react'

interface RainDrop {
  x: number
  y: number
  length: number
  speed: number
  opacity: number
}

interface SplashParticle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  decay: number
}

interface PhysicsParticle {
  x: number
  y: number
  radius: number
  vx: number
  vy: number
  gravity: number
  elasticity: number
  type: 'logo' | 'ball' | 'icon'
  color: string
  iconShape: string
  opacity: number
  rotation: number
  rotationSpeed: number
}

// Helper generators
function createRainDrop(width: number, height: number, init = false): RainDrop {
  return {
    x: Math.random() * width,
    y: init ? Math.random() * height : -50 - Math.random() * 100,
    length: Math.random() * 15 + 10,
    speed: Math.random() * 10 + 8,
    opacity: Math.random() * 0.15 + 0.05
  }
}

function createSplash(x: number, y: number): SplashParticle {
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 3,
    vy: -Math.random() * 2 - 1,
    radius: Math.random() * 1.5 + 0.5,
    alpha: 0.6,
    decay: Math.random() * 0.03 + 0.02
  }
}

function createPhysicsParticle(width: number, height: number, init = false): PhysicsParticle {
  const rand = Math.random()
  let type: 'logo' | 'ball' | 'icon' = 'ball'
  if (rand < 0.35) {
    type = 'logo'
  } else if (rand < 0.7) {
    type = 'icon'
  }

  const icons = ['💬', '🔒', '✨', '⚡', '🎮', '🔔', '❤️', '🌟']
  const iconShape = icons[Math.floor(Math.random() * icons.length)]

  const colors = [
    'rgba(59, 130, 246, opacity)', // Blue
    'rgba(168, 85, 247, opacity)', // Purple
    'rgba(236, 72, 153, opacity)', // Pink
    'rgba(6, 182, 212, opacity)'   // Cyan
  ]
  const color = colors[Math.floor(Math.random() * colors.length)]

  return {
    x: Math.random() * width,
    y: init ? Math.random() * (height - 100) : -40 - Math.random() * 80,
    radius: Math.random() * 12 + 10,
    vx: (Math.random() - 0.5) * 2,
    vy: Math.random() * 2 + 1,
    gravity: 0.15,
    elasticity: 0.65 + Math.random() * 0.15,
    type,
    color,
    iconShape,
    opacity: 0.25 + Math.random() * 0.3,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.04
  }
}

export default function FallingPhysicsBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000, active: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let cardRect: DOMRect | null = null

    // Track mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true }
    }
    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000, active: false }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)

    const updateCardRect = () => {
      const el = document.querySelector('.glass-panel')
      if (el) {
        cardRect = el.getBoundingClientRect()
      } else {
        cardRect = null
      }
    }

    // Set canvas dimensions
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      updateCardRect()
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    const cardInterval = setInterval(updateCardRect, 1000)

    // Load logo image
    const logoImg = new Image()
    logoImg.src = '/logo.png'

    // Setup arrays
    const numRainDrops = 60
    const rainDrops: RainDrop[] = []
    for (let i = 0; i < numRainDrops; i++) {
      rainDrops.push(createRainDrop(canvas.width, canvas.height, true))
    }

    const numPhysicsParticles = 30
    const physicsParticles: PhysicsParticle[] = []
    for (let i = 0; i < numPhysicsParticles; i++) {
      physicsParticles.push(createPhysicsParticle(canvas.width, canvas.height, true))
    }

    let splashes: SplashParticle[] = []
    const addSplash = (x: number, y: number) => {
      if (splashes.length > 150) {
        splashes.shift()
      }
      const count = Math.floor(Math.random() * 2) + 2
      for (let i = 0; i < count; i++) {
        splashes.push(createSplash(x, y))
      }
    }

    // Animation Tick
    const animate = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // 1. Rain Drops
      rainDrops.forEach((drop) => {
        drop.y += drop.speed

        // Splash on card top
        if (cardRect && drop.x >= cardRect.left && drop.x <= cardRect.right) {
          if (drop.y >= cardRect.top && drop.y - drop.speed < cardRect.top) {
            addSplash(drop.x, cardRect.top)
            Object.assign(drop, createRainDrop(w, h, false))
            return
          }
        }

        // Splash on bottom of screen
        if (drop.y >= h) {
          addSplash(drop.x, h - 2)
          Object.assign(drop, createRainDrop(w, h, false))
          return
        }

        // Draw
        ctx.save()
        ctx.strokeStyle = `rgba(99, 102, 241, ${drop.opacity})` // Indigo rain
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(drop.x, drop.y)
        ctx.lineTo(drop.x, drop.y + drop.length)
        ctx.stroke()
        ctx.restore()
      })

      // 2. Splashes
      splashes = splashes.filter((sp) => {
        sp.vy += 0.12 // gravity
        sp.x += sp.vx
        sp.y += sp.vy
        sp.alpha -= sp.decay

        if (sp.alpha > 0) {
          ctx.save()
          ctx.fillStyle = `rgba(56, 189, 248, ${sp.alpha})`
          ctx.beginPath()
          ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          return true
        }
        return false
      })

      // 3. Physics Particles
      physicsParticles.forEach((p) => {
        p.vy += p.gravity

        // Mouse repulsion
        const mouse = mouseRef.current
        if (mouse.active) {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const repulsionRadius = 140

          if (dist < repulsionRadius && dist > 0.1) {
            const force = (repulsionRadius - dist) / repulsionRadius
            const forceX = (dx / dist) * force * 1.2
            const forceY = (dy / dist) * force * 1.2
            
            p.vx += forceX
            p.vy += forceY
          }
        }

        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotationSpeed

        // Cap speed
        const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        const maxSpeed = 12
        if (currentSpeed > maxSpeed) {
          p.vx = (p.vx / currentSpeed) * maxSpeed
          p.vy = (p.vy / currentSpeed) * maxSpeed
        }

        // Card collision
        if (cardRect) {
          const pad = 2
          const left = cardRect.left - pad
          const right = cardRect.right + pad
          const top = cardRect.top - pad
          const bottom = cardRect.bottom + pad

          const px = Math.max(left, Math.min(p.x, right))
          const py = Math.max(top, Math.min(p.y, bottom))

          const dx = p.x - px
          const dy = p.y - py
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < p.radius) {
            if (dist > 0.01) {
              const nx = dx / dist
              const ny = dy / dist
              
              p.x = px + nx * p.radius
              p.y = py + ny * p.radius
              
              const dot = p.vx * nx + p.vy * ny
              p.vx = (p.vx - 2 * dot * nx) * p.elasticity
              p.vy = (p.vy - 2 * dot * ny) * p.elasticity
            } else {
              const dl = p.x - left
              const dr = right - p.x
              const dt = p.y - top
              const db = bottom - p.y
              const min = Math.min(dl, dr, dt, db)
              
              if (min === dl) {
                p.x = left - p.radius
                p.vx = -Math.abs(p.vx) * p.elasticity
              } else if (min === dr) {
                p.x = right + p.radius
                p.vx = Math.abs(p.vx) * p.elasticity
              } else if (min === dt) {
                p.y = top - p.radius
                p.vy = -Math.abs(p.vy) * p.elasticity
              } else {
                p.y = bottom + p.radius
                p.vy = Math.abs(p.vy) * p.elasticity
              }
            }
          }
        }

        // Screen bottom collision
        const bottomBoundary = h - p.radius
        if (p.y >= bottomBoundary) {
          p.y = bottomBoundary
          p.vy = -p.vy * p.elasticity
          p.vx += (Math.random() - 0.5) * 0.4

          if (Math.abs(p.vy) < 0.7) {
            Object.assign(p, createPhysicsParticle(w, h, false))
            return
          }
        }

        // Wall collisions
        if (p.x <= p.radius) {
          p.x = p.radius
          p.vx = -p.vx * p.elasticity
        } else if (p.x >= w - p.radius) {
          p.x = w - p.radius
          p.vx = -p.vx * p.elasticity
        }

        // Draw
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity

        if (p.type === 'logo') {
          if (logoImg.complete && logoImg.naturalWidth !== 0) {
            ctx.shadowColor = 'rgba(59, 130, 246, 0.4)'
            ctx.shadowBlur = 8
            ctx.drawImage(logoImg, -p.radius, -p.radius, p.radius * 2, p.radius * 2)
          } else {
            ctx.beginPath()
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'
            ctx.fill()
          }
        } else if (p.type === 'icon') {
          ctx.shadowColor = 'rgba(139, 92, 246, 0.4)'
          ctx.shadowBlur = 6
          ctx.font = `${p.radius * 1.4}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(p.iconShape, 0, 0)
        } else {
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.radius)
          const colorStr = p.color.replace('opacity', '0.6')
          const colorFadeStr = p.color.replace('opacity', '0')
          grad.addColorStop(0, colorStr)
          grad.addColorStop(1, colorFadeStr)
          
          ctx.shadowColor = colorStr
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.arc(0, 0, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
        }

        ctx.restore()
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      clearInterval(cardInterval)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  )
}
