// CurveCanvas — interactive drawing surface with playhead, ghost lanes, axis labels
// Supports v1 "Sketchbook" (ruled paper) and v2 "Studio" (scale banding) modes.

function CurveCanvas({
  width,
  height,
  lanes,
  focus,
  phase,
  setCurve,
  gridX = 8,
  gridY = 8,
  variant = 'sketchbook',
  showScaleBanding = false,
  showAxisNotes = false,
  paper = window.PAPER,
  onDraw,
  quantizeY = false,
  quantizeX = false,
  useFlats = false,
}) {
  const ref = React.useRef(null);
  const [drawing, setDrawing] = React.useState(false);
  const ptsRef = React.useRef([]);
  const [liveStroke, setLiveStroke] = React.useState(null);

  const focusLane = lanes.find(l => l.id === focus);

  const toCanvasXY = (e) => {
    const r = ref.current.getBoundingClientRect();
    let x = (e.clientX - r.left) / r.width;
    let y = 1 - (e.clientY - r.top) / r.height;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    // Drawing is always free-flowing.  Quantization is a PLAYBACK property —
    // the C++ engine snaps phase / output to ticks at sample time.  Snapping
    // the captured curve here would bake quantization into the data and lose
    // the underlying smooth curve, which is the opposite of what we want
    // (e.g. "draw smooth, play quantized" is the whole point).  A future
    // "quantize-this-segment" tool can opt-in to snapping drawn points.
    return { x, y };
  };

  const onPointerDown = (e) => {
    // Only treat the gesture as a drawing stroke when it actually originates
    // on the canvas surface — not on an overlay control (corner buttons,
    // shape-well tab, etc.) that happens to be a descendant of an absolute-
    // positioned sibling.  Without this guard, fast re-renders during
    // playback can occasionally route a button-targeted pointerdown through
    // the canvas's listener and cause setPointerCapture to swallow the
    // subsequent click on the button.
    if (e.target !== ref.current) return;
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    setDrawing(true);
    ptsRef.current = [toCanvasXY(e)];
    setLiveStroke([...ptsRef.current]);
  };
  const onPointerMove = (e) => {
    if (!drawing) return;
    const p = toCanvasXY(e);
    const last = ptsRef.current[ptsRef.current.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.003) {
      ptsRef.current.push(p);
      setLiveStroke([...ptsRef.current]);
      onDraw?.(p);
    }
  };
  const onPointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    const curve = smoothCurvePoints(ptsRef.current);
    if (curve) setCurve(focus, curve);
    setLiveStroke(null);
  };

  // Scale banding for v2 Note mode.
  //
  // The canvas Y axis maps 0..1 to value 0..1, which the engine multiplies by
  // 127 for Note mode (full MIDI range C-1..G9).  Bands are drawn for every
  // semitone over the lane's *active* output range — not the whole MIDI
  // range — so the visible band density tracks what the user has remapped
  // to.  When the lane's range is narrow (e.g. 2 octaves) the bands are
  // legible; when wide they get dense, which is the honest view.
  const scaleBands = React.useMemo(() => {
    if (!showScaleBanding || !focusLane || focusLane.target !== 'Note') return null;
    const mask = focusLane.scaleMask, root = focusLane.scaleRoot;
    const lo = Math.round((focusLane.rangeMin ?? 0)   * 127);
    const hi = Math.round((focusLane.rangeMax ?? 1)   * 127);
    const span = Math.max(1, hi - lo);
    const bands = [];
    for (let s = lo; s <= hi; s++) {
      const rel = ((s - root) % 12 + 12) % 12;
      const active = pcActive(mask, rel);
      const y = (s - lo) / span;  // bottom = rangeMin, top = rangeMax
      bands.push({ semi: s, y, active, pc: rel });
    }
    return bands;
  }, [showScaleBanding, focusLane]);

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        width, height,
        position: 'relative',
        background: variant === 'studio' ? paper.bg : paper.card,
        cursor: 'crosshair',
        userSelect: 'none',
        touchAction: 'none',
        overflow: 'hidden',
        border: variant === 'studio' ? `1px solid ${paper.rule}` : 'none',
        borderRadius: variant === 'studio' ? 2 : 0,
      }}
    >
      <svg
        width={width} height={height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {/* Active output range bracket — subtle shaded zone */}
        {focusLane && (() => {
          const lo = focusLane.rangeMin, hi = focusLane.rangeMax;
          const y1 = height * (1 - hi), y2 = height * (1 - lo);
          return (
            <>
              {/* WKWebView's SVG fill parser drops the alpha pair from 8-digit
                  hex (#RRGGBBAA) and renders the rect opaque — so split fill +
                  fillOpacity here.  Browser-only previews would tolerate either. */}
              <rect x={0} y={y1} width={width} height={y2 - y1}
                fill={focusLane.color} fillOpacity={0.07} />
              <line x1={0} x2={width} y1={y1} y2={y1}
                stroke={focusLane.color} strokeWidth={1} strokeDasharray="3 4" opacity={0.4} />
              <line x1={0} x2={width} y1={y2} y2={y2}
                stroke={focusLane.color} strokeWidth={1} strokeDasharray="3 4" opacity={0.4} />
            </>
          );
        })()}

        {/* Scale bands (v2 Note mode) — full canvas height */}
        {scaleBands && scaleBands.map((b, i) => {
          const prev = scaleBands[i - 1];
          const y1 = height * (1 - b.y);
          const y2 = prev ? height * (1 - prev.y) : y1;
          return (
            <rect key={i}
              x={0} y={Math.min(y1, y2)} width={width} height={Math.max(1, Math.abs(y2 - y1))}
              fill={b.active ? 'rgba(196,98,74,0.15)' : 'transparent'}
            />
          );
        })}

        {/* Grid — Y lines */}
        {Array.from({ length: gridY + 1 }).map((_, i) => {
          const isLocked = quantizeY;
          const isMid = i === gridY / 2;
          return (
            <line key={'h' + i}
              x1={0} x2={width}
              y1={(i / gridY) * height} y2={(i / gridY) * height}
              stroke={isLocked ? paper.amberInk : (isMid ? paper.rule : '#C8BEA8')}
              strokeWidth={isLocked ? (isMid ? 1.5 : 1) : (isMid ? 1 : 0.5)}
              strokeDasharray={isLocked ? '0' : (i % (gridY / 4) === 0 ? '0' : '3 4')}
              opacity={isLocked ? 0.6 : 1}
            />
          );
        })}
        {/* Grid — X lines */}
        {Array.from({ length: gridX + 1 }).map((_, i) => {
          const isLocked = quantizeX;
          return (
            <line key={'v' + i}
              x1={(i / gridX) * width} x2={(i / gridX) * width}
              y1={0} y2={height}
              stroke={isLocked ? paper.amberInk : '#C8BEA8'}
              strokeWidth={isLocked ? 1 : 0.5}
              strokeDasharray={isLocked ? '0' : '3 4'}
              opacity={isLocked ? 0.5 : 1}
            />
          );
        })}

        {/* Ghost lanes (inactive or unfocused) */}
        {lanes.map(l => {
          if (l.id === focus || !l.curve || !l.enabled) return null;
          return <CurvePath key={'g' + l.id} curve={l.curve} w={width} h={height} stroke={l.color} opacity={0.25} width={1.5} />;
        })}

        {/* Focused lane curve — original drawn shape, kept visible underneath
            the quantized staircase as a "source" reference. */}
        {focusLane?.curve && (
          <CurvePath curve={focusLane.curve} w={width} h={height} stroke={focusLane.color} opacity={0.95} width={2.5} />
        )}

        {/* Staircase overlay — shows the *actual* emitted playback curve when
            either axis is quantize-locked.  Step function: phase steps in
            xDivisions chunks, value steps in yDivisions levels.  This is the
            visible analogue of the C++ engine's S&H output. */}
        {focusLane?.curve && (focusLane.quantizeX || focusLane.quantizeY) && (() => {
          const xDiv = (focusLane.quantizeX && focusLane.xDivisions >= 2) ? focusLane.xDivisions : null;
          const N = xDiv ?? 256;            // when xQ off, draw at curve resolution
          let d = '';
          for (let i = 0; i < N; i++) {
            const p0 = i / N;
            const p1 = (i + 1) / N;
            // Sample at the start of the tick (the held value across [p0, p1])
            // through the lane's full quantize logic so yQuantize is honoured.
            const v = sampleLaneQuantized(focusLane, p0);
            const x0 = p0 * width;
            const x1 = p1 * width;
            const y  = (1 - v) * height;
            d += (i === 0 ? `M${x0.toFixed(1)},${y.toFixed(1)}` : `L${x0.toFixed(1)},${y.toFixed(1)}`);
            d += `L${x1.toFixed(1)},${y.toFixed(1)}`;
          }
          return (
            <path d={d} fill="none"
              stroke={focusLane.color}
              strokeWidth={1.6}
              strokeOpacity={0.85}
              strokeDasharray="5 3"
            />
          );
        })()}

        {/* Live stroke while drawing */}
        {liveStroke && liveStroke.length > 1 && (
          <polyline
            points={liveStroke.map(p => `${p.x * width},${(1 - p.y) * height}`).join(' ')}
            fill="none"
            stroke={focusLane?.color || paper.ink}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.75}
          />
        )}

        {/* Per-lane playheads */}
        {lanes.map(l => {
          if (!l.curve || !l.enabled) return null;
          // Show the playhead at the actual playback X (snapped if quantizeX)
          // and the quantized Y, so the dot tracks what's emitted via MIDI.
          let xPhase = phase;
          if (l.quantizeX && l.xDivisions >= 2) {
            const tickWidth = 1 / l.xDivisions;
            xPhase = Math.floor(xPhase / tickWidth) * tickWidth;
          }
          const x = xPhase * width;
          const v = sampleLaneQuantized(l, phase);
          const y = (1 - v) * height;
          const isFocus = l.id === focus;
          return (
            <g key={'p' + l.id}>
              {isFocus && (
                <line x1={x} x2={x} y1={0} y2={height} stroke={l.color} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              )}
              <circle cx={x} cy={y} r={isFocus ? 6 : 4} fill={l.color} stroke={paper.bg} strokeWidth={2} />
            </g>
          );
        })}
      </svg>

      {/* Axis labels — note names on Y when showAxisNotes + Note mode.
          When the active range spans many octaves (chromatic / wide), labels
          for every active pitch class would overlap.  Filter to keep one
          label per ~14 vertical pixels: walk top→bottom and skip any label
          that would collide with the previously-kept one.  When skipping,
          prefer keeping root pcs where possible by ordering them first. */}
      {showAxisNotes && focusLane?.target === 'Note' && scaleBands && (() => {
        const minSpacing = 14;  // px
        const active = scaleBands.filter(b => b.active);
        // Walk top→bottom (highest semi first because y is small at the top)
        const ordered = [...active].sort((a, b) => b.semi - a.semi);
        const kept = [];
        let lastY = -Infinity;
        for (const b of ordered) {
          const y = height * (1 - b.y);
          // Always keep root pcs; otherwise enforce min spacing.
          const isRoot = b.pc === focusLane.scaleRoot;
          if (isRoot || (y - lastY) >= minSpacing) {
            kept.push({ ...b, y });
            lastY = y;
          }
        }
        return (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 36,
            pointerEvents: 'none',
          }}>
            {kept.map(b => (
              <div key={b.semi} style={{
                position: 'absolute', left: 4, top: b.y - 7,
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 12, fontStyle: 'italic',
                color: b.pc === focusLane.scaleRoot ? paper.amberInk : paper.ink70,
                fontWeight: b.pc === focusLane.scaleRoot ? 600 : 400,
              }}>
                {window.pitchName(b.pc, useFlats)}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Empty hint */}
      {!focusLane?.curve && !liveStroke && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: paper.ink30, pointerEvents: 'none',
          fontFamily: '"Caveat", cursive', fontSize: variant === 'studio' ? 42 : 28,
          letterSpacing: 0.5,
        }}>
          draw a curve →
        </div>
      )}
    </div>
  );
}

function CurvePath({ curve, w, h, stroke, opacity = 1, width = 2 }) {
  const n = curve.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    const y = (1 - curve[i]) * h;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  return <path d={d} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
}

Object.assign(window, { CurveCanvas, CurvePath });
