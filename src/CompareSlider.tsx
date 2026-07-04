import { useCallback, useRef, useState } from 'react'

interface Props {
  beforeSrc: string
  afterSrc: string
  beforeLabel: string
  afterLabel: string
}

/** Draggable before/after comparison slider. */
export function CompareSlider({ beforeSrc, afterSrc, beforeLabel, afterLabel }: Props) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPos(Math.min(100, Math.max(0, pct)))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    updateFromClientX(e.clientX)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return
    updateFromClientX(e.clientX)
  }

  return (
    <div
      className="compare"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <img className="compare-img" src={afterSrc} alt={afterLabel} draggable={false} />
      <div
        className="compare-before"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img
          className="compare-img"
          src={beforeSrc}
          alt={beforeLabel}
          draggable={false}
        />
      </div>
      <div className="compare-handle" style={{ left: `${pos}%` }}>
        <div className="compare-handle-grip">⇔</div>
      </div>
      <span className="compare-label compare-label-left">{beforeLabel}</span>
      <span className="compare-label compare-label-right">{afterLabel}</span>
    </div>
  )
}
