// JUCE iPad Studio variant — 1024×768, V2 direction, touch-optimised
// Canvas-fills-all, right lane panel (always visible), left shape well,
// bottom qurve shelf, scale discovery, MIDI ghost, plugin comms badge.

// ── Range formatter — real MIDI values per output mode ───────
// useFlats: when true, chromatic pitch classes use flat names (D♭/E♭/G♭/…)
// instead of sharps.  Bound to the global ♯/♭ toggle in the top bar.
function formatRange(lane, useFlats) {
  const { rangeMin: lo, rangeMax: hi, target } = lane;
  if (target === 'CC' || target === 'Aftertouch') {
    return `${Math.round(lo * 127)} – ${Math.round(hi * 127)}`;
  }
  if (target === 'PitchBend') {
    // Engine emits raw 14-bit unsigned PB (0..16383, centre 8192) — display
    // matches that.  Subtract 8192 if you prefer bipolar; keeping unsigned
    // here so it lines up with what ShowMIDI / standard monitors show.
    return `${Math.round(lo * 16383)} – ${Math.round(hi * 16383)}`;
  }
  if (target === 'Note') {
    // Full MIDI range: 0..127 → C-1 .. G9.  rangeMin/rangeMax are 0..1
    // and the engine multiplies by 127, so the JS display must match.
    const noteName = (midi) => {
      const pc = ((midi % 12) + 12) % 12;
      const oct = Math.floor(midi / 12) - 1;
      return window.pitchName(pc, useFlats) + oct;
    };
    return `${noteName(Math.round(lo * 127))} – ${noteName(Math.round(hi * 127))}`;
  }
  return `${Math.round(lo * 127)} – ${Math.round(hi * 127)}`;
}

function formatCenter(lane, useFlats) {
  const mid = (lane.rangeMin + lane.rangeMax) / 2;
  if (lane.target === 'CC' || lane.target === 'Aftertouch')
    return Math.round(mid * 127);
  if (lane.target === 'PitchBend')
    return Math.round(mid * 16383);
  if (lane.target === 'Note') {
    const midi = Math.round(mid * 127);   // full MIDI range — see formatRange
    const pc = ((midi % 12) + 12) % 12;
    return window.pitchName(pc, useFlats) + (Math.floor(midi / 12) - 1);
  }
  return Math.round(mid * 127);
}

function formatDepth(lane) {
  const span = lane.rangeMax - lane.rangeMin;
  if (lane.target === 'CC' || lane.target === 'Aftertouch')
    return '±' + Math.round(span * 127 / 2);
  if (lane.target === 'PitchBend')
    return '±' + Math.round(span * 16383 / 2);   // half-span around centre
  if (lane.target === 'Note')
    return Math.round(span * 127) + ' semi';   // full MIDI range
  return '±' + Math.round(span * 127 / 2);
}

