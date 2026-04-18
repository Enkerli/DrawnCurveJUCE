import { useRef } from 'react'
import { MessageType, type LaneParams } from '../engine/types'
import { midiNoteName } from '../engine/scaleData'
import { ScaleLattice } from './ScaleLattice'

// Format the contextual min/max readout for the range slider.
// Output values shown depend on message type.
function formatRangeValue(norm: number, msgType: MessageType, useFlats: boolean): string {
  switch (msgType) {
    case MessageType.Note:
      return midiNoteName(Math.round(norm * 127), useFlats)
    case MessageType.PitchBend:
      return String(Math.round(norm * 16383) - 8192)
    case MessageType.CC:
    case MessageType.ChannelPressure:
    default:
      return String(Math.round(norm * 127))
  }
}

function rangeUnitLabel(msgType: MessageType): string {
  switch (msgType) {
    case MessageType.Note:        return 'note'
    case MessageType.PitchBend:   return 'bend'
    case MessageType.ChannelPressure: return 'pressure'
    case MessageType.CC:
    default:                      return 'CC value'
  }
}

interface RangeSliderProps {
  min: number  // 0..1
  max: number  // 0..1
  color: string
  dark: boolean
  onChange: (min: number, max: number) => void
}

function RangeSlider({ min, max, color, dark, onChange }: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<'min' | 'max' | null>(null)

  const startDrag = (which: 'min' | 'max') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = which
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (dragRef.current === 'min') onChange(Math.min(v, max - 0.005), max)
    else                            onChange(min, Math.max(v, min + 0.005))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* noop */ }
    }
  }

  const trackBg = dark ? '#3a3a3a' : 'var(--paper-rule)'
  const handleSize = 14

  return (
    <div style={{ position: 'relative', height: 22, padding: '0 8px' }}>
      <div
        ref={trackRef}
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          top: '50%',
          height: 3,
          marginTop: -1.5,
          background: trackBg,
          borderRadius: 2,
        }}
      >
        {/* active span */}
        <div
          style={{
            position: 'absolute',
            left: `${min * 100}%`,
            width: `${(max - min) * 100}%`,
            top: 0,
            height: '100%',
            background: color,
            borderRadius: 2,
          }}
        />
        {/* min handle */}
        <div
          onPointerDown={startDrag('min')}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'absolute',
            left: `calc(${min * 100}% - ${handleSize / 2}px)`,
            top: -((handleSize - 3) / 2),
            width: handleSize,
            height: handleSize,
            borderRadius: '50%',
            background: dark ? '#1a1a1a' : 'var(--paper-card)',
            border: `2px solid ${color}`,
            boxShadow: dark ? 'none' : '0 1px 2px rgba(0,0,0,0.12)',
            cursor: 'grab',
            touchAction: 'none',
          }}
        />
        {/* max handle */}
        <div
          onPointerDown={startDrag('max')}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'absolute',
            left: `calc(${max * 100}% - ${handleSize / 2}px)`,
            top: -((handleSize - 3) / 2),
            width: handleSize,
            height: handleSize,
            borderRadius: '50%',
            background: dark ? '#1a1a1a' : 'var(--paper-card)',
            border: `2px solid ${color}`,
            boxShadow: dark ? 'none' : '0 1px 2px rgba(0,0,0,0.12)',
            cursor: 'grab',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  )
}

const LANE_LABELS = ['Lane 1', 'Lane 2', 'Lane 3']
const LANE_COLORS_DARK = ['#4a90e2', '#e8a838', '#5cb85c']
// v2 Studio harmonious trio — ink-blue, terracotta, moss
const LANE_COLORS_LIGHT = ['#3a4866', '#c45f43', '#5b8a64']
// Mirrors LANE_DASH in CurveDisplay (solid / long-dash / dot-dash) so the
// tab swatch previews the curve texture for that lane.
const LANE_DASH_SWATCH = ['', '6 3', '1 2 6 2']

interface LaneControlsProps {
  laneParams: LaneParams[]
  focusedLane: number
  hasSnapshot: boolean[]
  theme: 'light' | 'dark'
  useFlats: boolean
  onFocusLane: (lane: number) => void
  onUpdateParams: (lane: number, params: Partial<LaneParams>) => void
  onClearLane: (lane: number) => void
}

