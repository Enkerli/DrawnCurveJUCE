// RangeSlider.tsx — two-handle range slider for [min, max] within [0, 1].
// Extracted from webapp/src/components/LaneControls.tsx.

import { useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

export interface RangeSliderProps {
  min: number    // 0..1 — left handle position
  max: number    // 0..1 — right handle position
  color: string  // accent colour for the active span and handles
  dark?: boolean
  onChange: (min: number, max: number) => void
  style?: CSSProperties
}

const HANDLE_SIZE = 14

export function RangeSlider({ min, max, color, dark = false, onChange, style }: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<'min' | 'max' | null>(null)

  const startDrag = (which: 'min' | 'max') => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = which
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (dragRef.current === 'min') onChange(Math.min(v, max - 0.005), max)
    else                            onChange(min, Math.max(v, min + 0.005))
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* noop */ }
    }
  }

  const trackBg = dark ? '#3a3a3a' : 'var(--paper-rule)'
  const handleBg = dark ? '#1a1a1a' : 'var(--paper-card)'

  return (
    <div style={{ position: 'relative', height: 22, padding: '0 8px', ...style }}>
      <div
        ref={trackRef}
        style={{
          position: 'absolute',
          left: 8, right: 8,
          top: '50%', height: 3, marginTop: -1.5,
          background: trackBg, borderRadius: 2,
        }}
      >
        <div style={{
          position: 'absolute',
          left: `${min * 100}%`,
          width: `${(max - min) * 100}%`,
          top: 0, height: '100%',
          background: color, borderRadius: 2,
        }} />

        <div
          onPointerDown={startDrag('min')}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'absolute',
            left: `calc(${min * 100}% - ${HANDLE_SIZE / 2}px)`,
            top: -((HANDLE_SIZE - 3) / 2),
            width: HANDLE_SIZE, height: HANDLE_SIZE,
            borderRadius: '50%',
            background: handleBg,
            border: `2px solid ${color}`,
            boxShadow: dark ? 'none' : '0 1px 2px rgba(0,0,0,0.12)',
            cursor: 'grab', touchAction: 'none',
          }}
        />

        <div
          onPointerDown={startDrag('max')}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'absolute',
            left: `calc(${max * 100}% - ${HANDLE_SIZE / 2}px)`,
            top: -((HANDLE_SIZE - 3) / 2),
            width: HANDLE_SIZE, height: HANDLE_SIZE,
            borderRadius: '50%',
            background: handleBg,
            border: `2px solid ${color}`,
            boxShadow: dark ? 'none' : '0 1px 2px rgba(0,0,0,0.12)',
            cursor: 'grab', touchAction: 'none',
          }}
        />
      </div>
    </div>
  )
}
