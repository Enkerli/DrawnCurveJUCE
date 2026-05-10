// ShapeWell.tsx — miniature curve preview + shape preset generator.
//
// Renders a compact read-only thumbnail of the focused lane's current curve
// and provides one-click preset buttons (Sine, Tri, Saw, Square, Clear) that
// inject a generated curve into that lane via onCurveApplied.
//
// Depends on:
//   - webapp/src/engine/curveUtils.ts (generators + sampleCurve)
//   - webapp/src/components/CurveCanvas (exported LANE_COLORS_* / LANE_DASH constants)

import { useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { LaneSnapshot, LaneParams } from '../engine/types'
import { makeSineCurve, makeTriangleCurve, makeSawtoothCurve, makeSquareCurve } from '../engine/curveUtils'
import { LANE_COLORS_DARK, LANE_COLORS_LIGHT, LANE_DASH } from './CurveCanvas'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ShapeWellProps {
  snapshot: LaneSnapshot | null
  lane: number
  laneParams: LaneParams
  theme: 'light' | 'dark'
  onCurveApplied: (lane: number, table: Float32Array) => void
}

// ── Preset definitions ───────────────────────────────────────────────────────

const PRESETS: { label: string; title: string; fn: () => Float32Array }[] = [
  { label: '∿',  title: 'Sine',     fn: () => makeSineCurve(256, 0.5, 0.42) },
  { label: '△',  title: 'Triangle', fn: () => makeTriangleCurve(256, 0.5, 0.42) },
  { label: '⟋',  title: 'Sawtooth', fn: () => makeSawtoothCurve(256, 0.5, 0.42) },
  { label: '⊓',  title: 'Square',   fn: () => makeSquareCurve(256, 0.5, 0.42) },
]

// ── Component ────────────────────────────────────────────────────────────────

export function ShapeWell({ snapshot, lane, laneParams, theme, onCurveApplied }: ShapeWellProps) {
  const dark    = theme === 'dark'
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const laneColors = dark ? LANE_COLORS_DARK : LANE_COLORS_LIGHT
  const color      = laneColors[lane]
  const dash       = LANE_DASH[lane]

  // ── Miniature canvas draw ─────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W   = canvas.width  / dpr
    const H   = canvas.height / dpr

    // Background
    ctx.fillStyle = dark ? '#111' : 'var(--paper-card)'
    ctx.fillRect(0, 0, W, H)

    if (!snapshot?.valid) {
      // Empty hint
      ctx.font          = 'italic 11px Domine, Georgia, serif'
      ctx.textAlign     = 'center'
      ctx.textBaseline  = 'middle'
      ctx.fillStyle     = dark ? 'rgba(255,255,255,0.2)' : 'rgba(44,39,35,0.2)'
      ctx.fillText('no curve', W / 2, H / 2)
      return
    }

    // Curve
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth   = 1.75
    ctx.lineJoin    = 'round'
    ctx.lineCap     = dash.length === 0 ? 'round' : 'butt'
    ctx.setLineDash(dash)
    const PAD = 4
    const pw  = W - PAD * 2
    const ph  = H - PAD * 2
    ctx.beginPath()
    for (let i = 0; i < 256; i++) {
      const x = PAD + (i / 255) * pw
      const y = PAD + (1 - snapshot.table[i]) * ph
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()

    // Border
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(44,39,35,0.15)'
    ctx.lineWidth   = 1
    ctx.setLineDash([])
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1)
  }, [snapshot, dark, color, dash])

  // ── Resize observer ───────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      const dpr  = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width  = Math.round(rect.width  * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      ctx?.scale(dpr, dpr)
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // ── Clear handler ─────────────────────────────────────────────────────────

  const handleClear = () => onCurveApplied(lane, new Float32Array(256).fill(0.5))

  // ── Styles ────────────────────────────────────────────────────────────────

  const ruleColor = dark ? '#333' : 'var(--paper-rule)'

  const presetBtn = (active = false): CSSProperties => ({
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 4,
    border: `1px solid ${active ? color : ruleColor}`,
    background: 'transparent',
    color: active ? color : (dark ? '#888' : 'var(--paper-ink50)'),
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  })

  const labelStyle: CSSProperties = {
    fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: dark ? '#666' : 'var(--paper-ink50)',
    marginBottom: 6,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>
          Shape · Lane {lane + 1}
        </span>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: color, flexShrink: 0,
        }} />
      </div>

      {/* Miniature curve preview */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: 64,
          borderRadius: 4,
        }}
      />

      {/* Shape preset buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {PRESETS.map(({ label, title, fn }) => (
          <button
            key={title}
            title={title}
            onClick={() => onCurveApplied(lane, fn())}
            style={presetBtn()}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Clear */}
        <button
          title="Clear curve"
          onClick={handleClear}
          style={{
            ...presetBtn(),
            fontSize: 11,
            fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
            letterSpacing: 0.3,
            width: 'auto',
            padding: '0 10px',
          }}
        >
          Clear
        </button>
      </div>

      {/* Smoothing — compact inline slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={labelStyle}>Smooth</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={laneParams.smoothing}
          onChange={e => {
            // Smoothing is reported only; parent handles via onUpdateParams.
            // This component is intentionally read-mostly; see LaneControls for
            // the smoothing update wiring.
            void e
          }}
          style={{ flex: 1, accentColor: color }}
        />
        <span style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontStyle: 'italic',
          fontSize: 13,
          minWidth: 32,
          textAlign: 'right',
          color: dark ? '#ccc' : 'var(--paper-ink70)',
        }}>
          {laneParams.smoothing.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