function JuceIPadStudio({ width = 1024, height = 768 }) {
  const eng = useDrawnQurveEngine({ mode: 'standard' });
  const paper = window.PAPER;
  const focusLane = eng.lanes.find(l => l.id === eng.focus);

  const RIGHT_W = 148;  // always-visible lane panel
  const TOP_H = 52;
  const BOTTOM_H = 38;
  const [leftOpen, setLeftOpen] = React.useState(false);
  const LEFT_W = leftOpen ? 256 : 22;

  const [shelfOpen, setShelfOpen] = React.useState(false);
  const SHELF_H = shelfOpen ? 180 : 0;

  const [scaleOpen, setScaleOpen] = React.useState(false);
  const SCALE_H = scaleOpen ? 310 : 0;

  // Grid density and quantize toggles are per-lane — they live on focusLane
  // and are mirrored to APVTS via eng.updateLane (the patched engine in
  // main.jsx forwards every patch through sendParam).  The local helpers
  // below clamp to the engine-side ranges (2..32 / 2..24) and accept either
  // a value or an updater function.
  const gridX = focusLane?.xDivisions ?? 4;
  const gridY = focusLane?.yDivisions ?? 4;
  const setGridX = (v) => focusLane && eng.updateLane(focusLane.id, {
    xDivisions: Math.max(2, Math.min(32, typeof v === 'function' ? v(gridX) : v)),
  });
  const setGridY = (v) => focusLane && eng.updateLane(focusLane.id, {
    yDivisions: Math.max(2, Math.min(24, typeof v === 'function' ? v(gridY) : v)),
  });

  // Scale discovery moment — fires once when Note mode first selected
  const [discoveryVisible, setDiscoveryVisible] = React.useState(false);
  const prevTarget = React.useRef(focusLane?.target);
  React.useEffect(() => {
    if (focusLane?.target === 'Note' && prevTarget.current !== 'Note') {
      setDiscoveryVisible(true);
      setTimeout(() => setDiscoveryVisible(false), 4000);
    }
    prevTarget.current = focusLane?.target;
  }, [focusLane?.target]);

  // MIDI ghost demo state
  const [midiGhostOn, setMidiGhostOn] = React.useState(false);

  // Plugin sync demo state
  const [pluginSync, setPluginSync] = React.useState(false);

  // Gutter geometry — Y gutter on the left, X gutter on the bottom of the
  // canvas area, intersecting at the '#' corner cell.  Width must match
  // CORNER_W for the L to align.
  const Y_GUTTER_W = 56;
  const X_GUTTER_H = 40;
  const canvasW = width  - LEFT_W - RIGHT_W - Y_GUTTER_W;
  const canvasH = height - TOP_H - BOTTOM_H - SHELF_H - SCALE_H - X_GUTTER_H;

  const containerRef = React.useRef(null);
  const [canvasSize, setCanvasSize] = React.useState({ w: canvasW, h: canvasH });
  React.useLayoutEffect(() => {
    setCanvasSize({ w: Math.max(200, canvasW), h: Math.max(100, canvasH) });
  }, [canvasW, canvasH]);

  return (
    <div style={{
      width, height,
      background: paper.bg,
      fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
      color: paper.ink,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      backgroundImage: `
        radial-gradient(circle at 15% 30%, oklch(94% 0.02 65 / 0.4) 0, transparent 50%),
        radial-gradient(circle at 80% 70%, oklch(95% 0.025 90 / 0.3) 0, transparent 40%)
      `,
    }}>

      {/* ── Top bar ── */}
      <JuceTopBar eng={eng} paper={paper} h={TOP_H}
        midiGhostOn={midiGhostOn} setMidiGhostOn={setMidiGhostOn}
        pluginSync={pluginSync} setPluginSync={setPluginSync} />

      {/* ── Main row ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left shape well */}
        <JuceShapeWell
          open={leftOpen} setOpen={setLeftOpen}
          eng={eng} paper={paper} focusLane={focusLane}
          width={LEFT_W}
        />

        {/* Canvas stack — Y gutter + canvas row above X gutter row */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Canvas row — Y gutter on left, drawing surface on right */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <YAxisGutter eng={eng} paper={paper} focusLane={focusLane}
              gridY={gridY} setGridY={setGridY} width={Y_GUTTER_W} />

            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <CurveCanvas
                width={canvasSize.w} height={canvasSize.h}
                lanes={eng.lanes} focus={eng.focus} phase={eng.phase}
                setCurve={eng.setCurve}
                variant="studio"
                showScaleBanding={focusLane?.target === 'Note'}
                showAxisNotes={focusLane?.target === 'Note'}
                paper={paper} gridX={gridX} gridY={gridY}
                quantizeX={!!focusLane?.quantizeX}
                quantizeY={!!focusLane?.quantizeY}
                useFlats={eng.useFlats}
              />

              {/* MIDI ghost overlay */}
              {midiGhostOn && <MidiGhostOverlay w={canvasSize.w} h={canvasSize.h} paper={paper} />}

              {/* Typographic readout */}
              <TypoReadout focusLane={focusLane} phase={eng.phase}
                canvasW={canvasSize.w} canvasH={canvasSize.h} paper={paper}
                useFlats={eng.useFlats} />

              {/* Scale discovery chip */}
              {discoveryVisible && <DiscoveryChip paper={paper} onOpen={() => setScaleOpen(true)} />}
            </div>
          </div>

          {/* X gutter row — '#' corner cell aligned under the Y gutter, then
              X-axis controls and the qurves / scale toggles to the right. */}
          <XAxisGutter eng={eng} paper={paper} focusLane={focusLane}
            gridX={gridX} setGridX={setGridX}
            height={X_GUTTER_H} cornerW={Y_GUTTER_W}
            shelfOpen={shelfOpen} setShelfOpen={setShelfOpen}
            scaleOpen={scaleOpen} setScaleOpen={setScaleOpen} />

          {/* Scale wheel panel (slides up) */}
          <div style={{
            height: SCALE_H, overflow: 'hidden',
            transition: 'height 260ms ease-out',
            background: paper.card, borderTop: `1px solid ${paper.rule}`,
          }}>
            {SCALE_H > 0 && focusLane?.target === 'Note' && (
              <div style={{ padding: '14px 18px', display: 'flex', gap: 24, alignItems: 'flex-start', height: '100%' }}>
                <ChromaticWheel lane={focusLane} updateLane={eng.updateLane}
                  paper={paper} size={220} useFlats={eng.useFlats} />
                <div style={{ flex: 1, borderLeft: `1px dashed ${paper.rule}`, paddingLeft: 20 }}>
                  <div style={{
                    fontFamily: '"Instrument Serif", Georgia, serif',
                    fontStyle: 'italic', fontSize: 20, marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    Scale
                    {pluginSync && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        border: `1px solid ${paper.amberInk}`,
                        color: paper.amberInk, fontFamily: 'Inter Tight',
                        letterSpacing: 0.5,
                      }}>↓ synced from ScalePlugin</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: paper.ink70, lineHeight: 1.7, maxWidth: 280 }}>
                    The polygon shows your scale's interval geometry.
                    Toggle pitch classes — your drawn curve will snap to them live.
                    Double-tap a node to set the root.
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {SCALES.map(s => (
                      <button key={s.id}
                        onClick={() => eng.updateLane(focusLane.id, { scaleId: s.id, scaleMask: s.mask })}
                        style={{
                          padding: '5px 10px', borderRadius: 2,
                          border: `1px solid ${focusLane.scaleId === s.id ? paper.ink : paper.rule}`,
                          background: focusLane.scaleId === s.id ? paper.ink : 'transparent',
                          color: focusLane.scaleId === s.id ? paper.bg : paper.ink70,
                          fontFamily: '"Instrument Serif", Georgia, serif',
                          fontStyle: 'italic', fontSize: 14,
                          cursor: 'pointer',
                        }}>{s.name}</button>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                    <Btn paper={paper} small onClick={() => eng.updateLane(focusLane.id, { scaleMask: 0b111111111111, scaleId: 'chromatic' })}>All</Btn>
                    <Btn paper={paper} small onClick={() => eng.updateLane(focusLane.id, { scaleMask: (~focusLane.scaleMask) & 0b111111111111, scaleId: 'custom' })}>Invert</Btn>
                    {pluginSync && <Btn paper={paper} small tone="active">Re-sync ↺</Btn>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Qurve shelf */}
          <div style={{
            height: SHELF_H, overflow: 'hidden',
            transition: 'height 240ms ease-out',
            background: paper.bgDeep, borderTop: `1px solid ${paper.rule}`,
          }}>
            {SHELF_H > 0 && <QurveShelf eng={eng} paper={paper} focusLane={focusLane} />}
          </div>
        </div>

        {/* Right lane panel — always visible */}
        <JuceLanePanel eng={eng} paper={paper} width={RIGHT_W} height={height - TOP_H - BOTTOM_H} />
      </div>

      {/* ── Bottom bar ── */}
      <JuceBottomBar eng={eng} paper={paper} h={BOTTOM_H} />
    </div>
  );
}

// ── Top bar ──────────────────────────────────────────────────
function JuceTopBar({ eng, paper, h, midiGhostOn, setMidiGhostOn, pluginSync, setPluginSync }) {
  return (
    <div style={{
      height: h, display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 12,
      borderBottom: `1px solid ${paper.rule}`,
      background: paper.card, flexShrink: 0,
    }}>
      <div style={{
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontSize: 22, fontStyle: 'italic', letterSpacing: -0.3,
      }}>DrawnQurve</div>

      <div style={{ width: 1, height: 20, background: paper.rule }} />

      {/* Playback */}
      <PlaybackControl direction={eng.direction} setDirection={eng.setDirection}
        playing={eng.playing} setPlaying={eng.setPlaying} paper={paper} />

      {/* Sync + rate */}
      <Btn active={eng.syncOn} onClick={() => eng.setSyncOn(!eng.syncOn)} paper={paper} small>
        {eng.syncOn ? 'Sync' : 'Free'}
      </Btn>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Slider
          value={eng.syncOn ? eng.beats : eng.speed}
          min={eng.syncOn ? 1 : 0.25} max={eng.syncOn ? 32 : 4}
          step={eng.syncOn ? 1 : 0.25}
          onChange={v => eng.syncOn ? eng.setBeats(v) : eng.setSpeed(v)}
          paper={paper} width={96}
        />
        <span style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontStyle: 'italic', fontSize: 16, minWidth: 64,
        }}>{eng.syncOn ? `${eng.beats} beats` : `${eng.speed.toFixed(2)}×`}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Demo toggles for future features */}
      <button onClick={() => setMidiGhostOn(!midiGhostOn)} style={{
        padding: '4px 10px', borderRadius: 2,
        border: `1px solid ${midiGhostOn ? paper.amberInk : paper.rule}`,
        background: midiGhostOn ? 'oklch(90% 0.06 65)' : 'transparent',
        color: midiGhostOn ? paper.amberInk : paper.ink50,
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.8,
        textTransform: 'uppercase', cursor: 'pointer',
      }}>MIDI in</button>

      <button onClick={() => setPluginSync(!pluginSync)} style={{
        padding: '4px 10px', borderRadius: 2,
        border: `1px solid ${pluginSync ? paper.amberInk : paper.rule}`,
        background: pluginSync ? 'oklch(90% 0.06 65)' : 'transparent',
        color: pluginSync ? paper.amberInk : paper.ink50,
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.8,
        textTransform: 'uppercase', cursor: 'pointer',
      }}>plugin sync</button>

      <div style={{ width: 1, height: 20, background: paper.rule }} />
      {/* Chromatic notation toggle — flips every pitch-class label between
          sharp and flat spellings (axis labels, range slider, readouts,
          scale wheel, bottom-bar summary).  Mirrors the native editor's
          ♯/♭ utility-bar button. */}
      <button
        onClick={() => eng.setUseFlats(!eng.useFlats)}
        title={eng.useFlats ? 'Show sharps' : 'Show flats'}
        style={{
          width: 32, height: 28, padding: 0,
          background: paper.card,
          border: `1px solid ${paper.rule}`, borderRadius: 2,
          cursor: 'pointer',
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 16, fontStyle: 'italic',
          color: paper.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{eng.useFlats ? '♭' : '♯'}</button>
      <Btn paper={paper} small onClick={eng.clearAll}>Clear</Btn>
      <IconBtn paper={paper} size={32} title="Panic"><span style={{ fontSize: 13 }}>!</span></IconBtn>
      <IconBtn paper={paper} size={32} title="Help"><span style={{ fontSize: 13 }}>?</span></IconBtn>
    </div>
  );
}

// ── Left shape well ──────────────────────────────────────────
function JuceShapeWell({ open, setOpen, eng, paper, focusLane, width }) {
  return (
    <div style={{
      width, flexShrink: 0, display: 'flex',
      transition: 'width 200ms ease-out',
      borderRight: `1px solid ${paper.rule}`,
      background: open ? paper.card : 'transparent',
      position: 'relative', overflow: 'hidden',
    }}>
      {open && focusLane && (
        <div style={{ width: 256, padding: '14px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.5,
            color: paper.ink50, textTransform: 'uppercase', marginBottom: 2,
          }}>Shape · Lane {focusLane.id + 1}</div>

          {/* Output type */}
          <div>
            <Label paper={paper}>Output</Label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {['CC', 'Aftertouch', 'PitchBend', 'Note'].map(t => (
                <button key={t}
                  onClick={() => eng.updateLane(focusLane.id, { target: t })}
                  style={{
                    padding: '7px 10px', minHeight: 36,
                    border: `1px solid ${focusLane.target === t ? paper.ink : paper.rule}`,
                    background: focusLane.target === t ? paper.ink : 'transparent',
                    color: focusLane.target === t ? paper.bg : paper.ink70,
                    borderRadius: 2, fontSize: 11, fontFamily: 'Inter Tight',
                    cursor: 'pointer',
                  }}>{t === 'Aftertouch' ? 'Aft' : t === 'PitchBend' ? 'PB' : t}</button>
              ))}
            </div>
          </div>

          {focusLane.target === 'CC' && (
            <div>
              <Label paper={paper}>CC number</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Slider value={focusLane.targetDetail} min={0} max={127} step={1}
                  onChange={v => eng.updateLane(focusLane.id, { targetDetail: Math.round(v) })}
                  paper={paper} width={140} />
                <span style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  fontSize: 22, fontStyle: 'italic', minWidth: 36,
                  fontVariantNumeric: 'tabular-nums',
                }}>{focusLane.targetDetail}</span>
              </div>
            </div>
          )}

          <div>
            <Label paper={paper}>MIDI channel</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Slider value={focusLane.channel} min={1} max={16} step={1}
                onChange={v => eng.updateLane(focusLane.id, { channel: Math.round(v) })}
                paper={paper} width={140} />
              <span style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 22, fontStyle: 'italic', minWidth: 28,
                fontVariantNumeric: 'tabular-nums',
              }}>{focusLane.channel}</span>
            </div>
          </div>

          <div>
            <Label paper={paper}>Smooth</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <DrawnDial value={focusLane.smooth} size={52}
                onChange={v => eng.updateLane(focusLane.id, { smooth: v })}
                sublabel={focusLane.smooth.toFixed(2)} paper={paper} />
            </div>
          </div>

          <div>
            <Label paper={paper}>Remap output</Label>
            <div style={{ marginTop: 8 }}>
              <RangeSlider min={0} max={1} lo={focusLane.rangeMin} hi={focusLane.rangeMax}
                onChange={({ lo, hi }) => eng.updateLane(focusLane.id, { rangeMin: lo, rangeMax: hi })}
                accent={focusLane.color} paper={paper} width={210} />
              {/* Primary: real MIDI values */}
              <div style={{
                marginTop: 5, display: 'flex', alignItems: 'baseline', gap: 6,
              }}>
                <span style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  fontSize: 16, fontStyle: 'italic', color: paper.ink,
                }}>{formatRange(focusLane, eng.useFlats)}</span>
              </div>
              {/* Secondary: center + depth hint */}
              <div style={{
                marginTop: 3, display: 'flex', gap: 12,
                fontFamily: 'Inter Tight', fontSize: 10, color: paper.ink50, letterSpacing: 0.5,
              }}>
                <span>center {formatCenter(focusLane, eng.useFlats)}</span>
                <span>depth {formatDepth(focusLane)}</span>
              </div>
              <div style={{
                marginTop: 5, fontSize: 10, color: paper.ink30,
                fontFamily: 'Inter Tight', lineHeight: 1.5,
                borderTop: `1px dashed ${paper.ruleFaint}`, paddingTop: 5,
              }}>
                drag both thumbs → transpose · spread → expand gesture
              </div>
            </div>
          </div>

          {focusLane.target === 'Note' && (
            <div>
              <Label paper={paper}>Velocity</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <DrawnDial value={focusLane.velocity} min={1} max={127} size={52}
                  onChange={v => eng.updateLane(focusLane.id, { velocity: Math.round(v) })}
                  sublabel={focusLane.velocity} paper={paper} />
              </div>
            </div>
          )}

          <div style={{ borderTop: `1px dashed ${paper.rule}`, paddingTop: 10 }}>
            <Btn paper={paper} small>Teach CC →</Btn>
          </div>
        </div>
      )}

      {/* Tab handle */}
      <button onClick={() => setOpen(!open)} style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 22, background: 'transparent', border: 'none',
        borderLeft: `1px solid ${paper.rule}`,
        cursor: 'pointer',
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 2,
        color: paper.ink50, textTransform: 'uppercase',
        padding: '14px 2px',
      }}>{open ? '◂' : '▸ shape'}</button>
    </div>
  );
}

