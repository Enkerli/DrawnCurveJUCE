// QurveShelf.tsx — horizontally-scrolling saved-curve library.
//
// Cards show a miniature SVG curve preview and a name.  Clicking a card
// applies that curve (and optionally its grid settings) to the focused lane.
// "Save +" captures the focused lane's current curve into localStorage.
//
// Persisted model (localStorage key: 'drawnqurve.shelf'):
//   SavedQurve { id, name, table: number[], messageType,
//                minOut, maxOut, smoothing,
//                xDivisions, yDivisions, xQuantize, yQuantize }
//
// Steps 5+8 of the webapp port plan.

import { useState, useCallback } from 'react'
import type { LaneSnapshot, LaneParams } from '../engine/types'
import { MessageType } from '../engine/types'
import { LANE_COLORS_DARK, LANE_COLORS_LIGHT, LANE_DASH } from './CurveCanvas'

// ── Saved model ───────────────────────────────────────────────────────────────

export interface SavedQurve {
  id: string
  name: string
  /** 256 normalised samples serialised as a plain number[] for JSON. */
  table: number[]
  messageType: MessageType
  minOut: number
  maxOut: number
  smoothing: number
  xDivisions: number
  yDivisions: number
  xQuantize: boolean
  yQuantize: boolean
}

const STORAGE_KEY = 'drawnqurve.shelf'

function loadShelf(): SavedQurve[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedQurve[]) : []
  } catch {
    return []
  }
}

