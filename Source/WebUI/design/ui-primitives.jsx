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
  return (
    <div
      ref={ref}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); set(e); }}
      onPointerMove={(e) => { if (drag) set(e); }}
      onPointerUp={() => setDrag(false)}
      style={{
        width, height: 22, position: 'relative',
        cursor: 'pointer', touchAction: 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 10, left: 0, right: 0, height: 2,
        background: paper.rule, borderRadius: 1,
      }} />
      <div style={{
        position: 'absolute', top: 10, left: 0, width: thumbX, height: 2,
        background: accent || paper.ink, borderRadius: 1,
      }} />
      <div style={{
        position: 'absolute', top: 5, left: thumbX - 6, width: 12, height: 12,
        borderRadius: '50%', background: paper.card,
        border: `1.5px solid ${accent || paper.ink}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }} />
    </div>
  );
}

// Dual-thumb range — middle drag shifts both (transpose)
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

  return (
    <div ref={ref}
      onPointerMove={onMove}
      onPointerUp={() => { dragging.current = null; midStart.current = null; }}
      onPointerCancel={() => { dragging.current = null; midStart.current = null; }}
      style={{ width, height: 22, position: 'relative', touchAction: 'none' }}
    >
      {/* Track */}
      <div style={{ position: 'absolute', top: 10, left: 0, right: 0, height: 2, background: paper.rule }} />
      {/* Active fill — draggable middle */}
      <div
        onPointerDown={onDownMid}
        style={{
          position: 'absolute', top: 6, left: loX, width: hiX - loX, height: 10,
          background: accent || paper.ink, opacity: 0.25, borderRadius: 1,
          cursor: 'ew-resize',
        }}
      />
      <div style={{
        position: 'absolute', top: 10, left: loX, width: hiX - loX, height: 2,
        background: accent || paper.ink, pointerEvents: 'none',
      }} />
      {/* Thumbs */}
      <div onPointerDown={onDownLo} style={thumbStyle(loX, accent || paper.ink, paper)} />
      <div onPointerDown={onDownHi} style={thumbStyle(hiX, accent || paper.ink, paper)} />
    </div>
  );
}
function thumbStyle(x, color, paper) {
  return {
    position: 'absolute', top: 5, left: x - 6, width: 12, height: 12,
    borderRadius: '50%', background: paper.card,
    border: `1.5px solid ${color}`,
    cursor: 'grab', touchAction: 'none',
  };
}

// Drawn rotary dial — sketchbook feel
function DrawnDial({ value, min = 0, max = 1, onChange, size = 56, label, sublabel, paper = window.PAPER }) {
  const f = (value - min) / (max - min);
  const a = -135 + f * 270;
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  const tipAngle = a * Math.PI / 180;
  const tipX = cx + r * Math.cos(tipAngle - Math.PI / 2);
  const tipY = cy + r * Math.sin(tipAngle - Math.PI / 2);
  const drag = React.useRef(null);
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    const nv = Math.max(min, Math.min(max, drag.current.v + (dy / 120) * (max - min)));
    onChange(nv);
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
        onPointerUp={() => drag.current = null}
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

Object.assign(window, { Btn, IconBtn, Slider, RangeSlider, DrawnDial, PlaybackControl, Tag });
