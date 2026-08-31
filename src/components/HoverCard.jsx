import { useRef, useState } from 'react'

// Hover detail card: hovering the wrapped element shows a positioned popover
// with a detailed overview of its contents. Anchored with fixed coordinates so
// planner table cells can never clip it, and flipped above the element when
// there is no room underneath.
export default function HoverCard({ card, className = '', children }) {
  const [anchor, setAnchor] = useState(null)
  const timer = useRef(null)

  const show = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const W = 300
      const below = rect.bottom + 220 + 8 <= window.innerHeight
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8))
      const top = below ? rect.bottom + 6 : rect.top - 6
      setAnchor({ left, top, below })
    }, 120)
  }

  const hide = () => {
    clearTimeout(timer.current)
    setAnchor(null)
  }

  return (
    <div className={className} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {anchor && (
        <div
          className="pointer-events-none fixed z-50 max-w-[300px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs text-slate-700 shadow-xl"
          style={{ left: anchor.left, top: anchor.top, transform: anchor.below ? undefined : 'translateY(-100%)' }}>
          {card}
        </div>
      )}
    </div>
  )
}
