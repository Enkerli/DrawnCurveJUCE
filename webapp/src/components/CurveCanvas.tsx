// CurveCanvas.tsx — pure canvas renderer + gesture capture for one focused lane.
//
// Split from CurveDisplay.tsx so the canvas can be embedded in other surfaces
// (e.g. ShapeWell, QurveShelf) without the quantization axis-control buttons.
// CurveDisplay.tsx is now a thin layout wrapper that adds those controls.

import { useRef, useEffect, useCallback } from 'react'
import type { CSSProperties, PointerEvent, RefObject } from 'react'
import { CaptureSession } from '../engine/captureSession'
import { GestureEngine } from '../engine/gestureEngine'
import { type LaneSnapshot, type LaneParams, type ScaleConfig, MessageType } from '../engine/types'
import { midiNoteName } from '../engine/scaleData'

// ── Constants (shared with CurveDisplay) ─────────────────────────────────────

export const LANE_COLORS_DARK  = ['#4a90e2', '#e8a838', '#5cb85c']
export const LANE_COLORS_LIGHT = ['#3a4866', '#c45f43', '#5b8a64']
export const LANE_DASH: number[][] = [[], [10, 5], [2, 4, 10, 4]]

const GRID_COLOR_DARK  = 'rgba(255,255,255,0.07)'
const GRID_COLOR_LIGHT = 'rgba(44,39,35,0.10)'

// Paper palette mirrors --paper-* CSS vars (used inside Canvas where vars don't apply).
export const PAPER = {
  bg:     '#f3eee3',
  bgDeep: '#e8e1d1',
  card:   '#faf6eb',
  margin: '#ebe5d4',
  rule:   'rgba(44,39,35,0.18)',
  ink70:  'rgba(44,39,35,0.55)',
  ink50:  'rgba(44,39,35,0.40)',
  ink30:  'rgba(44,39,35,0.25)',
}

// Plot area margins (CSS px) — left/bottom reserve space for axis labels.
export const PL = 34
export const PT = 2
export const PR = 2
export const PB = 16

// ── Helpers ───────────────────────────────────────────────────────────────────

function snapToYGrid(val: number, yDiv: number): number {
  return Math.max(0, Math.min(1, Math.round(val * (yDiv - 1)) / (yDiv - 1)))
}