export function LaneControls({
  laneParams,
  focusedLane,
  hasSnapshot,
  theme,
  useFlats,
  onFocusLane,
  onUpdateParams,
  onClearLane,
}: LaneControlsProps) {
  const dark = theme === 'dark'
  const params = laneParams[focusedLane]
  const laneColors = dark ? LANE_COLORS_DARK : LANE_COLORS_LIGHT
  const color = laneColors[focusedLane]

  const update = (partial: Partial<LaneParams>) => onUpdateParams(focusedLane, partial)

  const inputStyle: React.CSSProperties = {
    background: dark ? '#2a2a2a' : 'var(--paper-bg)',
    color: dark ? '#e0e0e0' : 'var(--paper-ink)',
    border: `1px solid ${dark ? '#444' : 'var(--paper-rule)'}`,
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-sans)',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontStyle: 'italic',
    fontSize: 12,
    color: dark ? '#888' : 'var(--paper-ink50)',
    marginBottom: 2,
    display: 'block',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  }

  const dividerStyle: React.CSSProperties = {
    borderTop: `1px dashed ${dark ? '#333' : 'var(--paper-rule)'}`,
    margin: '4px 0',
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        overflowY: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Lane selector tabs — paper layers, Domine italic */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(lane => {
          const focused = lane === focusedLane
          return (
            <button
              key={lane}
              onClick={() => onFocusLane(lane)}
              style={{
                flex: 1,
                padding: '7px 4px',
                borderRadius: 4,
                border: `1px solid ${focused ? laneColors[lane] : (dark ? '#333' : 'var(--paper-rule)')}`,
                background:
                  focused
                    ? dark ? 'rgba(74,144,226,0.15)' : 'var(--paper-bg)'
                    : 'transparent',
                color: focused ? laneColors[lane] : (dark ? '#666' : 'var(--paper-ink50)'),
                cursor: 'pointer',
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 13,
                fontWeight: focused ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                transition: 'all 0.15s',
                boxShadow: focused && !dark ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              <svg
                width={20}
                height={8}
                style={{ flexShrink: 0, overflow: 'visible' }}
              >
                <line
                  x1={0}
                  x2={20}
                  y1={4}
                  y2={4}
                  stroke={hasSnapshot[lane] ? laneColors[lane] : (dark ? '#333' : 'var(--paper-rule)')}
                  strokeWidth={2}
                  strokeLinecap={LANE_DASH_SWATCH[lane] ? 'butt' : 'round'}
                  strokeDasharray={LANE_DASH_SWATCH[lane] || undefined}
                />
              </svg>
              {LANE_LABELS[lane]}
            </button>
          )
        })}
      </div>

      <div style={dividerStyle} />

      {/* Message type */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Output</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['CC', 'AT', 'PB', '♩'] as const).map((label, i) => {
            const active = params.messageType === i
            return (
              <button
                key={label}
                onClick={() => update({ messageType: i as MessageType })}
                style={{
                  flex: 1,
                  padding: '5px 2px',
                  borderRadius: 4,
                  border: `1px solid ${active ? color : (dark ? '#444' : 'var(--paper-rule)')}`,
                  background: active
                    ? dark ? 'rgba(74,144,226,0.2)' : 'var(--paper-bg)'
                    : 'transparent',
                  color: active ? color : (dark ? '#aaa' : 'var(--paper-ink70)'),
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={dividerStyle} />

      {/* CC-specific controls */}
      {params.messageType === MessageType.CC && (
        <div style={sectionStyle}>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>CC #</label>
              <input
                type="number"
                min={0}
                max={127}
                value={params.ccNumber}
                onChange={e => update({ ccNumber: Math.max(0, Math.min(127, Number(e.target.value))) })}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Channel</label>
              <select
                value={params.midiChannel}
                onChange={e => update({ midiChannel: Number(e.target.value) })}
                style={inputStyle}
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i} value={i}>Ch {i + 1}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* AT / PB channel */}
      {(params.messageType === MessageType.ChannelPressure ||
        params.messageType === MessageType.PitchBend) && (
        <div style={sectionStyle}>
          <label style={labelStyle}>Channel</label>
          <select
            value={params.midiChannel}
            onChange={e => update({ midiChannel: Number(e.target.value) })}
            style={inputStyle}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <option key={i} value={i}>Ch {i + 1}</option>
            ))}
          </select>
        </div>
      )}

      {/* Note mode controls */}
      {params.messageType === MessageType.Note && (
        <div style={sectionStyle}>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Channel</label>
              <select
                value={params.midiChannel}
                onChange={e => update({ midiChannel: Number(e.target.value) })}
                style={inputStyle}
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i} value={i}>Ch {i + 1}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Velocity</label>
              <input
                type="number"
                min={1}
                max={127}
                value={params.noteVelocity}
                onChange={e => update({ noteVelocity: Math.max(1, Math.min(127, Number(e.target.value))) })}
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      )}

      <div style={dividerStyle} />

      {/* Output range — visual plot area is locked; this only affects MIDI mapping.
          Single dual-handle slider with contextual readouts (note name / CC value / pitch bend / pressure). */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={labelStyle}>
            Range
            <span
              style={{
                marginLeft: 6,
                fontFamily: 'var(--font-sans)',
                fontStyle: 'normal',
                fontSize: 10,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: dark ? '#666' : 'var(--paper-ink50)',
              }}
            >
              {rangeUnitLabel(params.messageType)}
            </span>
          </span>
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontVariantNumeric: 'tabular-nums',
              color: dark ? '#bbb' : 'var(--paper-ink70)',
              fontSize: 13,
            }}
          >
            {formatRangeValue(params.minOut, params.messageType, useFlats)}
            <span style={{ margin: '0 4px', opacity: 0.5 }}>→</span>
            {formatRangeValue(params.maxOut, params.messageType, useFlats)}
          </span>
        </div>
        <RangeSlider
          min={params.minOut}
          max={params.maxOut}
          color={color}
          dark={dark}
          onChange={(lo, hi) => update({ minOut: lo, maxOut: hi })}
        />
      </div>

      {/* Smoothing */}
      <div style={sectionStyle}>
        <span style={labelStyle}>
          Smooth
          <span
            style={{
              marginLeft: 6,
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontVariantNumeric: 'tabular-nums',
              color: dark ? '#bbb' : 'var(--paper-ink70)',
              fontSize: 13,
            }}
          >
            {params.smoothing.toFixed(3)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={50}
          value={Math.round(params.smoothing * 100)}
          onChange={e => update({ smoothing: Number(e.target.value) / 100 })}
          style={{ accentColor: color, color }}
        />
      </div>

      <div style={dividerStyle} />

      {/* Mute + Clear */}
      <div style={rowStyle}>
        <button
          onClick={() => update({ enabled: !params.enabled })}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: 4,
            border: `1px solid ${!params.enabled ? '#c45f43' : (dark ? '#444' : 'var(--paper-rule)')}`,
            background: !params.enabled ? 'rgba(196,95,67,0.15)' : 'transparent',
            color: !params.enabled ? '#c45f43' : (dark ? '#aaa' : 'var(--paper-ink70)'),
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {params.enabled ? 'Mute' : 'Unmute'}
        </button>
        <button
          onClick={() => onClearLane(focusedLane)}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: 4,
            border: `1px solid ${dark ? '#444' : 'var(--paper-rule)'}`,
            background: 'transparent',
            color: dark ? '#aaa' : 'var(--paper-ink70)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
          }}
        >
          Clear
        </button>
      </div>

      {/* Scale lattice (Note mode only) */}
      {params.messageType === MessageType.Note && (
        <>
          <div style={dividerStyle} />
          <div style={sectionStyle}>
            <span style={{ ...labelStyle, marginBottom: 4 }}>Scale</span>
            <ScaleLattice
              config={params.scaleConfig}
              onChange={sc => update({ scaleConfig: sc })}
              theme={theme}
              accent={color}
              useFlats={useFlats}
            />
          </div>
        </>
      )}
    </div>
  )
}