// ── Right lane panel (always visible) ───────────────────────
function JuceLanePanel({ eng, paper, width, height }) {
  // C++ engine caps lanes at kMaxLanes (4); hide the "+ Lane" button when
  // we're already at the cap so the click doesn't silently no-op.
  const MAX_LANES = 4;
  const canAdd = eng.lanes.length < MAX_LANES;
  return (
    <div style={{
      width, height, flexShrink: 0,
      borderLeft: `1px solid ${paper.rule}`,
      background: paper.card,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '10px 10px 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.5,
        color: paper.ink50, textTransform: 'uppercase',
      }}>
        <span>Lanes</span>
        {canAdd && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); eng.addLane?.(); }}
            title="Add lane"
            style={{
              width: 22, height: 22, padding: 0,
              border: `1px solid ${paper.rule}`,
              background: paper.bg, borderRadius: 2,
              color: paper.ink70, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Inter Tight', fontSize: 14, lineHeight: 1,
              position: 'relative', zIndex: 5,
            }}>+</button>
        )}
      </div>

      {eng.lanes.map(l => {
        const focused = eng.focus === l.id;
        return (
          <div key={l.id}
            role="button" tabIndex={0}
            onClick={() => eng.setFocus(l.id)}
            style={{
              padding: '14px 12px',
              minHeight: 80, // ≥ 44pt touch target
              background: focused ? paper.bg : 'transparent',
              borderTop: `1px solid ${paper.ruleFaint}`,
              borderLeft: `3px solid ${focused ? l.color : 'transparent'}`,
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 6,
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%', background: l.color, flexShrink: 0,
                boxShadow: focused ? `0 0 0 2px ${paper.bg}, 0 0 0 3.5px ${l.color}` : 'none',
              }} />
              <span style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontStyle: 'italic', fontSize: 18,
                color: focused ? paper.ink : paper.ink70, lineHeight: 1,
              }}>Lane {l.id + 1}</span>
            </div>
            <div style={{
              fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.8,
              color: paper.ink50, textTransform: 'uppercase',
            }}>
              {l.target === 'PitchBend' ? 'Pitch Bend' : l.target}
              {l.target === 'CC' && ` · CC ${l.targetDetail}`}
              {l.target === 'Note' && ` · v${l.velocity}`}
            </div>
            {focused && (
              <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                <button
                  onClick={e => { e.stopPropagation(); eng.updateLane(l.id, { enabled: !l.enabled }); }}
                  style={laneChip(paper, l.enabled)}>
                  {l.enabled ? 'On' : 'Muted'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); eng.clearLane(l.id); }}
                  style={laneChip(paper, false)}>
                  Clear
                </button>
              </div>
            )}
            {!l.enabled && (
              <div style={{
                fontFamily: 'Inter Tight', fontSize: 9,
                color: paper.ink30, letterSpacing: 0.5,
              }}>muted</div>
            )}
          </div>
        );
      })}

      {/* Playhead value readout per lane */}
      <div style={{
        marginTop: 'auto', padding: '10px',
        borderTop: `1px solid ${paper.rule}`,
      }}>
        {eng.lanes.filter(l => l.curve && l.enabled).map(l => {
          // Display the quantized output value (what MIDI actually emits),
          // not the smooth curve underneath.
          const raw = sampleLaneQuantized(l, eng.phase);
          const { value, semitone } = applyLane(l, raw);
          let val;
          if (l.target === 'Note' && semitone != null) {
            const pc = ((semitone % 12) + 12) % 12;
            val = window.pitchName(pc, eng.useFlats) + Math.floor(semitone / 12 - 1);
          } else if (l.target === 'PitchBend') {
            val = Math.round(value * 16383);   // raw 14-bit unsigned PB
          } else {
            val = Math.round(value * 127);
          }
          return (
            <div key={l.id} style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              marginBottom: 4,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontStyle: 'italic', fontSize: 20, lineHeight: 1,
                color: l.color,
                fontVariantNumeric: 'tabular-nums',
              }}>{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function laneChip(paper, active) {
  return {
    padding: '4px 8px', minHeight: 28,
    borderRadius: 2, border: `1px solid ${paper.rule}`,
    background: active ? paper.ink : 'transparent',
    color: active ? paper.bg : paper.ink70,
    fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.5,
    textTransform: 'uppercase', cursor: 'pointer',
  };
}

// ── Canvas corner controls ────────────────────────────────────
//
// IMPORTANT: every helper below is defined at MODULE scope, not inside
// CanvasCornerControls.  Defining them inside meant a fresh function
// reference on every render — and the JUCE phase heartbeat re-renders this
// tree at 30 Hz during playback.  React treats a "different function
// reference" as a different component type, so it unmounted the old button
// and mounted a new one between every frame.  When the user pressed a
// button mid-frame, `pointerdown` arrived on the live element but the
// next re-render destroyed it before `pointerup` could fire — so the
// browser never dispatched the `click`.  This was the entire reason the
// quantize / density buttons appeared to "only work while paused".

function GridIcon({ axis, denser }) {
  const w = 22, h = 18;
  const lines = denser ? [0.25, 0.5, 0.75] : [0.5];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <rect x={1} y={1} width={w-2} height={h-2} rx={1}
        fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.4} />
      {axis === 'Y'
        ? lines.map((f, i) => (
            <line key={i} x1={2} x2={w-2} y1={f * h} y2={f * h}
              stroke="currentColor" strokeWidth={denser ? 0.8 : 1.2}
              opacity={denser ? 0.9 : 0.6} />
          ))
        : lines.map((f, i) => (
            <line key={i} x1={f * w} x2={f * w} y1={2} y2={h-2}
              stroke="currentColor" strokeWidth={denser ? 0.8 : 1.2}
              opacity={denser ? 0.9 : 0.6} />
          ))
      }
      <text x={denser ? w-5 : 4} y={denser ? 6 : h-3}
        style={{ fontSize: 5, fontFamily: 'Inter Tight', fontWeight: 600 }}
        fill="currentColor" opacity={0.5}>{axis}</text>
    </svg>
  );
}

function GridBtn({ axis, denser, onClick, paper }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (onClick) onClick(e); }}
      title={`${axis} grid ${denser ? 'denser' : 'sparser'}`} style={{
      width: 32, height: 28, border: `1px solid ${paper.rule}`,
      background: paper.card, borderRadius: 2,
      color: paper.ink70, cursor: 'pointer', padding: 2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', zIndex: 5,
    }}>
      <GridIcon axis={axis} denser={denser} />
    </button>
  );
}

