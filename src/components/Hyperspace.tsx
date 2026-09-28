import { useEffect, useRef } from 'react'

const DURATION = 2300
const STAR_COUNT = 900
const MAX_SPEED = 0.0034
const NEAR = 0.02

type Star = { x: number; y: number; z: number }

const easeInCubic = (t: number) => t * t * t

// Speed in depth units per ms: idle drift, then a hard acceleration into the jump.
function speedAt(t: number) {
  if (t < 0.2) return 0.00006
  const ramp = Math.min(1, (t - 0.2) / 0.5)
  return 0.00006 + (MAX_SPEED - 0.00006) * easeInCubic(ramp)
}

export function Hyperspace({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawn = (s: Star, far: boolean) => {
      s.x = Math.random() * 2 - 1
      s.y = Math.random() * 2 - 1
      s.z = far ? 1 : NEAR + Math.random() * (1 - NEAR)
      return s
    }
    const stars = Array.from({ length: STAR_COUNT }, () => spawn({ x: 0, y: 0, z: 1 }, false))

    const start = performance.now()
    let last = start
    let frame = 0

    const tick = (now: number) => {
      const t = (now - start) / DURATION
      if (t >= 1) {
        onDoneRef.current()
        return
      }
      const dt = Math.min(now - last, 50)
      last = now

      const v = speedAt(t)
      const warp = v / MAX_SPEED
      const cx = w / 2
      const cy = h / 2
      const focal = Math.max(w, h) * 0.5
      const stretch = 1 + warp * 10

      // Partial clear leaves a motion-blur smear once the jump is under way.
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - warp * 0.6})`
      ctx.fillRect(0, 0, w, h)
      ctx.lineCap = 'round'

      for (const s of stars) {
        s.z -= v * dt
        if (s.z <= NEAR) spawn(s, true)

        const sx = cx + (s.x / s.z) * focal
        const sy = cy + (s.y / s.z) * focal
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) {
          spawn(s, true)
          continue
        }
        const tailZ = Math.min(1, s.z + v * dt * stretch + 0.0015)
        const tx = cx + (s.x / tailZ) * focal
        const ty = cy + (s.y / tailZ) * focal

        const near = 1 - s.z
        const alpha = Math.min(1, near * 1.4 + 0.15)
        const blue = Math.round(255 - warp * 40)
        ctx.strokeStyle = `rgba(${blue}, ${Math.round(235 - warp * 15)}, 255, ${alpha})`
        ctx.lineWidth = 0.6 + near * (1.4 + warp * 1.6)
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }

      // Tunnel glow that blooms into a flash just before the jump ends.
      if (t > 0.6) {
        const k = (t - 0.6) / 0.4
        const r = Math.max(w, h) * (0.1 + k * k * 0.9)
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        g.addColorStop(0, `rgba(235, 245, 255, ${k * k * 0.9})`)
        g.addColorStop(0.4, `rgba(140, 180, 255, ${k * 0.25})`)
        g.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="hyperspace" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
