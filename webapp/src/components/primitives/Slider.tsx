// Slider.tsx — horizontal linear slider primitive.
// Ported from Source/WebUI/design/ui-primitives.jsx (Slider).
//
// Commits onChange only on pointer-up to avoid fighting JUCE-style echo
// round-trips.  Maintains local display state during drag so the thumb
// never rubber-bands.

import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

export interface SliderProps {
  value: number        // 0..1 (normalised)
  onChange: (v: number) => void
  width?: number       // px, default 140
  height?: number      // total height px, default 36
  color?: string       // accent / fill colour
  trackColor?: string  // un-filled track colour
  label?: string
  sublabel?: string
  style?: CSSProperties
}

export function Slider({
  value,
  onChange,
  width = 140,
  height = 36,
  color = 'var(--paper-ink)',
  trackColor = 'var(--paper-rule)',
  label,
  sublabel,
  style,
}: SliderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isDrag = useRef(false)
  const [localValue, setLocalValue] = useState<number | null>(null)
  const latestLocal = useRef<number | null>(null)

  const clamp = (v: number) => Math.max(0, Math.min(1, v))

  const calcValue = (e: PointerEvent<HTMLDivElement>) => {
    if (!ref.current) return value
    const r = ref.current.getBoundingClientRect()
    return clamp((e.clientX - r.left) / r.width)
  }

  const displayValue = localValue !== null ? localValue : value
  const thumbX = displayValue * width

  const trackY = (height - 2) / 2
  const thumbY = (height - 12) / 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...style }}>
      {label && (
        <div style={{
          fontFamily: 'Inter Tight, Inter, sans-serif',
          fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
          color: 'var(--paper-ink50)',
        }}>{label}</div>
      )}
      <div
        ref={ref}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          isDrag.current = true
          const v = calcValue(e)
          latestLocal.current = v
          setLocalValue(v)
        }}
        onPointerMove={(e) => {
          if (!isDrag.current) return
          const v = calcValue(e)
          latestLocal.current = v
          setLocalValue(v)
        }}
        onPointerUp={() => {
          isDrag.current = false
          if (latestLocal.current !== null) onChange(latestLocal.current)
          latestLocal.current = null
          setLocalValue(null)
        }}
        onPointerCancel={() => {
          isDrag.current = false
          latestLocal.current = null
          setLocalValue(null)
        }}
        style={{ width, height, position: 'relative', cursor: 'pointer', touchAction: 'none', flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', top: trackY, left: 0, right: 0, height: 2,
                      background: trackColor, borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: trackY, left: 0, width: thumbX, height: 2,
                      background: color, borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: thumbY, left: thumbX - 6, width: 12, height: 12,
                      borderRadius: '50%', background: 'var(--paper-card)',
                      border: `1.5px solid ${color}`,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.10)', pointerEvents: 'none' }} />
      </div>
      {sublabel !== undefined && (
        <div style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 13, fontStyle: 'italic',
          color: 'var(--paper-ink)',
        }}>{sublabel}</div>
      )}
    </div>
  )
}