// Corner button — toggles X+Y quantize together.  Visually anchors the
// L-shape control cluster and lights up only when both axes are locked.
function BothBtn({ active, onClick, paper }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (onClick) onClick(e); }}
      title="Lock both axes" style={{
      width: 32, height: 28,
      border: `1px solid ${active ? paper.amberInk : paper.rule}`,
      background: active ? paper.amberInk : paper.card,
      color: active ? paper.bg : paper.ink70,
      borderRadius: 2, cursor: 'pointer', padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter Tight', fontSize: 13, fontWeight: 700,
      position: 'relative', zIndex: 5,
    }}>#</button>
  );
}

// Compact numeric pill — shows the current grid count between density steppers.
function CountPill({ value, paper }) {
  return (
    <div style={{
      minWidth: 24, height: 22, padding: '0 6px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Instrument Serif", Georgia, serif',
      fontStyle: 'italic', fontSize: 13,
      color: paper.ink70,
      background: 'transparent',
      borderTop: `1px solid ${paper.ruleFaint}`,
      borderBottom: `1px solid ${paper.ruleFaint}`,
      fontVariantNumeric: 'tabular-nums',
      userSelect: 'none',
    }}>{value}</div>
  );
}

// Small preset button shared by the X (1/4..1/32) and Y (chr/oct/5th/3rd) rows.
function PresetBtn({ label, active, onClick, paper }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (onClick) onClick(e); }}
      style={{
        padding: '2px 6px', height: 22,
        border: `1px solid ${active ? paper.amberInk : paper.rule}`,
        background: active ? paper.amberInk : paper.card,
        color: active ? paper.bg : paper.ink50,
        borderRadius: 2, cursor: 'pointer',
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontStyle: 'italic', fontSize: 12,
        position: 'relative', zIndex: 5,
      }}>{label}</button>
  );
}