function toVisualY(val: number, snap: LaneSnapshot, sc: ScaleConfig, plotY: number, plotH: number): number {
  if (snap.messageType === MessageType.Note) {
    const rawNoteF = (snap.minOut + val * (snap.maxOut - snap.minOut)) * 127
    const rawNote  = Math.max(0, Math.min(127, Math.round(rawNoteF)))
    const snapped  = GestureEngine.quantizeNote(rawNote, sc, true)
    const snNorm   = (snapped / 127 - snap.minOut) / Math.max(snap.maxOut - snap.minOut, 0.001)
    return plotY + (1 - Math.max(0, Math.min(1, snNorm))) * plotH
  }
  return plotY + (1 - val) * plotH
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CurveCanvasProps {
  snapshots: (LaneSnapshot | null)[]
  laneParams: LaneParams[]
  focusedLane: number
  theme: 'light' | 'dark'
  useFlats: boolean
  engineRef: RefObject<GestureEngine>
  onCurveDrawn: (lane: number, snapshot: LaneSnapshot) => void
  style?: CSSProperties
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CurveCanvas({
  snapshots,
  laneParams,
  focusedLane,
  theme,
  useFlats,
  engineRef,
  onCurveDrawn,
  style,
}: CurveCanvasProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const captureRef    = useRef(new CaptureSession())
  const isDrawingRef  = useRef(false)
  const drawingPtsRef = useRef<{ x: number; y: number }[]>([])
  const rafRef        = useRef<number>(0)

  // Stable refs so rAF closure never goes stale
  const snapshotsRef  = useRef(snapshots)
  const focusedRef    = useRef(focusedLane)
  const themeRef      = useRef(theme)
  const paramsRef     = useRef(laneParams)
  const useFlatsRef   = useRef(useFlats)
  snapshotsRef.current  = snapshots
  focusedRef.current    = focusedLane
  themeRef.current      = theme
  paramsRef.current     = laneParams
  useFlatsRef.current   = useFlats

  // ── Main draw loop ──────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr   = window.devicePixelRatio || 1
    const W     = canvas.width  / dpr
    const H     = canvas.height / dpr
    const plotX = PL
    const plotY = PT
    const plotW = W - PL - PR
    const plotH = H - PT - PB
    if (plotW < 1 || plotH < 1) { rafRef.current = requestAnimationFrame(draw); return }

    const isDark      = themeRef.current === 'dark'
    const laneColors  = isDark ? LANE_COLORS_DARK : LANE_COLORS_LIGHT
    const gridColor   = isDark ? GRID_COLOR_DARK  : GRID_COLOR_LIGHT
    const snaps       = snapshotsRef.current
    const fp          = paramsRef.current[focusedRef.current]
    const gx          = fp.xDivisions
    const gy          = fp.yDivisions
    const xQ          = fp.xQuantize
    const yQ          = fp.yQuantize
    const fColor      = laneColors[focusedRef.current]

    // ── Background ─────────────────────────────────────────────────────────
    ctx.fillStyle = isDark ? '#111' : PAPER.card
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = isDark ? '#0c0c0c' : PAPER.margin
    ctx.fillRect(0, 0, plotX, H)
    ctx.fillRect(0, plotY + plotH, W, PB)

    // ── Note-band visualization ─────────────────────────────────────────────
    const bands: { note: number; y: number }[] = []
    if (fp.messageType === MessageType.Note && fp.scaleConfig.mask !== 0xfff) {
      const sc   = fp.scaleConfig
      const minN = Math.round(fp.minOut * 127)
      const maxN = Math.round(fp.maxOut * 127)
      for (let n = maxN; n >= minN; n--) {
        const interval = ((n % 12) - sc.root + 12) % 12
        if ((sc.mask >> (11 - interval)) & 1) {
          const norm = (n / 127 - fp.minOut) / Math.max(fp.maxOut - fp.minOut, 0.001)
          bands.push({ note: n, y: plotY + (1 - Math.max(0, Math.min(1, norm))) * plotH })
        }
      }
      if (bands.length >= 2) {
        for (let i = 0; i < bands.length; i++) {
          const noteY  = bands[i].y
          const halfUp = i === 0             ? (noteY - plotY)           * 0.5 : (noteY - bands[i - 1].y) * 0.5
          const halfDn = i + 1 < bands.length ? (bands[i + 1].y - noteY) * 0.5 : (plotY + plotH - noteY)  * 0.5
          const bandH  = halfUp + halfDn
          if (bandH < 0.5) continue
          ctx.fillStyle = (i & 1)
            ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(196,95,67,0.05)')
            : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(196,95,67,0.12)')
          ctx.fillRect(plotX, noteY - halfUp, plotW, bandH)
        }
      }
    }

    // ── Grid lines ──────────────────────────────────────────────────────────
    ctx.lineWidth = 1
    const strongGrid = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(44,39,35,0.22)'
    for (let i = 1; i < gx; i++) {
      ctx.strokeStyle = xQ ? strongGrid : gridColor
      const x = plotX + (i / gx) * plotW
      ctx.beginPath(); ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH); ctx.stroke()
    }
    for (let i = 1; i < gy; i++) {
      ctx.strokeStyle = yQ ? strongGrid : gridColor
      const y = plotY + (i / gy) * plotH
      ctx.beginPath(); ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y); ctx.stroke()
    }

    // ── Quantize emphasis ───────────────────────────────────────────────────
    if (xQ) {
      ctx.save(); ctx.fillStyle = fColor; ctx.globalAlpha = 0.22
      for (let i = 1; i < gx; i++) {
        const x = plotX + (i / gx) * plotW
        ctx.fillRect(x - 0.75, plotY, 1.5, plotH)
      }
      ctx.restore()
    }
    if (yQ) {
      ctx.save(); ctx.fillStyle = fColor; ctx.globalAlpha = 0.22
      for (let i = 1; i < gy; i++) {
        const y = plotY + (i / gy) * plotH
        ctx.fillRect(plotX, y - 0.75, plotW, 1.5)
      }
      ctx.restore()
    }

    // ── Plot area border ────────────────────────────────────────────────────
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : PAPER.rule
    ctx.lineWidth = 1
    ctx.strokeRect(plotX + 0.5, plotY + 0.5, plotW - 1, plotH - 1)

    // ── Raw curves ──────────────────────────────────────────────────────────
    for (let lane = 0; lane < 3; lane++) {
      const snap = snaps[lane]
      if (!snap?.valid) continue
      const focused = lane === focusedRef.current
      ctx.save()
      ctx.globalAlpha  = focused ? 1 : 0.35
      ctx.strokeStyle  = laneColors[lane]
      ctx.lineWidth    = focused ? 2.75 : 1.75
      ctx.lineJoin     = 'round'
      ctx.lineCap      = LANE_DASH[lane].length === 0 ? 'round' : 'butt'
      ctx.setLineDash(LANE_DASH[lane])
      ctx.beginPath()
      for (let i = 0; i < 256; i++) {
        const x = plotX + (i / 255) * plotW
        const y = plotY + (1 - snap.table[i]) * plotH
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    // ── In-progress gesture ─────────────────────────────────────────────────
    if (isDrawingRef.current && drawingPtsRef.current.length >= 2) {
      ctx.save()
      const drawLane = focusedRef.current
      ctx.strokeStyle = laneColors[drawLane]
      ctx.lineWidth   = 2.75
      ctx.globalAlpha = 0.75
      ctx.lineJoin    = 'round'
      ctx.lineCap     = LANE_DASH[drawLane].length === 0 ? 'round' : 'butt'
      ctx.setLineDash(LANE_DASH[drawLane])
      ctx.beginPath()
      const pts = drawingPtsRef.current
      for (let i = 0; i < pts.length; i++) {
        const x = plotX + pts[i].x * plotW
        const y = plotY + pts[i].y * plotH
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    // ── Staircase overlay ───────────────────────────────────────────────────
    for (let stairLane = 0; stairLane < 3; stairLane++) {
      const snap = snaps[stairLane]
      if (!snap?.valid) continue
      const lp  = paramsRef.current[stairLane]
      const sxQ = lp.xQuantize && lp.xDivisions >= 2
      const syQ = lp.yQuantize && lp.yDivisions >= 2
      if (!sxQ && !syQ) continue

      const sc        = lp.scaleConfig
      const isFocused = stairLane === focusedRef.current

      ctx.save()
      ctx.strokeStyle = laneColors[stairLane]
      ctx.lineWidth   = isFocused ? 2.5 : 1.8
      ctx.globalAlpha = isFocused ? 0.75 : 0.45
      ctx.lineJoin    = 'round'
      ctx.setLineDash(LANE_DASH[stairLane])
      ctx.beginPath()

      if (sxQ) {
        let started = false
        for (let i = 0; i < lp.xDivisions; i++) {
          const x1   = plotX + (i / lp.xDivisions) * plotW
          const x2   = plotX + ((i + 1) / lp.xDivisions) * plotW
          const tidx = Math.max(0, Math.min(255, Math.round(i / lp.xDivisions * 255)))
          const raw  = snap.table[tidx]
          const val  = syQ ? snapToYGrid(raw, lp.yDivisions) : raw
          const cy   = toVisualY(val, snap, sc, plotY, plotH)
          if (!started) { ctx.moveTo(x1, cy); started = true }
          else            ctx.lineTo(x1, cy)
          ctx.lineTo(x2, cy)
        }
      } else {
        for (let i = 0; i < 256; i++) {
          const cx  = plotX + (i / 255) * plotW
          const val = snapToYGrid(snap.table[i], lp.yDivisions)
          const cy  = toVisualY(val, snap, sc, plotY, plotH)
          if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy)
        }
      }

      ctx.stroke()
      ctx.restore()
    }

    // ── Playheads ───────────────────────────────────────────────────────────
    const engine = engineRef.current
    if (engine) {
      const phases = engine.getPhases()
      for (let lane = 0; lane < 3; lane++) {
        if (!snaps[lane]?.valid) continue
        const phase = phases[lane]
        const x     = plotX + phase * plotW
        const clr   = laneColors[lane]
        const isFocused = lane === focusedRef.current
        ctx.save()
        ctx.strokeStyle = clr
        ctx.lineWidth   = 1.5
        ctx.globalAlpha = isFocused ? 0.9 : 0.4
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH); ctx.stroke()
        ctx.setLineDash([])
        const snap = snaps[lane]
        if (snap) {
          const idx = Math.round(phase * 255) & 255
          const y   = plotY + (1 - snap.table[idx]) * plotH
          ctx.globalAlpha = isFocused ? 1 : 0.5
          ctx.fillStyle   = clr
          ctx.beginPath()
          ctx.arc(x, y, isFocused ? 5 : 3.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = isDark ? '#111' : PAPER.bg
          ctx.lineWidth   = 1.75
          ctx.globalAlpha = 1
          ctx.stroke()

          if (isFocused) {
            const sent = engine.getLastSentValue(lane)
            let label: string | null = null
            switch (snap.messageType) {
              case MessageType.Note:
                if (sent >= 0) label = midiNoteName(sent, useFlatsRef.current)
                break
              case MessageType.PitchBend: {
                const v = sent >= 0 ? sent : Math.round(snap.minOut * 16383)
                label = String(v - 8192)
                break
              }
              case MessageType.ChannelPressure:
              case MessageType.CC:
              default: {
                const v = sent >= 0
                  ? sent
                  : Math.round((snap.minOut + snap.table[idx] * (snap.maxOut - snap.minOut)) * 127)
                label = String(v)
                break
              }
            }
            if (label) {
              ctx.font          = 'italic 600 12px Domine, Georgia, serif'
              ctx.textBaseline  = 'middle'
              const padX = 5
              const padY = 2
              const metrics = ctx.measureText(label)
              const w = metrics.width + padX * 2
              const h = 16
              let bx = x + 9
              if (bx + w > plotX + plotW - 2) bx = x - 9 - w
              const by = Math.max(plotY + 2, Math.min(plotY + plotH - h - 2, y - h / 2))
              ctx.globalAlpha = 0.95
              ctx.fillStyle   = isDark ? 'rgba(20,20,20,0.85)' : 'rgba(250,246,235,0.92)'
              ctx.strokeStyle = clr
              ctx.lineWidth   = 1
              const r = 3
              ctx.beginPath()
              ctx.moveTo(bx + r, by)
              ctx.lineTo(bx + w - r, by)
              ctx.quadraticCurveTo(bx + w, by, bx + w, by + r)
              ctx.lineTo(bx + w, by + h - r)
              ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h)
              ctx.lineTo(bx + r, by + h)
              ctx.quadraticCurveTo(bx, by + h, bx, by + h - r)
              ctx.lineTo(bx, by + r)
              ctx.quadraticCurveTo(bx, by, bx + r, by)
              ctx.fill()
              ctx.stroke()
              ctx.fillStyle  = clr
              ctx.textAlign  = 'left'
              ctx.fillText(label, bx + padX, by + h / 2 + padY * 0.25)
            }
          }
        }
        ctx.restore()
      }
    }

    // ── Y-axis labels ───────────────────────────────────────────────────────
    ctx.font          = 'italic 10px Domine, Georgia, serif'
    ctx.textAlign     = 'right'
    ctx.textBaseline  = 'middle'
    ctx.fillStyle     = isDark ? 'rgba(255,255,255,0.55)' : PAPER.ink70

    if (bands.length >= 2) {
      let lastY = -99
      for (const { note, y } of bands) {
        const ly = Math.max(plotY + 1, Math.min(plotY + plotH - 5, y))
        if (ly < lastY + 10) continue
        ctx.fillText(midiNoteName(note, useFlatsRef.current), plotX - 3, ly)
        lastY = ly
      }
    } else {
      let lastY = -99
      for (let i = gy; i >= 0; i--) {
        const norm   = i / gy
        const y      = plotY + (1 - norm) * plotH
        const ly     = Math.max(plotY + 1, Math.min(plotY + plotH - 5, y))
        if (ly < lastY + 10) continue
        const ranged = fp.minOut + norm * (fp.maxOut - fp.minOut)
        let label    = ''
        switch (fp.messageType) {
          case MessageType.Note:
            label = midiNoteName(Math.max(0, Math.min(127, Math.round(ranged * 127))), useFlatsRef.current)
            break
          case MessageType.PitchBend: {
            const pb = Math.round((ranged - 0.5) * 200)
            label = (pb >= 0 ? '+' : '') + pb + '%'
            break
          }
          default:
            label = String(Math.round(ranged * 127))
        }
        ctx.fillText(label, plotX - 3, ly)
        lastY = ly
      }
    }

    // ── X-axis labels ───────────────────────────────────────────────────────
    ctx.font         = 'italic 10px Domine, Georgia, serif'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle    = isDark ? 'rgba(255,255,255,0.45)' : PAPER.ink50
    for (let i = 1; i < gx; i++) {
      const x   = plotX + (i / gx) * plotW
      const pct = Math.round((i / gx) * 100)
      ctx.fillText(pct + '%', x, plotY + plotH + 3)
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [engineRef])

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

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

  // ── Pointer handling ─────────────────────────────────────────────────────────

  const getPos = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const pW   = rect.width  - PL - PR
    const pH   = rect.height - PT - PB
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left  - PL) / pW)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top   - PT) / pH)),
    }
  }

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      isDrawingRef.current  = true
      drawingPtsRef.current = []
      captureRef.current.begin()
      engineRef.current?.stopLane(focusedLane)
      const pos = getPos(e)
      captureRef.current.addPoint(pos.x, pos.y)
      drawingPtsRef.current.push(pos)
    },
    [engineRef, focusedLane],
  )

  const handlePointerMove = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const pos = getPos(e)
    captureRef.current.addPoint(pos.x, pos.y)
    drawingPtsRef.current.push(pos)
  }, [])

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      const pos = getPos(e)
      captureRef.current.addPoint(pos.x, pos.y)
      const snapshot = captureRef.current.finalize(laneParams[focusedLane])
      if (snapshot) {
        engineRef.current?.setSnapshot(focusedLane, snapshot)
        onCurveDrawn(focusedLane, snapshot)
        engineRef.current?.resetLane(focusedLane)
      }
      drawingPtsRef.current = []
    },
    [engineRef, focusedLane, laneParams, onCurveDrawn],
  )

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block', width: '100%', height: '100%',
        touchAction: 'none', cursor: 'crosshair', borderRadius: '6px',
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}
