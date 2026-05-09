// LogSlider.tsx — logarithmic slider primitive.
// Ported from Source/WebUI/design/ui-primitives.jsx (LogSlider).
//
// Equal pixel distance = equal ratio change: 0.5× and 2× are symmetric
// around 1× (the geometric centre of the track).
//
// Commits onChange only on pointer-up (single commit per gesture).
// Maintains local display state during drag to avoid rubber-banding.

import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

export interface TickMark {
  value: number
  label?: string   // '' draws tick with no text; omit to suppress label
}

export interface LogSliderProps {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  snapPx?: number        // snap radius in logical pixels (default 8)
  ticks?: TickMark[]     // hairline marks on the track
  snapTo?: number[]      // values thumb locks to when released within snapPx
  width?: number         // px, default 140
  color?: string         // accent colour
  trackColor?: string
  style?: CSSProperties
}

export function LogSlider({
  value, min, max, onChange,
  snapPx = 8,
  ticks = [],
  snapTo = [],
  width = 140,
  color = 'var(--paper-ink)',
  trackColor = 'var(--paper-rule)',
  style,
}: LogSliderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isDrag = useRef(false)
  const [localValue, setLocalValue] = useState<number | null>(null)
  const latestLocal = useRef<number | null>(null)

  const logMin  = Math.log(min)
  const logSpan = Math.log(max) - logMin

  const toFrac   = (v: number) => (Math.log(Math.max(min, Math.min(max, v))) - logMin) / logSpan
  const fromFrac = (f: number) => Math.exp(logMin + Math.max(0, Math.min(1, f)) * logSpan)

  const calcValue = (e: PointerEvent<HTMLDivElement>): number => {
    if (!ref.current) return value
    const r = ref.current.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    let v = fromFrac(f)
    for (const s of snapTo) {
      if (Math.abs((toFrac(s) - f) * r.width) < snapPx) { v = s; break }
    }
    return v
  }

  const H      = 44
  const TICK_H = ticks.length ? 18 : 0
  const trackY = (H - 2) / 2
  const thumbY = (H - 12) / 2

  const displayValue = localValue !== null ? localValue : value
  const thumbX = toFrac(displayValue) * width

  return (
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
      style={{
        width, flexShrink: 0,
        height: H + TICK_H,
        position: 'relative',
        cursor: 'pointer',
        touchAction: 'none',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', top: trackY, left: 0, right: 0, height: 2,
                    background: trackColor, borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: trackY, left: 0, width: thumbX, height: 2,
                    background: color, borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: thumbY, left: thumbX - 6, width: 12, height: 12,
                    borderRadius: '50%', background: 'var(--paper-card)',
                    border: `1.5px solid ${color}`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.10)', pointerEvents: 'none' }} />

      {ticks.map(({ value: tv, label }) => {
        const tx = toFrac(tv) * width
        return (
          <div key={tv}>
            <div style={{ position: 'absolute', top: trackY + 5, left: tx, width: 1, height: 5,
                          background: 'var(--paper-ink30)',
                          transform: 'translateX(-0.5px)' }} />
            {label !== undefined && label !== '' && (
              <div style={{ position: 'absolute', top: trackY + 12, left: tx,
                            transform: 'translateX(-50%)',
                            fontSize: 8, fontFamily: 'Inter Tight, Inter, sans-serif',
                            letterSpacing: 0.2, color: 'var(--paper-ink50)',
                            whiteSpace: 'nowrap', userSelect: 'none' }}>{label}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