function LockBtn({ axis, active, onClick, paper }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (onClick) onClick(e); }}
      title={`${axis} quantize ${active ? 'on' : 'off'}`} style={{
      width: 32, height: 28, border: `1px solid ${active ? paper.amberInk : paper.rule}`,
      background: active ? paper.amberInk : 'transparent',
      color: active ? paper.bg : paper.ink50,
      borderRadius: 2, cursor: 'pointer', padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.5,
      gap: 2,
      // Own stacking context above the canvas div so spatial overlap doesn't
      // create unexpected hit-test outcomes.
      position: 'relative', zIndex: 5,
    }}>
      <svg width={10} height={12} viewBox="0 0 10 12">
        <rect x={2} y={5} width={6} height={7} rx={1} fill="currentColor" opacity={0.9}/>
        <path d={`M2.5 5V3.5a2.5 2.5 0 015 0V5`} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"/>
      </svg>
      <span>{axis}</span>
    </button>
  );
}

// Vertical Y gutter — runs alongside the LEFT edge of the canvas.  Holds
// (top→bottom): Y presets, Y denser, Y count, Y sparser, Y lock.  The lock
// sits at the bottom so the bottom edge of this gutter aligns with the X
// gutter's '#' corner button — together they form the L-shape the user
// asked for.  Width must match the X gutter's corner cell so they line up.
function YAxisGutter({ eng, paper, focusLane, gridY, setGridY, width, height }) {
  const noteSpan = focusLane
    ? Math.max(1, Math.round(((focusLane.rangeMax ?? 1) - (focusLane.rangeMin ?? 0)) * 127))
    : 24;
  const yNotePresets = [
    { label: 'chr', div: Math.min(127, noteSpan) },
    { label: 'oct', div: Math.max(2, Math.round(noteSpan / 12)) },
    { label: '5th', div: Math.max(2, Math.round(noteSpan / 7)) },
    { label: '3rd', div: Math.max(2, Math.round(noteSpan / 4)) },
  ];
  const yValuePresets = [
    { label: '2',  div: 2 },
    { label: '4',  div: 4 },
    { label: '8',  div: 8 },
    { label: '16', div: 16 },
    { label: '24', div: 24 },
  ];
  const showPresets = !!focusLane?.quantizeY;
  const presets = focusLane?.target === 'Note' ? yNotePresets : yValuePresets;
  const toggleY = () => focusLane && eng.updateLane(focusLane.id, { quantizeY: !focusLane.quantizeY });
  return (
    <div style={{
      width, height,
      flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-end',
      gap: 3, padding: '6px 0',
      background: paper.card,
      borderRight: `1px solid ${paper.rule}`,
      // Sit above the canvas content.  z-index isn't strictly necessary as
      // a sibling gutter, but it documents intent.
      position: 'relative', zIndex: 4,
    }}>
      {showPresets && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
          {presets.map(p => (
            <PresetBtn key={p.label} label={p.label} paper={paper}
              active={gridY === p.div}
              onClick={() => setGridY(p.div)} />
          ))}
        </div>
      )}
      <GridBtn axis="Y" denser={true}  paper={paper} onClick={() => setGridY(g => Math.min(24, g + 2))} />
      <CountPill value={gridY} paper={paper} />
      <GridBtn axis="Y" denser={false} paper={paper} onClick={() => setGridY(g => Math.max(2, g - 2))} />
      <LockBtn  axis="Y" active={!!focusLane?.quantizeY} paper={paper} onClick={toggleY} />
    </div>
  );
}

