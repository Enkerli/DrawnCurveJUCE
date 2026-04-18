import { useRef, useState } from 'react'
import { noteNames, SCALE_FAMILIES } from '../engine/scaleData'
import { type ScaleConfig } from '../engine/types'

const LONG_PRESS_MS = 500
const DOUBLE_TAP_MS = 350

// Shared press-gesture hook for piano keys and wheel nodes:
// tap → onTap, double-tap or long-press → onSetRoot.
function usePressGesture(onTap: () => void, onSetRoot: () => void) {
  const press = useRef<{ timer: number | null; lastTap: number; longFired: boolean }>({
    timer: null,
    lastTap: 0,
    longFired: false,
  })

  const clearTimer = () => {
    if (press.current.timer !== null) {
      clearTimeout(press.current.timer)
      press.current.timer = null
    }
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      press.current.longFired = false
      clearTimer()
      press.current.timer = window.setTimeout(() => {
        press.current.longFired = true
        onSetRoot()
      }, LONG_PRESS_MS)
    },
    onPointerUp: () => {
      clearTimer()
      if (press.current.longFired) return
      const now = Date.now()
      if (now - press.current.lastTap < DOUBLE_TAP_MS) {
        onSetRoot()
        press.current.lastTap = 0
      } else {
        onTap()
        press.current.lastTap = now
      }
    },
    onPointerCancel: clearTimer,
    onPointerLeave: clearTimer,
  }
}

interface ScaleLatticeProps {
  config: ScaleConfig
  onChange: (config: ScaleConfig) => void
  theme: 'light' | 'dark'
  accent?: string
  useFlats?: boolean
}

// Piano keyboard layout for pitch classes 0 (C) … 11 (B).
// xFrac: x-center as a fraction of the container width.
// black: true = accidental (top row), false = natural (bottom row).
const W = 1 / 7
const KEY_LAYOUT: { xFrac: number; black: boolean }[] = [
  { xFrac: 0.5 * W, black: false }, // C
  { xFrac: 1.0 * W, black: true  }, // C♯
  { xFrac: 1.5 * W, black: false }, // D
  { xFrac: 2.0 * W, black: true  }, // D♯
  { xFrac: 2.5 * W, black: false }, // E
  { xFrac: 3.5 * W, black: false }, // F
  { xFrac: 4.0 * W, black: true  }, // F♯
  { xFrac: 4.5 * W, black: false }, // G
  { xFrac: 5.0 * W, black: true  }, // G♯
  { xFrac: 5.5 * W, black: false }, // A
  { xFrac: 6.0 * W, black: true  }, // A♯
  { xFrac: 6.5 * W, black: false }, // B
]

const CD = 22          // circle diameter (px)
const BLK_H = 28       // height of accidental row
const WHT_H = 28       // height of natural row
const LBL_H = 12       // label row below naturals
const PIANO_H = BLK_H + WHT_H + LBL_H