function saveShelf(items: SavedQurve[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch { /* quota exceeded — silently ignore */ }
}

function msgLabel(t: MessageType): string {
  switch (t) {
    case MessageType.CC:              return 'CC'
    case MessageType.ChannelPressure: return 'AT'
    case MessageType.PitchBend:       return 'PB'
    case MessageType.Note:            return '♩'
    default:                          return '?'
  }
}

// ── Miniature SVG curve path ──────────────────────────────────────────────────

function MiniCurvePath({ table, w, h, color, dash }: {
  table: number[]
  w: number
  h: number
  color: string
  dash: number[]
}) {
  const n = table.length
  if (n < 2) return null
  const PAD = 3
  const pw  = w - PAD * 2
  const ph  = h - PAD * 2
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = PAD + (i / (n - 1)) * pw
    const y = PAD + (1 - table[i]) * ph
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1)
  }
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap={dash.length === 0 ? 'round' : 'butt'}
      strokeLinejoin="round"
      strokeDasharray={dash.join(' ') || undefined}
      opacity={0.8}
    />
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface QurveShelfProps {
  snapshot: LaneSnapshot | null
  laneParams: LaneParams
  focusedLane: number
  theme: 'light' | 'dark'
  onApply: (lane: number, saved: SavedQurve) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QurveShelf({ snapshot, focusedLane, theme, onApply }: QurveShelfProps) {
  const dark = theme === 'dark'
  const [items, setItems] = useState<SavedQurve[]>(loadShelf)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const laneColors = dark ? LANE_COLORS_DARK : LANE_COLORS_LIGHT
  const color      = laneColors[focusedLane]

  // ── Mutations ────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!snapshot?.valid) return
    const name = `curve ${items.length + 1}`
    const entry: SavedQurve = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      table: Array.from(snapshot.table),
      messageType: snapshot.messageType,
      minOut: snapshot.minOut,
      maxOut: snapshot.maxOut,
      smoothing: snapshot.smoothing,
      xDivisions: snapshot.xDivisions,
      yDivisions: snapshot.yDivisions,
      xQuantize: snapshot.xQuantize,
      yQuantize: snapshot.yQuantize,
    }
    const next = [...items, entry]
    setItems(next)
    saveShelf(next)
    // Auto-enter rename on new card
    setRenamingId(entry.id)
    setRenameValue(name)
  }, [snapshot, items])

  const handleDelete = useCallback((id: string) => {
    const next = items.filter(q => q.id !== id)
    setItems(next)
    saveShelf(next)
  }, [items])

  const commitRename = useCallback(() => {
    if (!renamingId) return
    const next = items.map(q => q.id === renamingId ? { ...q, name: renameValue.trim() || q.name } : q)
    setItems(next)
    saveShelf(next)
    setRenamingId(null)
  }, [renamingId, renameValue, items])

  // ── Styles ────────────────────────────────────────────────────────────────

  const ruleColor = dark ? '#2a2a2a' : 'var(--paper-rule)'
  const bgColor   = dark ? '#111'    : 'var(--paper-card)'
  const ink50     = dark ? 'rgba(255,255,255,0.4)' : 'var(--paper-ink50)'
  const ink70     = dark ? 'rgba(255,255,255,0.6)' : 'var(--paper-ink70)'

  const CARD_W = 104
  const CARD_H = 88
  const SVG_H  = 52

  return (
    <div style={{
      borderTop: `1px solid ${ruleColor}`,
      background: bgColor,
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      flexShrink: 0,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
          fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
          color: ink50,
        }}>
          Qurve Library
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSave}
          disabled={!snapshot?.valid}
          title={snapshot?.valid ? 'Save current curve' : 'Draw a curve first'}
          style={{
            padding: '3px 10px',
            height: 24,
            borderRadius: 3,
            border: `1px solid ${snapshot?.valid ? color : ruleColor}`,
            background: 'transparent',
            color: snapshot?.valid ? color : ink50,
            cursor: snapshot?.valid ? 'pointer' : 'default',
            fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
            fontSize: 11,
            letterSpacing: 0.3,
            opacity: snapshot?.valid ? 1 : 0.5,
          }}
        >
          Save +
        </button>
      </div>

      {/* Scrollable card row */}
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 4,
        scrollbarWidth: 'thin',
      }}>
        {items.length === 0 && (
          <div style={{
            width: CARD_W, height: CARD_H,
            border: `1px dashed ${ruleColor}`,
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontStyle: 'italic',
            fontSize: 13,
            color: ink50,
          }}>
            empty
          </div>
        )}

        {items.map(q => {
          const isRenaming = renamingId === q.id
          const cardColor  = color  // use focused-lane colour for all previews

          return (
            <div
              key={q.id}
              style={{
                flexShrink: 0,
                width: CARD_W,
                height: CARD_H,
                border: `1px solid ${ruleColor}`,
                borderRadius: 4,
                background: dark ? '#1a1a1a' : 'var(--paper-bg)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                cursor: 'pointer',
                position: 'relative',
              }}
              onClick={() => { if (!isRenaming) onApply(focusedLane, q) }}
            >
              {/* Mini curve SVG */}
              <svg width={CARD_W} height={SVG_H} style={{ flexShrink: 0, display: 'block' }}>
                <MiniCurvePath
                  table={q.table}
                  w={CARD_W}
                  h={SVG_H}
                  color={cardColor}
                  dash={LANE_DASH[focusedLane]}
                />
              </svg>

              {/* Card footer */}
              <div style={{ padding: '3px 6px 4px', display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%',
                      fontSize: 11,
                      fontFamily: '"Instrument Serif", Georgia, serif',
                      fontStyle: 'italic',
                      border: `1px solid ${color}`,
                      borderRadius: 2,
                      background: 'transparent',
                      color: dark ? '#e0e0e0' : 'var(--paper-ink)',
                      padding: '1px 3px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      fontFamily: '"Instrument Serif", Georgia, serif',
                      fontStyle: 'italic',
                      fontSize: 12,
                      color: dark ? '#ddd' : 'var(--paper-ink)',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation()
                      setRenamingId(q.id)
                      setRenameValue(q.name)
                    }}
                    title="Double-click to rename"
                  >
                    {q.name}
                  </div>
                )}
                <div style={{
                  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
                  fontSize: 9, letterSpacing: 0.8,
                  color: ink70, textTransform: 'uppercase',
                }}>
                  {msgLabel(q.messageType)}
                </div>
              </div>

              {/* Delete button — visible on hover via opacity transition */}
              <button
                onClick={e => { e.stopPropagation(); handleDelete(q.id) }}
                title="Remove from shelf"
                style={{
                  position: 'absolute', top: 3, right: 3,
                  width: 16, height: 16,
                  border: 'none',
                  borderRadius: 2,
                  background: dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
                  color: dark ? '#888' : 'var(--paper-ink50)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