// Horizontal X gutter — runs along the BOTTOM edge of the canvas.  The '#'
// corner button sits at the very left so it aligns with the Y gutter above
// it; the rest of the X-axis controls fan out to the right.  When sync is
// on AND X-quantize is on, the beat presets (1/4 .. 1/32) appear inline.
// "qurves" and "scale" toggles live at the right end.
function XAxisGutter({ eng, paper, focusLane, gridX, setGridX, height, cornerW,
                       shelfOpen, setShelfOpen, scaleOpen, setScaleOpen }) {
  const xSyncPresets = [
    { label: '1/4',  cols: 4  },
    { label: '1/8',  cols: 8  },
    { label: '1/16', cols: 16 },
    { label: '1/32', cols: 32 },
  ];
  const toggleX = () => focusLane && eng.updateLane(focusLane.id, { quantizeX: !focusLane.quantizeX });
  const toggleBoth = () => {
    if (!focusLane) return;
    const both = focusLane.quantizeX && focusLane.quantizeY;
    eng.updateLane(focusLane.id, { quantizeX: !both, quantizeY: !both });
  };
  const bothActive = !!(focusLane?.quantizeX && focusLane?.quantizeY);
  return (
    <div style={{
      height,
      display: 'flex', alignItems: 'center', flexShrink: 0,
      borderTop: `1px solid ${paper.rule}`,
      background: paper.card,
      position: 'relative', zIndex: 4,
    }}>
      {/* Corner cell — width matches the Y gutter so the '#' aligns. */}
      <div style={{
        width: cornerW, height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRight: `1px solid ${paper.rule}`,
        flexShrink: 0,
      }}>
        <BothBtn paper={paper} active={bothActive} onClick={toggleBoth} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 8px' }}>
        <LockBtn axis="X" active={!!focusLane?.quantizeX} paper={paper} onClick={toggleX} />
        <GridBtn axis="X" denser={false} paper={paper} onClick={() => setGridX(g => Math.max(2, g - 2))} />
        <CountPill value={gridX} paper={paper} />
        <GridBtn axis="X" denser={true}  paper={paper} onClick={() => setGridX(g => Math.min(32, g + 2))} />
        {eng.syncOn && focusLane?.quantizeX && (
          <div style={{ display: 'flex', gap: 3, marginLeft: 6 }}>
            {xSyncPresets.map(p => (
              <PresetBtn key={p.label} label={p.label} paper={paper}
                active={gridX === p.cols}
                onClick={() => setGridX(p.cols)} />
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1 }} />
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setShelfOpen(!shelfOpen); }}
        style={{
          padding: '4px 10px', height: 28, marginRight: 6,
          background: paper.card, border: `1px solid ${paper.rule}`,
          borderRadius: 2, cursor: 'pointer',
          fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1,
          color: paper.ink50, textTransform: 'uppercase',
          position: 'relative', zIndex: 5,
        }}>{shelfOpen ? '▾ qurves' : '▸ qurves'}</button>
      {focusLane?.target === 'Note' && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setScaleOpen(!scaleOpen); }}
          style={{
            padding: '4px 12px', height: 28, marginRight: 8,
            background: scaleOpen ? paper.ink : paper.card,
            color: scaleOpen ? paper.bg : paper.ink50,
            border: `1px solid ${scaleOpen ? paper.ink : paper.rule}`,
            borderRadius: 2, cursor: 'pointer',
            fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1,
            textTransform: 'uppercase',
            position: 'relative', zIndex: 5,
          }}>{scaleOpen ? '▾ scale' : '▴ scale'}</button>
      )}
    </div>
  );
}

