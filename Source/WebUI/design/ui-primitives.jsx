// Shared UI primitives — sketchbook-styled buttons, sliders, dial, range slider, playback segmented control.

function Btn({ active, onClick, children, style = {}, small, paper = window.PAPER, tone }) {
  const ink = tone === 'active' ? paper.amberInk : paper.ink;
  return (
    <button onClick={onClick} style={{
      padding: small ? '3px 8px' : '6px 12px',
      borderRadius: 2,
      border: `1px solid ${active ? ink : paper.rule}`,
      background: active ? (tone === 'active' ? 'oklch(90% 0.08 65)' : paper.ink) : 'transparent',
      color: active ? (tone === 'active' ? ink : paper.bg) : paper.ink70,
      fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
      fontSize: small ? 11 : 13,
      fontWeight: 500,
      cursor: 'pointer',
      letterSpacing: 0.1,
      whiteSpace: 'nowrap',
      transition: 'background 120ms, color 120ms',
      ...style,
    }}>{children}</button>
  );
}

function IconBtn({ active, onClick, children, size = 32, paper = window.PAPER, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: size, height: size, borderRadius: 2,
      border: `1px solid ${active ? paper.ink : paper.rule}`,
      background: active ? paper.ink : 'transparent',
      color: active ? paper.bg : paper.ink70,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', padding: 0,
    }}>{children}</button>
  );
}

