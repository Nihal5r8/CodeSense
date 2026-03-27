import { useEffect, useRef } from 'react'

export default function CustomCursor() {
  const dotRef  = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    const dot  = dotRef.current
    const ring = ringRef.current
    let ringX = 0, ringY = 0
    let dotX  = 0, dotY  = 0
    let animId

    const onMove = (e) => {
      dotX = e.clientX; dotY = e.clientY
    }
    window.addEventListener('mousemove', onMove)

    const animate = () => {
      if (dot)  { dot.style.left  = dotX + 'px'; dot.style.top = dotY + 'px' }
      // Ring lags behind for a trailing effect
      ringX += (dotX - ringX) * 0.14
      ringY += (dotY - ringY) * 0.14
      if (ring) { ring.style.left = ringX + 'px'; ring.style.top = ringY + 'px' }
      animId = requestAnimationFrame(animate)
    }
    animId = requestAnimationFrame(animate)

    const onOver = (e) => {
      const el = e.target
      if (el.matches('button, .generate-btn, [role="button"]')) {
        document.body.className = 'cursor-btn'
      } else if (el.matches('textarea, input, .code-block, pre, code')) {
        document.body.className = 'cursor-code'
      } else if (el.matches('a, .glass-panel, .panel-header, .meta-badge')) {
        document.body.className = 'cursor-hover'
      } else {
        document.body.className = ''
      }
    }
    window.addEventListener('mouseover', onOver)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseover', onOver)
      cancelAnimationFrame(animId)
    }
  }, [])

  return (
    <>
      <div className="cursor-dot"  ref={dotRef}  />
      <div className="cursor-ring" ref={ringRef} />
    </>
  )
}