// (CanvasCornerControls removed — replaced by the gutter components above)


// ── Scale discovery chip ──────────────────────────────────────
function DiscoveryChip({ paper, onOpen }) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      background: paper.card, border: `1px solid ${paper.amberInk}`,
      borderRadius: 24, padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      animation: 'slideDown 0.3s ease-out',
      zIndex: 20,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: paper.amberInk, flexShrink: 0,
      }} />
      <span style={{
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontStyle: 'italic', fontSize: 15, color: paper.ink,
      }}>pitches are snapping to scale</span>
      <button onClick={onOpen} style={{
        background: paper.amberInk, color: paper.bg,
        border: 'none', borderRadius: 20, padding: '3px 10px',
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.8,
        textTransform: 'uppercase', cursor: 'pointer',
      }}>explore →</button>
    </div>
  );
}

// ── Typographic readout ──────────────────────────────────────
function TypoReadout({ focusLane, phase, canvasW, canvasH, paper, useFlats }) {
  if (!focusLane?.curve || !focusLane.enabled) return null;
  // Mirror the C++ engine's quantization so the on-canvas readout shows the
  // value that's actually being emitted via MIDI, not the un-quantized curve.
  const raw = sampleLaneQuantized(focusLane, phase);
  const { value, semitone } = applyLane(focusLane, raw);
  const x = phase * canvasW;
  const y = (1 - value) * canvasH;
  let primary, units;
  if (focusLane.target === 'Note' && semitone != null) {
    const pc = ((semitone % 12) + 12) % 12;
    const oct = Math.floor(semitone / 12) - 1;
    primary = window.pitchName(pc, useFlats) + oct;
    units = 'note';
  } else if (focusLane.target === 'CC') {
    primary = Math.round(value * 127);
    units = 'cc ' + focusLane.targetDetail;
  } else if (focusLane.target === 'PitchBend') {
    // Engine emits raw 14-bit unsigned PB (0..16383, centre 8192).  Match
    // that here so the readout lines up with what ShowMIDI / standard MIDI
    // monitors display.
    primary = Math.round (value * 16383);
    units = 'pb';
  } else {
    primary = Math.round(value * 127);
    units = 'aft';
  }
  const onLeft = x > canvasW * 0.72;
  return (
    <div style={{
      position: 'absolute',
      left: onLeft ? Math.max(4, x - 100) : x + 14,
      top: Math.max(4, y - 28),
      pointerEvents: 'none', zIndex: 5,
      lineHeight: 0.9,
    }}>
      <div style={{
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontSize: 52, fontStyle: 'italic',
        color: focusLane.color,
        textShadow: `0 0 8px ${paper.bg}, 0 0 8px ${paper.bg}`,
        lineHeight: 1,
      }}>{primary}</div>
      <div style={{
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.8,
        color: paper.ink50, textTransform: 'uppercase',
        textShadow: `0 0 4px ${paper.bg}`,
      }}>{units}</div>
    </div>
  );
}

