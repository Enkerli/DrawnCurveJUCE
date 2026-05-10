// CurveDisplay.tsx — layout wrapper: canvas + quantization axis controls.
//
// Rendering and gesture handling live in CurveCanvas.tsx so that component
// can be reused in ShapeWell / QurveShelf without the axis buttons.

import type { CSSProperties, RefObject } from 'react'
import { useCallback } from 'react'
import { GestureEngine } from '../engine/gestureEngine'
import { type LaneSnapshot, type LaneParams } from '../engine/types'
import { CurveCanvas, LANE_COLORS_DARK, LANE_COLORS_LIGHT, PAPER } from './CurveCanvas'

// ── Props ─────────────────────────────────────────────────────────────────────

interface CurveDisplayProps {
  snapshots: (LaneSnapshot | null)[]
  laneParams: LaneParams[]
  focusedLane: number
  theme: 'light' | 'dark'
  useFlats: boolean
  engineRef: RefObject<GestureEngine>
  onCurveDrawn: (lane: number, snapshot: LaneSnapshot) => void
  onUpdateParams: (lane: number, partial: Partial<LaneParams>) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CurveDisplay({
  snapshots,
  laneParams,
  focusedLane,
  theme,
  useFlats,
  engineRef,
  onCurveDrawn,
  onUpdateParams,
}: CurveDisplayProps) {
  const dark   = theme === 'dark'
  const colors = dark ? LANE_COLORS_DARK : LANE_COLORS_LIGHT
  const color  = colors[focusedLane]
  const params = laneParams[focusedLane]

  const update = useCallback(
    (partial: Partial<LaneParams>) => onUpdateParams(focusedLane, partial),
    [onUpdateParams, focusedLane],
  )

  // ── Axis control styles ───────────────────────────────────────────────────

  const axisBtn: CSSProperties = {
    width: 22, height: 18, padding: 0, fontSize: 13, lineHeight: '18px',
    borderRadius: 3,
    border: `1px solid ${dark ? '#444' : 'var(--paper-rule)'}`,
    background: 'transparent',
    color: dark ? '#888' : 'var(--paper-ink50)',
    cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-sans)',
  }

  const lockBtnStyle = (active: boolean): CSSProperties => ({
    ...axisBtn,
    border:     `1px solid ${active ? color : (dark ? '#444' : 'var(--paper-rule)')}`,
    color:      active ? color : (dark ? '#555' : PAPER.ink30),
    fontWeight: active ? 700 : 400,
    fontSize:   11,
  })

  const countStyle: CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontStyle: 'italic',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
    textAlign: 'center',
    color: dark ? '#ccc' : 'var(--paper-ink70)',
    minWidth: 16,
    userSelect: 'none',
  }

  const bothLocked = params.xQuantize && params.yQuantize

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Main row: Y controls + canvas */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Y axis controls */}
        <div style={{
          width: 26, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 3, paddingRight: 2, paddingBottom: 4,
        }}>
          <button style={axisBtn} onClick={() => update({ yDivisions: Math.min(24, params.yDivisions + 1) })}>+</button>
          <span style={countStyle}>{params.yDivisions}</span>
          <button style={axisBtn} onClick={() => update({ yDivisions: Math.max(2, params.yDivisions - 1) })}>−</button>
          <div style={{ flex: 1 }} />
          <button
            style={lockBtnStyle(params.yQuantize)}
            onClick={() => update({ yQuantize: !params.yQuantize })}
            title={params.yQuantize ? 'Unlock Y' : 'Lock Y quantization'}
          >
            {params.yQuantize ? '⊠' : '⊡'}
          </button>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <CurveCanvas
            snapshots={snapshots}
            laneParams={laneParams}
            focusedLane={focusedLane}
            theme={theme}
            useFlats={useFlats}
            engineRef={engineRef}
            onCurveDrawn={onCurveDrawn}
          />
        </div>
      </div>

      {/* Bottom row: corner # + X axis controls */}
      <div style={{ height: 26, display: 'flex', alignItems: 'center', gap: 3, paddingTop: 2 }}>

        {/* Corner: toggle both X + Y */}
        <div style={{ width: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            style={{
              ...axisBtn,
              border:     `1px solid ${bothLocked ? color : (dark ? '#444' : '#ccc')}`,
              color:      bothLocked ? color : (dark ? '#555' : '#c0c0c0'),
              fontWeight: bothLocked ? 700 : 400, fontSize: 11,
            }}
            onClick={() => update({ xQuantize: !bothLocked, yQuantize: !bothLocked })}
            title="Toggle both X + Y quantization"
          >
            #
          </button>
        </div>

        {/* X axis controls */}
        <button
          style={lockBtnStyle(params.xQuantize)}
          onClick={() => update({ xQuantize: !params.xQuantize })}
          title={params.xQuantize ? 'Unlock X' : 'Lock X quantization'}
        >
          {params.xQuantize ? '⊠' : '⊡'}
        </button>
        <button style={axisBtn} onClick={() => update({ xDivisions: Math.max(2, params.xDivisions - 1) })}>−</button>
        <span style={countStyle}>{params.xDivisions}</span>
        <button style={axisBtn} onClick={() => update({ xDivisions: Math.min(32, params.xDivisions + 1) })}>+</button>
      </div>

    </div>
  )
}
