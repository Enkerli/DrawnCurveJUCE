import { PlaybackDirection } from '../engine/types'
import { type MidiPort } from '../midi/webMidi'

const SPEED_OPTIONS = [
  { label: '¼×', value: 0.25 },
  { label: '½×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
]

interface ToolbarProps {
  speedRatio: number
  direction: PlaybackDirection
  isPlaying: boolean
  theme: 'light' | 'dark'
  useFlats: boolean
  midiPorts: MidiPort[]
  midiEnabled: boolean
  selectedMidiPort: string | null
  midiSupported: boolean
  onSpeedChange: (speed: number) => void
  onDirectionChange: (dir: PlaybackDirection) => void
  onPlayPause: () => void
  onThemeToggle: () => void
  onAccidentalToggle: () => void
  onClearAll: () => void
  onPanic: () => void
  onRequestMidi: () => void
  onSelectMidiPort: (id: string | null) => void
}

export function Toolbar({
  speedRatio,
  direction,
  isPlaying,
  theme,
  useFlats,
  midiPorts,
  midiEnabled,
  selectedMidiPort,
  midiSupported,
  onSpeedChange,
  onDirectionChange,
  onPlayPause,
  onThemeToggle,
  onAccidentalToggle,
  onClearAll,
  onPanic,
  onRequestMidi,
  onSelectMidiPort,
}: ToolbarProps) {
  const dark = theme === 'dark'
  const accent = dark ? '#4a90e2' : 'var(--paper-amber)'

  const btnBase: React.CSSProperties = {
    padding: '5px 10px',
    borderRadius: 4,
    border: `1px solid ${dark ? '#444' : 'var(--paper-rule)'}`,
    background: 'transparent',
    color: dark ? '#ccc' : 'var(--paper-ink70)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'var(--font-sans)',
  }

  const activeBtnStyle = (active: boolean, accentOverride?: string): React.CSSProperties => {
    const a = accentOverride ?? accent
    return {
      ...btnBase,
      border: `1px solid ${active ? a : (dark ? '#444' : 'var(--paper-rule)')}`,
      background: active
        ? dark ? 'rgba(74,144,226,0.2)' : 'rgba(203,152,57,0.18)'
        : 'transparent',
      color: active ? a : (dark ? '#ccc' : 'var(--paper-ink70)'),
      fontWeight: active ? 700 : 500,
    }
  }

  const selectStyle: React.CSSProperties = {
    background: dark ? '#2a2a2a' : 'var(--paper-card)',
    color: dark ? '#e0e0e0' : 'var(--paper-ink)',
    border: `1px solid ${dark ? '#444' : 'var(--paper-rule)'}`,
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  }

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 24,
    background: dark ? '#333' : 'var(--paper-rule)',
    flexShrink: 0,
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderBottom: `1px solid ${dark ? '#2a2a2a' : 'var(--paper-rule)'}`,
        background: dark ? 'transparent' : 'var(--paper-card)',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      {/* Wordmark — Domine italic, v2 Studio */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 8,
          marginRight: 4,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 600,
            fontStyle: 'italic',
            fontSize: 22,
            letterSpacing: '-0.3px',
            color: dark ? '#e0e0e0' : 'var(--paper-ink)',
            lineHeight: 1,
          }}
        >
          DrawnQurve
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 9,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: dark ? '#666' : 'var(--paper-ink50)',
          }}
        >
          Studio
        </span>
      </span>

      <div style={dividerStyle} />

      {/* Speed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 13,
            color: dark ? '#999' : 'var(--paper-ink50)',
          }}
        >
          Speed
        </span>
        {SPEED_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onSpeedChange(opt.value)}
            style={activeBtnStyle(speedRatio === opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={dividerStyle} />

      {/* Direction */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 13,
            color: dark ? '#999' : 'var(--paper-ink50)',
          }}
        >
          Dir
        </span>
        <button
          onClick={() => onDirectionChange(PlaybackDirection.Reverse)}
          style={activeBtnStyle(direction === PlaybackDirection.Reverse)}
          title="Reverse"
        >
          ◀
        </button>
        <button
          onClick={() => onDirectionChange(PlaybackDirection.PingPong)}
          style={activeBtnStyle(direction === PlaybackDirection.PingPong)}
          title="Ping-Pong"
        >
          ↔
        </button>
        <button
          onClick={() => onDirectionChange(PlaybackDirection.Forward)}
          style={activeBtnStyle(direction === PlaybackDirection.Forward)}
          title="Forward"
        >
          ▶
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Play / Pause */}
      <button
        onClick={onPlayPause}
        style={activeBtnStyle(!isPlaying, '#e0593a')}
        title={isPlaying ? 'Pause' : 'Resume'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div style={dividerStyle} />

      {/* Clear + Panic */}
      <button onClick={onClearAll} style={btnBase}>
        Clear All
      </button>
      <button
        onClick={onPanic}
        style={{ ...btnBase, color: '#c45f43', borderColor: dark ? '#444' : 'var(--paper-rule)' }}
        title="All Notes Off"
      >
        Panic
      </button>

      <div style={{ flex: 1 }} />

      {/* MIDI output */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!midiSupported ? (
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 12,
              color: '#c45f43',
            }}
            title="Web MIDI requires Chrome, Edge, or Opera"
          >
            No Web MIDI (use Chrome)
          </span>
        ) : !midiEnabled ? (
          <button onClick={onRequestMidi} style={btnBase}>
            🎹 Enable MIDI
          </button>
        ) : (
          <>
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 13,
                color: dark ? '#999' : 'var(--paper-ink50)',
              }}
            >
              MIDI Out
            </span>
            <select
              value={selectedMidiPort ?? ''}
              onChange={e => onSelectMidiPort(e.target.value || null)}
              style={selectStyle}
            >
              <option value="">— None —</option>
              {midiPorts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        )}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: selectedMidiPort ? '#5b8a64' : (dark ? '#333' : 'var(--paper-rule)'),
            flexShrink: 0,
          }}
        />
      </div>

      <div style={dividerStyle} />

      {/* Accidentals (♯/♭) */}
      <button
        onClick={onAccidentalToggle}
        style={{
          ...btnBase,
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 14,
          padding: '3px 9px',
          minWidth: 30,
          justifyContent: 'center',
        }}
        title={useFlats ? 'Flats — tap to switch to sharps' : 'Sharps — tap to switch to flats'}
      >
        {useFlats ? '♭' : '♯'}
      </button>

      {/* Theme toggle */}
      <button onClick={onThemeToggle} style={btnBase} title="Toggle theme">
        {dark ? '☀︎' : '☾'}
      </button>
    </div>
  )
}