// Slider — horizontal, drawn feel
// Slider — visual stays compact (12 px thumb on a 2 px track), but the
// container is 44 px tall so the touch hit area meets the iOS minimum
// (audit F-03).  The whole strip is draggable, so the user only needs to
// land within 22 px above/below the track centre, not on the thumb itself.
function Slider({ value, min = 0, max = 1, step = 0.01, onChange, width = 140, paper = window.PAPER, accent }) {
  const ref = React.useRef(null);
  const [drag, setDrag] = React.useState(false);
  const set = (e) => {
    const r = ref.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = min + f * (max - min);
    const snapped = Math.round(v / step) * step;
    onChange(snapped);
  };
  const thumbX = ((value - min) / (max - min)) * width;
  const H = 44;                    // touch height
  const trackY = (H - 2) / 2;      // centre the 2 px track vertically
  const thumbY = (H - 12) / 2;     // centre the 12 px thumb vertically
  return (
    <div
      ref={ref}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); set(e); }}
      onPointerMove={(e) => { if (drag) set(e); }}
      onPointerUp={() => setDrag(false)}
      style={{
        width, height: H, position: 'relative',
        cursor: 'pointer', touchAction: 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: trackY, left: 0, right: 0, height: 2,
        background: paper.rule, borderRadius: 1,
      }} />
      <div style={{
        position: 'absolute', top: trackY, left: 0, width: thumbX, height: 2,
        background: accent || paper.ink, borderRadius: 1,
      }} />
      <div style={{
        position: 'absolute', top: thumbY, left: thumbX - 6, width: 12, height: 12,
        borderRadius: '50%', background: paper.card,
        border: `1.5px solid ${accent || paper.ink}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        pointerEvents: 'none',     // parent owns the gesture
      }} />
    </div>
  );
}

// Dual-thumb range — middle drag shifts both (transpose).
// Audit F-03: visible thumbs are 12 px circles, but each thumb is wrapped in
// a 22 × 44 px transparent hit-area square so the touch target meets the
// iOS minimum.  The mid-drag fill is the full 44 px height for the same
// reason (transpose gesture lands anywhere inside the band, not just on the
// 10 px stripe).
function RangeSlider({ min, max, lo, hi, onChange, width = 140, paper = window.PAPER, accent }) {
  const ref = React.useRef(null);
  const dragging = React.useRef(null); // 'lo' | 'hi' | 'mid'
  const midStart = React.useRef(null); // { x, lo, hi } at start of mid-drag

  const getVal = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.max(min, Math.min(max, min + ((e.clientX - r.left) / r.width) * (max - min)));
  };

  const onDownLo = (e) => { e.preventDefault(); e.stopPropagation(); ref.current.setPointerCapture(e.pointerId); dragging.current = 'lo'; };
  const onDownHi = (e) => { e.preventDefault(); e.stopPropagation(); ref.current.setPointerCapture(e.pointerId); dragging.current = 'hi'; };
  const onDownMid = (e) => {
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    dragging.current = 'mid';
    const r = ref.current.getBoundingClientRect();
    midStart.current = { x: e.clientX, lo, hi };
  };

  const onMove = (e) => {
    if (!dragging.current) return;
    if (dragging.current === 'lo') {
      onChange({ lo: Math.min(getVal(e), hi - 0.01), hi });
    } else if (dragging.current === 'hi') {
      onChange({ lo, hi: Math.max(getVal(e), lo + 0.01) });
    } else if (dragging.current === 'mid' && midStart.current) {
      const r = ref.current.getBoundingClientRect();
      const dx = (e.clientX - midStart.current.x) / r.width * (max - min);
      let newLo = midStart.current.lo + dx;
      let newHi = midStart.current.hi + dx;
      // Hit left wall → lo clamps, hi keeps moving (compresses from right)
      if (newLo < min) { newLo = min; newHi = Math.max(min + 0.01, midStart.current.hi + dx); }
      // Hit right wall → hi clamps, lo keeps moving (compresses from left)
      if (newHi > max) { newHi = max; newLo = Math.min(max - 0.01, midStart.current.lo + dx); }
      onChange({ lo: Math.max(min, newLo), hi: Math.min(max, newHi) });
    }
  };

  const loX = ((lo - min) / (max - min)) * width;
  const hiX = ((hi - min) / (max - min)) * width;

  const H = 44;
  const trackY = (H - 2) / 2;
  return (
    <div ref={ref}
      onPointerMove={onMove}
      onPointerUp={() => { dragging.current = null; midStart.current = null; }}
      onPointerCancel={() => { dragging.current = null; midStart.current = null; }}
      style={{ width, height: H, position: 'relative', touchAction: 'none' }}
    >
      {/* Track */}
      <div style={{
        position: 'absolute', top: trackY, left: 0, right: 0, height: 2,
        background: paper.rule, pointerEvents: 'none',
      }} />
      {/* Active fill — draggable middle, full-height hit area for transpose */}
      <div
        onPointerDown={onDownMid}
        style={{
          position: 'absolute', top: 0, left: loX, width: hiX - loX, height: H,
          cursor: 'ew-resize',
        }}
      >
        {/* The 10 px visible band, centred vertically */}
        <div style={{
          position: 'absolute', top: (H - 10) / 2, left: 0, right: 0, height: 10,
          background: accent || paper.ink, opacity: 0.25, borderRadius: 1,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: trackY, left: 0, right: 0, height: 2,
          background: accent || paper.ink, pointerEvents: 'none',
        }} />
      </div>
      {/* Thumbs — 22 × 44 hit area centred on x; visible 12 px circle inside */}
      <ThumbHit x={loX} onPointerDown={onDownLo} H={H} color={accent || paper.ink} paper={paper} />
      <ThumbHit x={hiX} onPointerDown={onDownHi} H={H} color={accent || paper.ink} paper={paper} />
    </div>
  );
}
function ThumbHit({ x, onPointerDown, H, color, paper }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute', top: 0, left: x - 11, width: 22, height: H,
        cursor: 'grab', touchAction: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
      }}>
      <div style={{
        width: 12, height: 12, borderRadius: '50%', background: paper.card,
        border: `1.5px solid ${color}`, pointerEvents: 'none',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }} />
    </div>
  );
}

// Drawn rotary dial — sketchbook feel
// `defaultValue` enables double-tap-to-reset (audit F-04).  Falls back to the
// midpoint between min and max if the caller doesn't pass one — matches the
// "centred dial" intuition users expect from analogue knobs.
function DrawnDial({ value, min = 0, max = 1, defaultValue, onChange, size = 56, label, sublabel, paper = window.PAPER }) {
  const f = (value - min) / (max - min);
  const a = -135 + f * 270;
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  const tipAngle = a * Math.PI / 180;
  const tipX = cx + r * Math.cos(tipAngle - Math.PI / 2);
  const tipY = cy + r * Math.sin(tipAngle - Math.PI / 2);
  const drag = React.useRef(null);
  // Track the previous tap timestamp for a manual double-tap detection.
  // Native `onDoubleClick` fires after a 300 ms delay on touch devices and
  // doesn't always survive the pointerdown→pointerup capture pattern, so
  // we time the gap between consecutive non-drag pointerups instead.
  const lastTap = React.useRef(0);
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value, moved: false };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    if (Math.abs(dy) > 2) drag.current.moved = true;
    const nv = Math.max(min, Math.min(max, drag.current.v + (dy / 120) * (max - min)));
    onChange(nv);
  };
  const onUp = () => {
    const wasDrag = drag.current && drag.current.moved;
    drag.current = null;
    if (wasDrag) { lastTap.current = 0; return; }
    // Pure tap (no drag) — check for a double-tap within 300 ms.
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const dv = defaultValue != null ? defaultValue : (min + max) / 2;
      onChange(Math.max(min, Math.min(max, dv)));
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };
  // arc path for full range
  const toXY = (ang) => {
    const rad = ang * Math.PI / 180 - Math.PI / 2;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(-135);
  const [ex, ey] = toXY(135);
  const [px, py] = toXY(a);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <svg
        width={size} height={size}
        onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}
        style={{ cursor: 'ns-resize', touchAction: 'none' }}
      >
        {/* full track */}
        <path d={`M${sx},${sy} A${r},${r} 0 1 1 ${ex},${ey}`}
          fill="none" stroke={paper.rule} strokeWidth={1.5} strokeLinecap="round"
          strokeDasharray="1 3"
        />
        {/* filled arc */}
        <path d={`M${sx},${sy} A${r},${r} 0 ${f > 0.5 ? 1 : 0} 1 ${px},${py}`}
          fill="none" stroke={paper.ink} strokeWidth={2} strokeLinecap="round"
        />
        {/* dial tip */}
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke={paper.ink} strokeWidth={1.8} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2.5} fill={paper.ink} />
      </svg>
      {label && (
        <div style={{
          fontFamily: 'Inter Tight', fontSize: 10, color: paper.ink50,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>{label}</div>
      )}
      {sublabel !== undefined && (
        <div style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 14, fontStyle: 'italic', color: paper.ink,
        }}>{sublabel}</div>
      )}
    </div>
  );
}

// Logarithmic slider — equal pixel distance = equal ratio change, so 0.5× and
// 2× are symmetric around 1× (the geometric centre of the track).
//
// ticks : [{ value, label? }] — hairline marks + optional label below the track.
//         label='' draws the tick mark with no text.
// snapTo: number[] — values the thumb locks to when released within SNAP_PX
//         pixels.  Both pure clicks and drag-releases can snap.
//
// Architecture — why local display state + commit only on pointer-up:
//   onChange on every pointer-move triggers updateLane → sendParam → JUCE
//   echoes the new value back → React state update overrides the current drag
//   position with whatever JUCE last received (always one frame behind).
//   Fix: maintain localValue during the gesture.  onChange fires ONCE on
//   pointer-up (commit).  JUCE receives no intermediate values so there are no
//   echoes to fight mid-drag, and the thumb never rubber-bands.
//
//   Corollary: do NOT call onChange on pointer-down.  Even for a pure click
//   (no move), firing sendParam eagerly and then setLocalValue(null) on
//   pointer-up causes a frame where displayValue = value (old prop) while the
//   JUCE echo hasn't arrived yet, producing a visible snap-back.
function LogSlider({
  value, min, max, onChange,
  ticks = [], snapTo = [],
  width = 140, paper = window.PAPER, accent,
}) {
  const ref      = React.useRef(null);
  const isDrag   = React.useRef(false);
  // Local display value — non-null while the pointer is held down.
  // Using state (not just a ref) so the thumb re-renders on every pointer-move.
  const [localValue, setLocalValue] = React.useState(null);
  // Ref copy so pointer-up can read the latest value without a stale closure.
  const latestLocal = React.useRef(null);

  const SNAP_PX = 8;   // snap radius in pixels — wide enough for imprecise touch

  const logMin  = Math.log(min);
  const logSpan = Math.log(max) - logMin;

  const toFrac   = (v) => (Math.log(Math.max(min, Math.min(max, v))) - logMin) / logSpan;
  const fromFrac = (f)  => Math.exp(logMin + Math.max(0, Math.min(1, f)) * logSpan);

  const calcValue = (e) => {
    const r = ref.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    let v = fromFrac(f);
    // Snap to nearest snap point if within SNAP_PX pixels.
    for (const s of snapTo)
      if (Math.abs((toFrac(s) - f) * r.width) < SNAP_PX) { v = s; break; }
    return v;
  };

  const H      = 44;
  const TICK_H = ticks.length ? 18 : 0;
  const trackY = (H - 2) / 2;
  const thumbY = (H - 12) / 2;

  // During gesture use localValue; otherwise follow the prop (committed JUCE state).
  const displayValue = localValue !== null ? localValue : value;
  const thumbX = toFrac(displayValue) * width;

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        isDrag.current = true;
        const v = calcValue(e);
        latestLocal.current = v;
        setLocalValue(v);
        // Do NOT call onChange here.  Calling sendParam eagerly and then
        // clearing localValue on pointer-up causes a race with the JUCE echo
        // that snaps the thumb back to the old value for one frame.
        // All commits happen in onPointerUp / onPointerCancel.
      }}
      onPointerMove={(e) => {
        if (!isDrag.current) return;
        const v = calcValue(e);
        latestLocal.current = v;
        setLocalValue(v);               // visual update only — no onChange
      }}
      onPointerUp={() => {
        isDrag.current = false;
        if (latestLocal.current !== null)
          onChange(latestLocal.current); // single commit — click or drag
        latestLocal.current = null;
        setLocalValue(null);             // hand display back to prop
      }}
      onPointerCancel={() => {
        isDrag.current = false;
        latestLocal.current = null;
        setLocalValue(null);             // abort — discard, do not commit
      }}
      style={{ width, flexShrink: 0, height: H + TICK_H, position: 'relative', cursor: 'pointer', touchAction: 'none' }}
    >
      <div style={{ position: 'absolute', top: trackY, left: 0, right: 0, height: 2,
                    background: paper.rule, borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: trackY, left: 0, width: thumbX, height: 2,
                    background: accent || paper.ink, borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: thumbY, left: thumbX - 6, width: 12, height: 12,
                    borderRadius: '50%', background: paper.card,
                    border: `1.5px solid ${accent || paper.ink}`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.10)', pointerEvents: 'none' }} />
      {ticks.map(({ value: tv, label }) => {
        const tx = toFrac(tv) * width;
        return (
          <React.Fragment key={tv}>
            <div style={{ position: 'absolute', top: trackY + 5, left: tx,
                          width: 1, height: 5, background: paper.ink30,
                          transform: 'translateX(-0.5px)' }} />
            {label !== undefined && label !== '' && (
              <div style={{ position: 'absolute', top: trackY + 12, left: tx,
                            transform: 'translateX(-50%)',
                            fontSize: 8, fontFamily: 'Inter Tight, Inter, sans-serif',
                            letterSpacing: 0.2, color: paper.ink50,
                            whiteSpace: 'nowrap', userSelect: 'none' }}>{label}</div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Playback segmented control — direction + transport overlay badge
function PlaybackControl({ direction, setDirection, playing, setPlaying, paper = window.PAPER }) {
  const segs = [
    { id: 'rev', label: <svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L4 8l6 5V3z" fill="currentColor"/></svg>, title: 'Reverse' },
    { id: 'pp',  label: <svg width="20" height="16" viewBox="0 0 20 16"><path d="M6 3L2 8l4 5V3zm8 0v10l4-5-4-5z" fill="currentColor"/></svg>, title: 'Ping-Pong' },
    { id: 'fwd', label: <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l6 5-6 5V3z" fill="currentColor"/></svg>, title: 'Forward' },
  ];
  return (
    <div style={{
      display: 'inline-flex', border: `1px solid ${paper.ink}`, borderRadius: 2,
      overflow: 'hidden', background: paper.card,
    }}>
      {segs.map((s, i) => {
        const active = direction === s.id;
        return (
          <button key={s.id}
            onClick={() => { if (active) setPlaying(!playing); else setDirection(s.id); }}
            title={s.title}
            style={{
              border: 'none',
              borderLeft: i > 0 ? `1px solid ${paper.ink}` : 'none',
              background: active ? paper.ink : 'transparent',
              color: active ? paper.bg : paper.ink70,
              padding: '6px 10px', cursor: 'pointer',
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 36,
            }}
          >
            {s.label}
            {active && (
              <span style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 10, height: 10, borderRadius: '50%',
                background: playing ? 'oklch(80% 0.15 140)' : 'oklch(80% 0.05 60)',
                border: `1.5px solid ${paper.bg}`,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// Small label pill
function Tag({ children, color, paper = window.PAPER, size = 'md' }) {
  const h = size === 'sm' ? 16 : 20;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'sm' ? '0 6px' : '0 8px',
      height: h, borderRadius: h / 2,
      fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
      fontSize: size === 'sm' ? 10 : 11,
      letterSpacing: 0.3, color: paper.bg,
      background: color || paper.ink,
    }}>{children}</span>
  );
}

Object.assign(window, { Btn, IconBtn, Slider, LogSlider, RangeSlider, DrawnDial, PlaybackControl, Tag });