// ── MIDI ghost overlay ───────────────────────────────────────
function MidiGhostOverlay({ w, h, paper }) {
  // Simulate a few incoming MIDI notes as faint horizontal bars
  const notes = [
    { note: 72, vel: 90, start: 0.05, end: 0.25 }, // C5
    { note: 69, vel: 70, start: 0.30, end: 0.55 }, // A4
    { note: 71, vel: 85, start: 0.60, end: 0.80 }, // B4
    { note: 74, vel: 60, start: 0.82, end: 0.95 }, // D5
    { note: 67, vel: 75, start: 0.10, end: 0.45 }, // G4
  ];
  const noteToY = (n) => h * (1 - (n - 48) / 36);
  return (
    <svg width={w} height={h} style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
    }}>
      {notes.map((n, i) => (
        <rect key={i}
          x={n.start * w} y={noteToY(n.note) - 6}
          width={(n.end - n.start) * w} height={12}
          fill={paper.laneRose || 'oklch(60% 0.14 25)'}
          opacity={(n.vel / 127) * 0.22}
          rx={3}
        />
      ))}
      {/* Label */}
      <text x={8} y={18} style={{
        fontFamily: 'Inter Tight', fontSize: 9,
        fill: paper.amberInk || '#8A5520',
        letterSpacing: 1.5, textTransform: 'uppercase',
      }}>MIDI IN</text>
    </svg>
  );
}

// ── Qurve shelf ──────────────────────────────────────────────
function QurveShelf({ eng, paper, focusLane }) {
  const saved = [
    { name: 'slow arch', target: 'CC', curve: makeSineCurve(64, 0.5, 0.4, 0.8, 0) },
    { name: 'fast zigzag', target: 'CC', curve: makeSineCurve(64, 0.5, 0.35, 3, 0) },
    { name: 'pentatonic glide', target: 'Note', curve: makeSineCurve(64, 0.5, 0.3, 1.5, Math.PI/4) },
    { name: 'breath swell', target: 'Aftertouch', curve: makeSineCurve(64, 0.4, 0.35, 0.6, Math.PI/6) },
    { name: 'stutter', target: 'CC', curve: makeSineCurve(64, 0.5, 0.45, 6, 0) },
  ];
  return (
    <div style={{
      height: '100%', padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.5,
          color: paper.ink50, textTransform: 'uppercase',
        }}>Qurve Library</div>
        <div style={{ flex: 1 }} />
        <Btn paper={paper} small tone="active">Save current +</Btn>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {saved.map((q, i) => (
          <div key={i}
            onClick={() => eng.setCurve(eng.focus, q.curve)}
            style={{
              flexShrink: 0, width: 110, height: 90,
              background: paper.card,
              border: `1px solid ${paper.rule}`,
              borderRadius: 2, cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden', padding: '6px 6px 4px',
              gap: 4,
            }}>
            <svg width={98} height={50} style={{ flex: 1 }}>
              <CurvePath curve={q.curve} w={98} h={50}
                stroke={focusLane?.color || paper.laneInk}
                opacity={0.7} width={1.5} />
            </svg>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <div style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontStyle: 'italic', fontSize: 12, color: paper.ink,
                lineHeight: 1, overflow: 'hidden', whiteSpace: 'nowrap',
              }}>{q.name}</div>
            </div>
            <div style={{
              fontFamily: 'Inter Tight', fontSize: 9, letterSpacing: 0.8,
              color: paper.ink50, textTransform: 'uppercase',
            }}>{q.target}</div>
          </div>
        ))}
        {/* Empty slot */}
        <div style={{
          flexShrink: 0, width: 110, height: 90,
          border: `1px dashed ${paper.rule}`,
          borderRadius: 2, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: paper.ink30, cursor: 'pointer',
          fontFamily: '"Caveat", cursive', fontSize: 18,
        }}>+ save</div>
      </div>
    </div>
  );
}

// ── Bottom bar — contextual summary, no mode switcher ────────
function JuceBottomBar({ eng, paper, h }) {
  const focusLane = eng.lanes.find(l => l.id === eng.focus);
  if (!focusLane) return null;

  const targetLabel = {
    CC: `CC ${focusLane.targetDetail}`,
    Aftertouch: 'Aftertouch',
    PitchBend: 'Pitch Bend',
    Note: `Notes · ${(SCALES.find(s => s.id === focusLane.scaleId) || { name: 'Custom' }).name} / ${window.pitchName(focusLane.scaleRoot, eng.useFlats)}`,
  }[focusLane.target] || focusLane.target;

  const Dot = ({ color, label }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: 'italic', fontSize: 14, color: paper.ink }}>{label}</span>
    </span>
  );

  const Sep = () => (
    <span style={{ width: 1, height: 14, background: paper.rule, flexShrink: 0, display: 'inline-block' }} />
  );

  return (
    <div style={{
      height: h, display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 14px', borderTop: `1px solid ${paper.rule}`,
      background: paper.card, flexShrink: 0,
    }}>
      {/* Lane colour + target */}
      <Dot color={focusLane.color} label={`Lane ${focusLane.id + 1}`} />
      <Sep />
      <span style={{ fontFamily: 'Inter Tight', fontSize: 11, color: paper.ink70 }}>{targetLabel}</span>
      <Sep />
      <span style={{ fontFamily: 'Inter Tight', fontSize: 11, color: paper.ink70 }}>
        ch {focusLane.channel}
      </span>
      <Sep />
      <span style={{ fontFamily: 'Inter Tight', fontSize: 11, color: paper.ink70 }}>
        {formatRange(focusLane, eng.useFlats)} · <span style={{ color: paper.ink50 }}>±{formatDepth(focusLane)}</span>
      </span>
      <Sep />
      <span style={{ fontFamily: 'Inter Tight', fontSize: 11, color: paper.ink70 }}>
        smooth {focusLane.smooth.toFixed(2)}
      </span>
    </div>
  );
}

// ── Small helper ─────────────────────────────────────────────
function Label({ children, paper = window.PAPER }) {
  return (
    <div style={{
      fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.4,
      color: paper.ink50, textTransform: 'uppercase',
    }}>{children}</div>
  );
}

Object.assign(window, { JuceIPadStudio, QurveShelf, MidiGhostOverlay, DiscoveryChip });