export function ScaleLattice({ config, onChange, theme, accent, useFlats = false }: ScaleLatticeProps) {
  const dark = theme === 'dark'
  const amber = accent ?? (dark ? '#e8a838' : '#cb9839')
  const NAMES = noteNames(useFlats)

  // Pre-select the family matching the current mask, if any
  const [familyIdx, setFamilyIdx] = useState<number | null>(() => {
    for (let fi = 0; fi < SCALE_FAMILIES.length; fi++) {
      if (SCALE_FAMILIES[fi].modes.some(m => m.mask === config.mask)) return fi
    }
    return null
  })

  // View toggles — user can hide either representation
  const [showRows, setShowRows] = useState(true)
  const [showWheel, setShowWheel] = useState(true)

  const isActive = (interval: number) => !!((config.mask >> (11 - interval)) & 1)

  const togglePc = (pc: number) => {
    const interval = (pc - config.root + 12) % 12
    if (interval === 0) return  // root is always on
    const bit = 1 << (11 - interval)
    onChange({ ...config, mask: (config.mask ^ bit) & 0xfff })
  }

  const setRoot = (pc: number) => {
    if (pc === config.root) return
    onChange({ ...config, root: pc })
  }

  const btnBase: React.CSSProperties = {
    padding: '3px 7px',
    fontSize: 10,
    borderRadius: 4,
    border: `1px solid ${dark ? '#444' : '#ccc'}`,
    background: 'transparent',
    color: dark ? '#aaa' : '#666',
    cursor: 'pointer',
    fontWeight: 400,
    whiteSpace: 'nowrap',
  }

  const activeBtnStyle = (active: boolean): React.CSSProperties => ({
    ...btnBase,
    border: `1px solid ${active ? (dark ? '#4a90e2' : '#1a60c8') : (dark ? '#444' : '#ccc')}`,
    background: active ? (dark ? 'rgba(74,144,226,0.2)' : 'rgba(26,96,200,0.1)') : 'transparent',
    color: active ? (dark ? '#4a90e2' : '#1a60c8') : (dark ? '#aaa' : '#666'),
    fontWeight: active ? 700 : 400,
  })

  const viewToggle = (on: boolean): React.CSSProperties => ({
    padding: '2px 7px',
    borderRadius: 3,
    border: `1px solid ${on ? amber : (dark ? '#444' : 'var(--paper-rule)')}`,
    background: on ? (dark ? 'rgba(232,168,56,0.15)' : 'rgba(203,152,57,0.14)') : 'transparent',
    color: on ? amber : (dark ? '#888' : 'var(--paper-ink50)'),
    cursor: 'pointer',
    fontFamily: 'var(--font-serif)',
    fontStyle: 'italic',
    fontSize: 11,
    fontWeight: on ? 600 : 400,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Root note selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 12,
          color: dark ? '#888' : 'var(--paper-ink50)',
          minWidth: 30,
        }}>Root</span>
        <select
          value={config.root}
          onChange={e => onChange({ ...config, root: Number(e.target.value) })}
          style={{
            background: dark ? '#2a2a2a' : 'var(--paper-bg)',
            color: dark ? '#e0e0e0' : 'var(--paper-ink)',
            border: `1px solid ${dark ? '#444' : 'var(--paper-rule)'}`,
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {NAMES.map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>
      </div>

      {/* Two-level scale family picker — drives both Rows and Wheel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {SCALE_FAMILIES.map((fam, fi) => (
            <button
              key={fi}
              onClick={() => setFamilyIdx(fi === familyIdx ? null : fi)}
              style={activeBtnStyle(fi === familyIdx)}
            >
              {fam.name}
            </button>
          ))}
        </div>
        {familyIdx !== null && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {SCALE_FAMILIES[familyIdx].modes.map((mode, mi) => (
              <button
                key={mi}
                onClick={() => onChange({ ...config, mask: mode.mask })}
                style={activeBtnStyle(config.mask === mode.mask)}
              >
                {mode.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View toggles — show/hide each representation */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 11,
          color: dark ? '#888' : 'var(--paper-ink50)',
        }}>view</span>
        <button onClick={() => setShowRows(v => !v)} style={viewToggle(showRows)}>
          Rows
        </button>
        <button onClick={() => setShowWheel(v => !v)} style={viewToggle(showWheel)}>
          Wheel
        </button>
      </div>

      {/* Piano-style two-row lattice — tap toggles, double-tap or long-press sets root */}
      {showRows && (
      <div style={{ position: 'relative', height: PIANO_H, width: '100%' }}>
        {Array.from({ length: 12 }, (_, pc) => (
          <PianoKey
            key={pc}
            pc={pc}
            config={config}
            isActive={isActive}
            onToggle={togglePc}
            onSetRoot={setRoot}
            dark={dark}
            names={NAMES}
          />
        ))}
      </div>
      )}

      {/* Chromatic wheel — pitch-class polygon */}
      {showWheel && (
        <ChromaticWheel
          config={config}
          onTogglePc={togglePc}
          onSetRoot={setRoot}
          isActive={isActive}
          theme={theme}
          accent={amber}
          names={NAMES}
        />
      )}

    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Piano key — tap toggles PC, double-tap or long-press sets
// the root. Long-press is the touch-friendly equivalent of
// double-click; both are kept so mouse and touch each have a
// natural gesture.
// ──────────────────────────────────────────────────────────
interface PianoKeyProps {
  pc: number
  config: ScaleConfig
  isActive: (interval: number) => boolean
  onToggle: (pc: number) => void
  onSetRoot: (pc: number) => void
  dark: boolean
  names: readonly string[]
}

function PianoKey({ pc, config, isActive, onToggle, onSetRoot, dark, names }: PianoKeyProps) {
  const { xFrac, black } = KEY_LAYOUT[pc]
  const interval = (pc - config.root + 12) % 12
  const active = isActive(interval)
  const isRoot = pc === config.root
  const noteLabel = names[pc]

  const top = black
    ? (BLK_H - CD) / 2
    : BLK_H + (WHT_H - CD) / 2

  const circleColor = isRoot
    ? (dark ? '#4a90e2' : '#1a60c8')
    : active
      ? dark ? 'rgba(74,144,226,0.35)' : 'rgba(26,96,200,0.22)'
      : 'transparent'

  const borderColor = active
    ? (dark ? '#4a90e2' : '#1a60c8')
    : (dark ? '#444' : '#ccc')

  const press = usePressGesture(() => onToggle(pc), () => onSetRoot(pc))

  return (
    <div>
      <div
        {...press}
        style={{
          position: 'absolute',
          left: `calc(${xFrac * 100}% - ${CD / 2}px)`,
          top,
          width: CD,
          height: CD,
          borderRadius: '50%',
          border: `2px solid ${borderColor}`,
          background: circleColor,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: black ? 7 : 8,
          fontWeight: 600,
          color: active ? (dark ? '#e0e0e0' : '#111') : (dark ? '#555' : '#bbb'),
          userSelect: 'none',
          touchAction: 'manipulation',
          transition: 'background 0.1s, border-color 0.1s',
          zIndex: black ? 2 : 1,
        }}
        title={`${noteLabel} — tap toggles, double-tap or long-press sets root`}
      >
        {black ? noteLabel : ''}
      </div>

      {!black && (
        <span
          style={{
            position: 'absolute',
            left: `calc(${xFrac * 100}% - 10px)`,
            top: BLK_H + WHT_H,
            width: 20,
            textAlign: 'center',
            fontSize: 8,
            color: active ? (dark ? '#4a90e2' : '#1a60c8') : (dark ? '#666' : '#aaa'),
            fontWeight: active ? 700 : 400,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {noteLabel}
        </span>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Chromatic wheel — 12 pitch classes on a circle, polygon
// connects the active ones to reveal scale-interval geometry.
// Click a node to toggle its PC; double-click to set root.
// ──────────────────────────────────────────────────────────
interface WheelProps {
  config: ScaleConfig
  onTogglePc: (pc: number) => void
  onSetRoot: (pc: number) => void
  isActive: (interval: number) => boolean
  theme: 'light' | 'dark'
  accent: string
  names: readonly string[]
}

function ChromaticWheel({ config, onTogglePc, onSetRoot, isActive, theme, accent, names }: WheelProps) {
  const dark = theme === 'dark'

  // Layout
  const VB = 200
  const C = VB / 2
  const MID_R = 68           // where the PC nodes sit
  const LABEL_R = 92         // text labels outside the nodes
  const INNER_R = 40         // inner guide ring

  const ink    = dark ? '#d8d8d8' : 'var(--paper-ink)'
  const ink50  = dark ? '#888'    : 'var(--paper-ink50)'
  const ink30  = dark ? '#555'    : 'var(--paper-ink30)'
  const rule   = dark ? '#333'    : 'var(--paper-rule)'
  const card   = dark ? '#1e1e1e' : 'var(--paper-card)'
  const fillPolygon = accent + '30' // ~19% alpha

  // C at top, clockwise.
  const pos = (pc: number, r: number) => {
    const a = (pc / 12) * Math.PI * 2 - Math.PI / 2
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
  }

  // Build polygon vertices from active PCs, walking clockwise from C.
  // Respect "root always on" — filter by interval.
  const activePcs: number[] = []
  for (let pc = 0; pc < 12; pc++) {
    const interval = (pc - config.root + 12) % 12
    if (isActive(interval)) activePcs.push(pc)
  }
  const polygonD = activePcs.length > 1
    ? activePcs
        .map((pc, i) => {
          const p = pos(pc, MID_R)
          return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)
        })
        .join(' ') + ' Z'
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg
        width="100%"
        viewBox={`0 0 ${VB} ${VB}`}
        style={{ maxWidth: 220, overflow: 'visible', userSelect: 'none' }}
      >
        {/* guide rings */}
        <circle cx={C} cy={C} r={MID_R + 14} fill="none" stroke={rule} strokeWidth={0.5} strokeDasharray="2 3" />
        <circle cx={C} cy={C} r={MID_R}      fill="none" stroke={rule} strokeWidth={0.5} />
        <circle cx={C} cy={C} r={INNER_R}    fill="none" stroke={rule} strokeWidth={0.5} />

        {/* spokes */}
        {Array.from({ length: 12 }, (_, pc) => {
          const a = (pc / 12) * Math.PI * 2 - Math.PI / 2
          return (
            <line
              key={'sp' + pc}
              x1={C + INNER_R * Math.cos(a)} y1={C + INNER_R * Math.sin(a)}
              x2={C + (MID_R - 8) * Math.cos(a)} y2={C + (MID_R - 8) * Math.sin(a)}
              stroke={rule} strokeWidth={0.5}
            />
          )
        })}

        {/* scale polygon */}
        {polygonD && (
          <path
            d={polygonD}
            fill={fillPolygon}
            stroke={accent}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )}

        {/* PC nodes + labels — both share the same press gesture */}
        {Array.from({ length: 12 }, (_, pc) => (
          <WheelNode
            key={'w' + pc}
            pc={pc}
            interval={(pc - config.root + 12) % 12}
            isRoot={pc === config.root}
            active={isActive((pc - config.root + 12) % 12)}
            nodePos={pos(pc, MID_R)}
            labelPos={pos(pc, LABEL_R)}
            label={names[pc]}
            ink={ink}
            ink30={ink30}
            card={card}
            accent={accent}
            onTap={() => onTogglePc(pc)}
            onSetRoot={() => onSetRoot(pc)}
          />
        ))}

        {/* Center label — count of active PCs + root name */}
        <text x={C} y={C - 2} textAnchor="middle" style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 14,
          fill: ink,
        }}>
          {names[config.root]}
        </text>
        <text x={C} y={C + 11} textAnchor="middle" style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 8,
          letterSpacing: 1.2,
          fill: ink50,
          textTransform: 'uppercase',
        }}>
          {activePcs.length} notes
        </text>
      </svg>

      <div style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 10,
        color: ink50,
        textAlign: 'center',
        lineHeight: 1.5,
      }}>
        tap to toggle · double-tap or long-press to set root
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Wheel node — node circle + label, both wired to the shared
// press gesture so long-press works on touch where dblclick
// is unreliable.
// ──────────────────────────────────────────────────────────
interface WheelNodeProps {
  pc: number
  interval: number
  isRoot: boolean
  active: boolean
  nodePos: { x: number; y: number }
  labelPos: { x: number; y: number }
  label: string
  ink: string
  ink30: string
  card: string
  accent: string
  onTap: () => void
  onSetRoot: () => void
}

function WheelNode({
  isRoot, active, nodePos, labelPos, label, ink, ink30, card, accent, onTap, onSetRoot,
}: WheelNodeProps) {
  const press = usePressGesture(onTap, onSetRoot)
  return (
    <g style={{ cursor: 'pointer', touchAction: 'manipulation' }}>
      {/* Node group */}
      <g {...press}>
        {/* hit target (invisible, larger) */}
        <circle cx={nodePos.x} cy={nodePos.y} r={12} fill="transparent" />
        <circle
          cx={nodePos.x} cy={nodePos.y}
          r={active ? 7 : 5}
          fill={active ? ink : card}
          stroke={isRoot ? accent : ink}
          strokeWidth={isRoot ? 2 : 1}
        />
        {isRoot && (
          <circle
            cx={nodePos.x} cy={nodePos.y} r={12}
            fill="none" stroke={accent} strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}
      </g>
      {/* Label — sharing the same tap action keeps the gesture surface generous */}
      <text
        {...press}
        x={labelPos.x} y={labelPos.y}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 11,
          fill: active ? ink : ink30,
          cursor: 'pointer',
        }}
      >
        {label}
      </text>
    </g>
  )
}
