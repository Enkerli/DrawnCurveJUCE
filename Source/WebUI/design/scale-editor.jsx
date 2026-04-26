// Scale editors — v1 piano-row style (safe), v2 chromatic wheel (bold).
// Both toggle pitch classes in a lane's scaleMask.

// ──────────────────────────────────────────────────────────
// v1: Piano-row — 5 black / 7 white layout (established idiom)
// ──────────────────────────────────────────────────────────
function PianoScaleRow({ lane, updateLane, paper = window.PAPER }) {
  const { scaleMask, scaleRoot, scaleId } = lane;

  const white = [0, 2, 4, 5, 7, 9, 11];
  const black = [1, 3, 6, 8, 10];

  // Mask is interval-based (see ChromaticWheel) — convert pc → rel before
  // any pcActive/togglePc lookup so the row transposes with scaleRoot.
  const relOf = (pc) => ((pc - scaleRoot) % 12 + 12) % 12;

  const Key = ({ pc, kind }) => {
    const active = !!pcActive(scaleMask, relOf(pc));
    const isRoot = pc === scaleRoot;
    const bg = kind === 'white'
      ? (active ? paper.card : 'oklch(92% 0.015 75)')
      : (active ? paper.ink : 'oklch(40% 0.008 60)');
    const fg = kind === 'white' ? paper.ink : 'oklch(92% 0.012 80)';
    return (
      <div
        onClick={() => updateLane(lane.id, {
          scaleMask: togglePc(scaleMask, relOf(pc)),
          scaleId: 'custom',
        })}
        onDoubleClick={() => updateLane(lane.id, { scaleRoot: pc })}
        style={{
          width: kind === 'white' ? 42 : 28,
          height: kind === 'white' ? 82 : 54,
          background: bg,
          border: `1px solid ${paper.ink}`,
          borderRadius: 3,
          color: active ? fg : 'transparent',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 6,
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 16, fontStyle: 'italic',
          cursor: 'pointer',
          position: kind === 'black' ? 'absolute' : 'relative',
          boxSizing: 'border-box',
          boxShadow: active ? 'inset 0 -2px 0 rgba(0,0,0,0.1)' : 'none',
          transition: 'background 120ms',
        }}
      >
        {active && <>
          {PITCH_SHORT[pc]}
          {isRoot && (
            <div style={{
              position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
              width: 6, height: 6, borderRadius: '50%',
              background: paper.amberInk,
            }} />
          )}
        </>}
      </div>
    );
  };

  // black key offsets relative to white keys — 5 blacks within 7 whites
  const blackOffsets = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {SCALES.map(s => (
          <button
            key={s.id}
            onClick={() => updateLane(lane.id, { scaleId: s.id, scaleMask: s.mask })}
            style={{
              padding: '4px 10px', borderRadius: 2,
              border: `1px solid ${scaleId === s.id ? paper.ink : paper.rule}`,
              background: scaleId === s.id ? paper.ink : 'transparent',
              color: scaleId === s.id ? paper.bg : paper.ink70,
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 14, fontStyle: 'italic',
              cursor: 'pointer',
            }}
          >{s.name}</button>
        ))}
      </div>

      <div style={{ position: 'relative', width: 42 * 7, height: 82 }}>
        {white.map((pc, i) => (
          <div key={pc} style={{ position: 'absolute', left: i * 42, top: 0 }}>
            <Key pc={pc} kind="white" />
          </div>
        ))}
        {black.map(pc => (
          <div key={pc} style={{
            position: 'absolute',
            left: blackOffsets[pc] * 42 + 42 - 14,
            top: 0, zIndex: 2,
          }}>
            <Key pc={pc} kind="black" />
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: 10, alignItems: 'baseline',
        fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
        fontSize: 11, color: paper.ink50, letterSpacing: 0.2,
      }}>
        <span>double-tap a key → set root</span>
        <span>•</span>
        <span>tap → toggle</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// v2: Chromatic wheel — 12 pitch classes around a circle.
//
// CRITICAL: scaleMask is INTERVAL-based (bit i = interval i semitones from
// root).  The audio engine resolves a chromatic pc → interval via
// rel = (pc - scaleRoot) % 12 before looking up pcActive(mask, rel).
// The wheel must do the same conversion or it will display inactive notes
// as active (and vice versa) whenever scaleRoot ≠ 0.  The previous version
// of this widget didn't, which broke transposition: changing the root
// shifted nothing on screen even though the audio output really had moved.
// ──────────────────────────────────────────────────────────
function ChromaticWheel({ lane, updateLane, paper = window.PAPER, size = 240 }) {
  const { scaleMask, scaleRoot, scaleId } = lane;
  const r = size / 2;
  const inner = r * 0.45;
  const mid   = r * 0.72;

  const pcs = Array.from({ length: 12 }, (_, i) => i);
  const pos = (pc, rad) => {
    // C at top, clockwise
    const a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: r + rad * Math.cos(a), y: r + rad * Math.sin(a) };
  };

  // Convert an absolute pitch class to its interval relative to the current root.
  const relOf = (pc) => ((pc - scaleRoot) % 12 + 12) % 12;
  const isActive = (pc) => !!pcActive(scaleMask, relOf(pc));

  // Long-press alternative for setting root (helpful on touch devices where
  // double-tap is awkward).
  const longPressRef = React.useRef(null);
  const startLongPress = (pc) => {
    longPressRef.current = setTimeout(() => {
      updateLane(lane.id, { scaleRoot: pc });
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };

  // "Bracelet polygon" — connect every active pitch class in chromatic order.
  // Active is computed in interval space (so the polygon transposes with the
  // root), but drawn at the absolute pc position on the wheel — which is what
  // makes the geometry visibly rotate when the user picks a new root.
  const activePcs = pcs.filter(isActive);
  const shapePath = activePcs.length > 1
    ? activePcs.map((pc, i) => {
        const p = pos(pc, mid);
        return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
      }).join(' ') + ' Z'
    : null;

  // Family-grouped scale picker (Diatonic / Pentatonic / Symmetric / Harmonic).
  const families = ['Diatonic', 'Pentatonic', 'Symmetric', 'Harmonic'];
  const currentScale = SCALES.find(s => s.id === scaleId);
  const [selectedFamily, setSelectedFamily] = React.useState(
    () => currentScale?.family || 'Diatonic');
  const familyScales = SCALES.filter(s => s.family === selectedFamily);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <svg width={size} height={size} style={{ flexShrink: 0, overflow: 'visible' }}>
        {/* outer ruled circle */}
        <circle cx={r} cy={r} r={r - 4} fill="none" stroke={paper.rule} strokeWidth={0.5} strokeDasharray="2 3" />
        <circle cx={r} cy={r} r={mid} fill="none" stroke={paper.ruleFaint} strokeWidth={0.5} />
        <circle cx={r} cy={r} r={inner} fill="none" stroke={paper.ruleFaint} strokeWidth={0.5} />

        {/* spoke lines */}
        {pcs.map(pc => {
          const a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
          return (
            <line key={pc}
              x1={r + inner * Math.cos(a)} y1={r + inner * Math.sin(a)}
              x2={r + (r - 18) * Math.cos(a)} y2={r + (r - 18) * Math.sin(a)}
              stroke={paper.ruleFaint} strokeWidth={0.5}
            />
          );
        })}

        {/* scale shape polygon */}
        {shapePath && (
          <path d={shapePath}
            fill={'rgba(196,135,58,0.18)'}
            stroke={paper.amberInk} strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )}

        {/* pitch nodes — tap toggles, double-tap or long-press sets root */}
        {pcs.map(pc => {
          const p = pos(pc, mid);
          const active = isActive(pc);
          const isRoot = pc === scaleRoot;
          return (
            <g key={pc}
               onClick={() => updateLane(lane.id, {
                 scaleMask: togglePc(scaleMask, relOf(pc)),
                 scaleId: 'custom',
               })}
               onDoubleClick={() => updateLane(lane.id, { scaleRoot: pc })}
               onPointerDown={(e) => { e.stopPropagation(); startLongPress(pc); }}
               onPointerUp={cancelLongPress}
               onPointerLeave={cancelLongPress}
               style={{ cursor: 'pointer' }}
            >
              <circle cx={p.x} cy={p.y} r={active ? 12 : 8}
                fill={active ? paper.ink : paper.card}
                stroke={isRoot ? paper.amberInk : paper.ink}
                strokeWidth={isRoot ? 2.5 : 1}
              />
              {isRoot && (
                <circle cx={p.x} cy={p.y} r={active ? 18 : 14}
                  fill="none" stroke={paper.amberInk} strokeWidth={1}
                  strokeDasharray="2 2"
                />
              )}
            </g>
          );
        })}

        {/* pitch labels */}
        {pcs.map(pc => {
          const p = pos(pc, r - 8);
          const active = isActive(pc);
          return (
            <text key={'t' + pc}
              x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 14, fontStyle: 'italic',
                fill: active ? paper.ink : paper.ink30,
              }}
            >{PITCH_SHORT[pc]}</text>
          );
        })}

        {/* center label — scale name + root */}
        <text x={r} y={r - 4} textAnchor="middle" style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 16, fontStyle: 'italic', fill: paper.ink,
        }}>{(SCALES.find(s => s.id === scaleId) || { name: 'Custom' }).name}</text>
        <text x={r} y={r + 12} textAnchor="middle" style={{
          fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
          fontSize: 10, fill: paper.ink50, letterSpacing: 1.2,
        }}>{PITCH_SHORT[scaleRoot]} ROOT</text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {/* family selector */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {families.map(f => (
            <button key={f}
              onClick={() => setSelectedFamily(f)}
              style={{
                padding: '4px 10px', borderRadius: 2,
                border: `1px solid ${selectedFamily === f ? paper.ink : paper.rule}`,
                background: selectedFamily === f ? paper.ink : 'transparent',
                color: selectedFamily === f ? paper.bg : paper.ink50,
                fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1,
                textTransform: 'uppercase', cursor: 'pointer',
              }}>{f}</button>
          ))}
        </div>

        {/* scales in selected family */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {familyScales.map(s => (
            <button key={s.id}
              onClick={() => updateLane(lane.id, { scaleId: s.id, scaleMask: s.mask })}
              style={{
                padding: '5px 10px', borderRadius: 2,
                border: `1px solid ${scaleId === s.id ? paper.amberInk : paper.rule}`,
                background: scaleId === s.id ? paper.amberInk : 'transparent',
                color: scaleId === s.id ? paper.bg : paper.ink70,
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 15, fontStyle: 'italic',
                cursor: 'pointer', textAlign: 'left',
              }}>{s.name}</button>
          ))}
        </div>

        <div style={{
          marginTop: 4, fontSize: 10, fontFamily: 'Inter Tight',
          color: paper.ink50, lineHeight: 1.5,
        }}>
          tap to toggle pitch·<br/>
          double-tap or hold to set root·<br/>
          shape shows interval geometry
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PianoScaleRow, ChromaticWheel });
