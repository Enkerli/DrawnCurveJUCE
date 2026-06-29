// juce-ipad.jsx — full-screen Studio layout for DrawnQurve
//
// Target: 1024×768 iPad landscape (AUv3 / AU / Standalone).
// Renders as a single React tree rooted at <JuceIPadStudio>.
//
// Layout regions (all sizes in CSS px):
//   TOP_H   (52)  — title, transport, sync, utility buttons, help
//   LEFT_W (256/44) — Shape well: output routing, smooth, range, velocity
//   Y_GUTTER_W (60) — Y-axis: grid density steppers + quantize lock
//   Canvas           — CurveCanvas (ResizeObserver-sized, touch-draw)
//   X_GUTTER_H (48) — X-axis: grid + quantize + shelf/scale toggles
//   SCALE_H (0/310)  — Scale editor panel (slides up)
//   SHELF_H (0/180)  — Qurve shelf panel (slides up)
//   RIGHT_W (148/44) — Lane panel: focus, mute, readout
//   BOTTOM_H (38)   — Status bar: lane summary, bridge indicator
//
// Key behaviours:
//   • All interactive helpers are MODULE-SCOPE (not nested functions) so
//     React reconciles to stable DOM nodes at the 30 Hz phase-tick rate.
//     Inner-function components unmount/remount every frame → no click.
//   • Scale and Shelf panels are mutually exclusive (F-14).
//   • Left panel defaults open (F-05); right panel always visible.
//   • Keyboard shortcuts (F-24): Space = play/pause, 1–4 = lane select,
//     ? / Escape = toggle help.
//   • Scale quantization is PER-LANE (l<n>_scaleRoot / l<n>_scaleMask APVTS).
//     Scale panel shows the focused lane's scale; "↕ All" copies it to every lane.
//   • Per-lane playback direction/speed (DC_HAVE_PER_LANE_PLAYBACK_PARAMS) is wired in
//     C++ but NOT exposed in the UI yet — the canvas shows only a single global phase,
//     so per-lane speed/direction would appear broken even when MIDI output is correct.

// ── Range formatter — real MIDI values per output mode ───────

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
  const recorder = useMidiRecorder(eng);

  // Theme — persisted in localStorage so it survives plugin reload.
  const [useDark, setUseDarkRaw] = React.useState(
    () => (typeof localStorage !== 'undefined') && localStorage.getItem('dq-theme') === 'dark'
  );
  const setUseDark = React.useCallback((next) => {
    const dark = typeof next === 'function' ? next(useDark) : next;
    setUseDarkRaw(dark);
    try { localStorage.setItem('dq-theme', dark ? 'dark' : 'light'); } catch (_) {}
    // Update lane display colours in engine state without reinitialising.
    const lanes = window.LANES || [];
    lanes.forEach((ldef, i) => {
      const newColor = dark ? (ldef.colorDark || ldef.color) : ldef.color;
      eng.updateLane(i, { color: newColor });
    });
  }, [useDark, eng]);

  const paper = useDark ? (window.PAPER_DARK || window.PAPER) : window.PAPER;
  const focusLane = eng.lanes.find(l => l.id === eng.focus);

  const TOP_H = 52;
  const BOTTOM_H = 38;
  // Default open per usability audit F-05 — collapsed-by-default hid every
  // per-lane setting (output type, CC#, channel, smooth, range remap)
  // behind a 22 px tab.  At 256 px wide the well still leaves a usable
  // canvas on a 1024 px window.  User can collapse explicitly.
  const [leftOpen, setLeftOpen] = React.useState(true);
  // Collapsed strips are 44 px wide so the entire strip is a >= 44 pt iOS
  // touch target (audit F-01).  The visual chevron + label stay centred in
  // the strip; the wider hit area is the whole div.
  const LEFT_W = leftOpen ? 160 : 44;
  const [rightOpen, setRightOpen] = React.useState(true);
  const RIGHT_W = rightOpen ? 256 : 44;

  // Mutually exclusive bottom panels — opening one closes the other so the
  // canvas can never collapse to ~148 px under both (audit F-14).  Wrap the
  // setters: scaleOpen=true ⇒ shelfOpen=false and vice versa.
  const [shelfOpen, setShelfOpenRaw] = React.useState(false);
  const [scaleOpen, setScaleOpenRaw] = React.useState(false);
  const setShelfOpen = (next) => {
    const v = typeof next === 'function' ? next(shelfOpen) : next;
    if (v) setScaleOpenRaw(false);
    setShelfOpenRaw(v);
  };
  const setScaleOpen = (next) => {
    const v = typeof next === 'function' ? next(scaleOpen) : next;
    if (v) setShelfOpenRaw(false);
    setScaleOpenRaw(v);
  };
  const SHELF_H = shelfOpen ? 180 : 0;
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

  // Help overlay — toggled by the '?' button; also closed by Escape
  const [helpOpen, setHelpOpen] = React.useState(false);

  // Scale discovery moment — fires once when Note mode first selected
  const [discoveryVisible, setDiscoveryVisible] = React.useState(false);
  const prevTarget = React.useRef(focusLane?.target);
  React.useEffect(() => {
    if (focusLane?.target === 'Note' && prevTarget.current !== 'Note') {
      setDiscoveryVisible(true);
      setTimeout(() => setDiscoveryVisible(false), 4000);
    }
    // Auto-close the scale panel when the focused lane is no longer Note mode
    // so the open panel doesn't leave an empty gap in the layout.
    if (focusLane?.target !== 'Note' && prevTarget.current === 'Note') {
      setScaleOpen(false);
    }
    prevTarget.current = focusLane?.target;
  }, [focusLane?.target]);

  // F-24: Keyboard navigation — stable ref so the handler never needs to
  // re-attach.  Space = play/pause; 1–4 = select lane N.
  // Guard: skip when the user is typing in an input field.
  // F-24: Keyboard navigation — stable ref so the handler never needs to
  // re-attach.  Reads current engine state via ref to avoid stale closures.
  const engRef = React.useRef(eng);
  React.useEffect(() => { engRef.current = eng; });
  const helpOpenRef = React.useRef(helpOpen);
  React.useEffect(() => { helpOpenRef.current = helpOpen; }, [helpOpen]);
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') { setHelpOpen(false); return; }
      if (e.key === '?') { setHelpOpen(o => !o); return; }
      if (helpOpenRef.current) return; // swallow other keys when help is open
      if (e.key === ' ') {
        e.preventDefault();
        engRef.current.setPlaying(p => !p);
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= engRef.current.lanes.length) {
        e.preventDefault();
        engRef.current.setFocus(engRef.current.lanes[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // stable — reads all state via refs

  // ── Outer-container size (ResizeObserver) ────────────────────────────────
  // The outer div uses width:'100%', height:'100%' so it fills the WKWebView
  // frame exactly — avoiding the clipping that occurred when window.innerWidth
  // differed slightly from the actual JUCE-allocated frame.  We measure the
  // outer div's actual pixel size and use it for all internal layout math
  // (panel heights, canvas fallback size).  The `width`/`height` props are
  // only ever used as initial estimates before the first ResizeObserver fire.
  //
  // IMPORTANT: this block must precede any use of W / H (canvasW/canvasH below).
  const outerRef = React.useRef(null);
  const [outerSize, setOuterSize] = React.useState({
    w: width  || 1024,
    h: height || 768,
  });
  React.useLayoutEffect(() => {
    if (!outerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) setOuterSize({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, []); // stable — outer element never changes
  const W = outerSize.w;   // use W / H everywhere instead of width / height
  const H = outerSize.h;

  // Gutter geometry — Y gutter on the left, X gutter on the bottom of the
  // canvas area, intersecting at the '#' corner cell.  Width must match
  // CORNER_W for the L to align.
  // Gutter sizing — Y_GUTTER_W & X_GUTTER_H bumped from 56/40 to 60/48 so
  // 36 × 36 quantize buttons (audit F-02) fit cleanly with margin.
  const Y_GUTTER_W = 60;
  const X_GUTTER_H = 48;
  const canvasW = W - LEFT_W - RIGHT_W - Y_GUTTER_W;
  const canvasH = H - TOP_H - BOTTOM_H - SHELF_H - SCALE_H - X_GUTTER_H;

  // Canvas sizing — track the canvas-area div's *actual* allocated size with
  // a ResizeObserver instead of computing from window.innerWidth/Height.  The
  // computed values (canvasW/canvasH) are used as a fallback before the
  // observer fires; the live measured values take over after first paint.
  // This makes the layout robust to:
  //   • host windows that aren't exactly 1024×768
  //   • the user resizing the standalone
  //   • the right panel collapsing (canvas-area widens) and the scale/qurves
  //     panels opening (canvas-area shortens) — both flexbox events that
  //     window-based math can't see.
  const containerRef = React.useRef(null);
  const [canvasSize, setCanvasSize] = React.useState({
    w: Math.max(200, canvasW),
    h: Math.max(100, canvasH),
  });
  React.useLayoutEffect(() => {
    if (! containerRef.current || typeof ResizeObserver === 'undefined') {
      // Fallback: use the window-derived numbers.
      setCanvasSize({ w: Math.max(200, canvasW), h: Math.max(100, canvasH) });
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setCanvasSize({ w: Math.max(200, Math.floor(w)), h: Math.max(100, Math.floor(h)) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      onContextMenu={e => e.preventDefault()}
      style={{
      width: '100%', height: '100%',
      background: paper.bg,
      fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
      color: paper.ink,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      backgroundImage: useDark
        ? `radial-gradient(circle at 15% 30%, rgba(74,100,160,0.10) 0, transparent 50%),
           radial-gradient(circle at 80% 70%, rgba(60,80,140,0.08) 0, transparent 40%)`
        : `radial-gradient(circle at 15% 30%, oklch(94% 0.02 65 / 0.4) 0, transparent 50%),
           radial-gradient(circle at 80% 70%, oklch(95% 0.025 90 / 0.3) 0, transparent 40%)`,
    }}>

      {/* ── Top bar ── */}
      <JuceTopBar eng={eng} paper={paper} h={TOP_H}
        helpOpen={helpOpen} setHelpOpen={setHelpOpen}
        useDark={useDark} setUseDark={setUseDark}
        recorder={recorder} />

      {/* ── Main row ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left lane panel */}
        <JuceLanePanel eng={eng} paper={paper} width={LEFT_W}
          open={leftOpen} setOpen={setLeftOpen}
          recorder={recorder} />

        {/* Canvas stack — Y gutter + canvas row above X gutter row */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Canvas row — Y gutter on left, drawing surface on right */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <YAxisGutter eng={eng} paper={paper} focusLane={focusLane}
              gridY={gridY} setGridY={setGridY} width={Y_GUTTER_W} />

            <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <CurveCanvas
                width={canvasSize.w} height={canvasSize.h}
                lanes={eng.lanes} focus={eng.focus} phase={eng.phase}
                lanePhases={eng.lanePhases}
                setCurve={eng.setCurve}
                variant="studio"
                showScaleBanding={focusLane?.target === 'Note'}
                showAxisNotes={focusLane?.target === 'Note'}
                paper={paper} gridX={gridX} gridY={gridY}
                quantizeX={!!focusLane?.quantizeX}
                quantizeY={!!focusLane?.quantizeY}
                useFlats={eng.useFlats}
              />

              {/* Typographic readout — use focused lane's own phase */}
              {(() => {
                const focusPhase = eng.lanePhases?.[focusLane?.id] ?? eng.phase;
                return (
                  <TypoReadout focusLane={focusLane} phase={focusPhase}
                    canvasW={canvasSize.w} canvasH={canvasSize.h} paper={paper}
                    useFlats={eng.useFlats} />
                );
              })()}

              {/* Piano roll — committed notes (onion skin) + live preview during recording */}
              {focusLane?.target === 'Note' && (
                <PianoRollOverlay
                  lane={focusLane}
                  w={canvasSize.w} h={canvasSize.h}
                  liveRecRef={recorder.armedLane === focusLane?.id ? recorder.liveRecRef : null}
                  isRecording={recorder.isRecording && recorder.armedLane === focusLane?.id}
                  liveRecTick={recorder.liveRecTick}
                />
              )}

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

          {/* Scale panel (slides up).  Three columns side-by-side:
                1. SVG wheel (interval geometry, bracelet polygon, click to
                   toggle pitches, double-tap / long-press to set root)
                2. Family-grouped scale picker (8 families × 47 scales,
                   matching Source/ScaleData.h)
                3. Action row (All / Invert / None) + editable decimal
                   bitmask + help blurb
              Each column has its own scroll containment so the panel
              never overflows into the X gutter or out of the panel below. */}
          <div style={{
            height: SCALE_H, overflow: 'hidden',
            transition: 'height 260ms ease-out',
            background: paper.card, borderTop: `1px solid ${paper.rule}`,
          }}>
            {SCALE_H > 0 && focusLane?.target === 'Note' && (
              <div style={{
                padding: '10px 12px', display: 'flex', gap: 12,
                alignItems: 'stretch', height: '100%',
                boxSizing: 'border-box',
                minWidth: 520, overflowX: 'auto',
              }}>
                <ChromaticWheel lane={focusLane} updateLane={eng.updateLane}
                  paper={paper} size={Math.min(180, SCALE_H - 20)}
                  useFlats={eng.useFlats} />

                <div style={{
                  width: 170, flexShrink: 0,
                  borderLeft: `1px dashed ${paper.rule}`, paddingLeft: 12,
                  display: 'flex', flexDirection: 'column', minHeight: 0,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.5,
                    color: paper.ink50, textTransform: 'uppercase',
                    marginBottom: 8, flexShrink: 0,
                  }}>Scale</div>
                  <ScalePicker lane={focusLane} updateLane={eng.updateLane} paper={paper} />
                </div>

                <div style={{
                  flex: 1, minWidth: 110,
                  borderLeft: `1px dashed ${paper.rule}`, paddingLeft: 12,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  overflowY: 'auto',
                }}>
                  <div style={{
                    fontFamily: '"Instrument Serif", Georgia, serif',
                    fontStyle: 'italic', fontSize: 20,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    Mask
                    {/* Scale is now per-lane — badge shows the focused lane's colour dot */}
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 10,
                      border: `1px solid ${paper.rule}`,
                      color: paper.ink50, fontFamily: 'Inter Tight',
                      letterSpacing: 0.6, textTransform: 'uppercase',
                      fontStyle: 'normal', display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: focusLane?.color ?? paper.ink30,
                        display: 'inline-block', flexShrink: 0,
                      }} />
                      Lane {(focusLane?.id ?? 0) + 1}
                    </span>
                  </div>

                  {/* Action row — All / Invert / None set the mask directly,
                      same as the native editor's scale toolbar.  Recognition
                      auto-names the scale where one matches. */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Btn paper={paper} small onClick={() => eng.updateLane(focusLane.id, {
                      scaleMask: 0xFFF, scaleId: 'chromatic',
                    })}>All</Btn>
                    <Btn paper={paper} small onClick={() => {
                      const next = (~focusLane.scaleMask) & 0xFFF;
                      eng.updateLane(focusLane.id, {
                        scaleMask: next, scaleId: recognizeScaleId(next),
                      });
                    }}>Invert</Btn>
                    <Btn paper={paper} small onClick={() => eng.updateLane(focusLane.id, {
                      // "None" = root only.  Empty mask (0x000) would silence the
                      // engine; root-only is what the native editor used.
                      scaleMask: 0x800, scaleId: 'custom',
                    })}>None</Btn>
                    {/* "Apply to all" — copies this lane's root + mask to
                        every lane.  Native editor had one shared scale; now
                        lanes can differ, but you can broadcast on demand. */}
                    {eng.lanes.length > 1 && (
                      <Btn paper={paper} small
                        title="Copy this scale root + mask to all lanes"
                        onClick={() => eng.applyScaleToAll(
                          focusLane.scaleRoot, focusLane.scaleMask
                        )}>↕ All</Btn>
                    )}
                  </div>

                  {/* Editable decimal bitmask — type a value 0..4095 (e.g.
                      2773 = C Ionian) to set the pitch-class set directly. */}
                  <ScaleMaskInput lane={focusLane} updateLane={eng.updateLane} paper={paper} />

                  <div style={{
                    fontSize: 11, color: paper.ink70, lineHeight: 1.5,
                    marginTop: 'auto',
                  }}>
                    Tap a pitch to toggle · double-tap or hold (0.5 s) to set
                    the root · pick a preset to overwrite the mask · type a
                    decimal value (0–4095) to enter a custom set.
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

        {/* Right shape well */}
        <JuceShapeWell
          open={rightOpen} setOpen={setRightOpen}
          eng={eng} paper={paper} focusLane={focusLane}
          width={RIGHT_W}
        />
      </div>

      {/* ── Bottom bar ── */}
      <JuceBottomBar eng={eng} paper={paper} h={BOTTOM_H} />

      {/* ── Help overlay — rendered last so it sits on top of everything ── */}
      {helpOpen && <HelpOverlay paper={paper} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// ── Top bar ──────────────────────────────────────────────────
// F-13: Stripped to essential controls only.  The "MIDI input ghosting"
// and "ScalePlugin sync" placeholder buttons (F.3/F.4 roadmap items) were
// removed — they consumed ~150 px and drove no real behaviour.  They will
// return as real controls when the features are implemented.
function JuceTopBar({ eng, paper, h, helpOpen, setHelpOpen, useDark, setUseDark, recorder }) {
  const rec = recorder;
  const canRecord  = rec?.hasAccess && rec?.armedLane !== null;
  const isRec      = !!rec?.isRecording;

  return (
    <div style={{
      height: h, display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 10,
      borderBottom: `1px solid ${paper.rule}`,
      background: paper.card, flexShrink: 0,
    }}>
      <div style={{
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontSize: 22, fontStyle: 'italic', letterSpacing: -0.3,
        flexShrink: 0,
      }}>DrawnQurve</div>

      <div style={{ width: 1, height: 20, background: paper.rule, flexShrink: 0 }} />

      {/* Playback direction + transport */}
      <PlaybackControl direction={eng.direction} setDirection={eng.setDirection}
        playing={eng.playing} setPlaying={eng.setPlaying} paper={paper} />

      {/* ── REC button — starts/stops MIDI capture for the armed lane ─────── */}
      {rec?.hasAccess && (
        <button
          onClick={() => rec.toggleRecording()}
          disabled={!canRecord && !isRec}
          title={
            isRec          ? 'Stop recording'
            : canRecord    ? `Record into Lane ${rec.armedLane + 1}`
                           : 'Arm a lane first (●)'
          }
          style={{
            width: 30, height: 30, borderRadius: '50%', padding: 0,
            border: `2px solid ${isRec ? 'oklch(52% 0.20 25)' : canRecord ? paper.ink50 : paper.rule}`,
            background: isRec ? 'oklch(52% 0.20 25)' : 'transparent',
            color: isRec ? '#fff' : canRecord ? paper.ink50 : paper.ink30,
            cursor: canRecord || isRec ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            animation: isRec ? 'dq-pulse 1s ease-in-out infinite' : 'none',
            transition: 'background 150ms, border-color 150ms, color 150ms',
          }}>
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true">
            <circle cx={5} cy={5} r={4} fill="currentColor" />
          </svg>
        </button>
      )}

      {/* Sync mode + duration/beat-count.
          Free mode: slider controls duration in seconds (= 1 / speed ratio).
          Sync mode: slider controls loop length in beats.
          C++ stores playbackSpeed (a ratio); we convert to/from seconds on the JS side. */}
      <Btn active={eng.syncOn} onClick={() => eng.setSyncOn(!eng.syncOn)} paper={paper} small>
        {eng.syncOn ? 'Sync' : 'Free'}
      </Btn>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {eng.syncOn ? (
          <Slider
            value={eng.beats}
            min={1} max={32} step={1}
            onChange={v => eng.setBeats(v)}
            paper={paper} width={96}
          />
        ) : (
          /* Duration slider: value in seconds = 1/speed.
             Range 0.25 s (speed 4×, very fast) → 20 s (speed 0.05×, slow).
             Step 0.1 s gives fine-enough control; user sees seconds not a multiplier. */
          <Slider
            value={parseFloat((1.0 / eng.speed).toFixed(2))}
            min={0.25} max={20} step={0.1}
            onChange={v => eng.setSpeed(1.0 / Math.max(0.05, v))}
            paper={paper} width={96}
          />
        )}
        <span style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontStyle: 'italic', fontSize: 16, minWidth: 60,
          flexShrink: 0,
        }}>{eng.syncOn ? `${eng.beats} beats` : `${(1.0 / eng.speed).toFixed(1)} s`}</span>
      </div>

      {recorder && <MidiInputSelector recorder={recorder} paper={paper} />}

      <div style={{ flex: 1 }} />

      {/* Utility strip — notation toggle, destructive ops, help */}
      <div style={{ width: 1, height: 20, background: paper.rule, flexShrink: 0 }} />
      {/* Chromatic notation: ♯/♭ toggle */}
      <button
        onClick={() => eng.setUseFlats(!eng.useFlats)}
        title={eng.useFlats ? 'Show sharps' : 'Show flats'}
        style={{
          width: 36, height: 36, padding: 0,
          background: paper.card,
          border: `1px solid ${paper.rule}`, borderRadius: 2,
          cursor: 'pointer',
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 16, fontStyle: 'italic', color: paper.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>{eng.useFlats ? '♭' : '♯'}</button>
      <ConfirmBtn paper={paper} onConfirm={eng.clearAll}
        label="Clear" armedLabel="Tap to confirm"
        title="Clear all lanes" />
      <IconBtn paper={paper} size={36} onClick={eng.panic} title="Panic — all notes off">
        <span style={{ fontSize: 14 }}>!</span>
      </IconBtn>
      <IconBtn paper={paper} size={36} active={helpOpen}
        onClick={() => setHelpOpen(!helpOpen)} title="Quick reference (? key)">
        <span style={{ fontSize: 14 }}>?</span>
      </IconBtn>
      {/* Theme toggle — ☾ in light mode (offers dark), ☼ in dark mode (offers light) */}
      <IconBtn paper={paper} size={36} active={useDark}
        onClick={() => setUseDark(d => !d)}
        title={useDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        <span style={{ fontSize: 15 }}>{useDark ? '☼' : '☾'}</span>
      </IconBtn>
    </div>
  );
}

// ── Left shape well ──────────────────────────────────────────
function JuceShapeWell({ open, setOpen, eng, paper, focusLane, width }) {
  // Teach CC — local UI state only.  C++ auto-clears once a CC arrives;
  // JS detects completion by watching focusLane.targetDetail change while
  // teaching.  Switching lane or target type also exits teach mode.
  const [teaching, setTeaching] = React.useState(false);
  const prevDetailRef = React.useRef(null);

  React.useEffect(() => {
    if (!teaching) { prevDetailRef.current = null; return; }
    if (prevDetailRef.current === null) {
      prevDetailRef.current = focusLane?.targetDetail;
      return;
    }
    // A change in targetDetail while armed means the CC was captured.
    if (focusLane?.targetDetail !== prevDetailRef.current) {
      setTeaching(false);
      prevDetailRef.current = null;
    }
  }, [teaching, focusLane?.targetDetail]);

  // Exit teach mode if focus moves to a non-CC lane, or if the panel closes.
  React.useEffect(() => {
    if (teaching && focusLane?.target !== 'CC') {
      eng.cancelTeach?.();
      setTeaching(false);
    }
  }, [focusLane?.id, focusLane?.target, teaching]);

  return (
    <div style={{
      width, flexShrink: 0, display: 'flex',
      transition: 'width 200ms ease-out',
      borderLeft: `1px solid ${paper.rule}`,
      background: open ? paper.card : 'transparent',
      position: 'relative', overflow: 'hidden',
    }}>
      {open && focusLane && (
        // paddingLeft: 48 keeps all content clear of the 36 px collapse-tab handle
        // that is absolutely positioned at the left edge of this panel.
        <div style={{ width: 256, boxSizing: 'border-box', padding: '14px 12px 14px 48px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.5,
            color: paper.ink50, textTransform: 'uppercase', marginBottom: 2,
          }}>Shape · Lane {focusLane.id + 1}</div>

          {/* Output type */}
          <div>
            <Label paper={paper}>Output</Label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', marginTop: 6 }}>
              {[
                { key: 'CC',          label: 'CC',  title: 'Continuous Controller',
                  icon: <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M0,6 C2.5,6 2.5,1.5 4.5,1.5 C6.5,1.5 6.5,10.5 8.5,10.5 C10.5,10.5 10.5,1.5 12.5,1.5 C14.5,1.5 14.5,10.5 16.5,10.5 C18.5,10.5 18.5,6 22,6" />
                  </svg> },
                { key: 'Aftertouch',  label: 'AT',  title: 'Aftertouch (channel pressure)',
                  icon: <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="0.8" width="14" height="2.4" rx="1.2" fill="currentColor" stroke="none" />
                    <line x1="8" y1="5" x2="8" y2="10.5" />
                    <polyline points="5,8 8,13 11,8" />
                  </svg> },
                { key: 'PitchBend',   label: 'PB',  title: 'Pitch Bend',
                  icon: <svg width="20" height="14" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1,13 Q6,13 10,7 Q14,1 17,1" />
                    <polyline points="13,1 17,1 17,5" />
                  </svg> },
                { key: 'Note',        label: '♩',   title: 'MIDI Note',
                  icon: <span style={{ fontSize: 16, lineHeight: 1 }}>♩</span> },
              ].map(({ key, label, title, icon }) => {
                const active = focusLane.target === key;
                return (
                  <button key={key} onClick={() => eng.updateLane(focusLane.id, { target: key })}
                    title={title}
                    style={{
                      padding: '5px 6px', minHeight: 36, minWidth: 36,
                      border: `1px solid ${active ? paper.ink : paper.rule}`,
                      background: active ? paper.ink : 'transparent',
                      color: active ? paper.bg : paper.ink70,
                      borderRadius: 2, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                    {icon}
                    <span style={{ fontSize: 9, fontFamily: 'Inter Tight', letterSpacing: 0.3 }}>{label}</span>
                  </button>
                );
              })}
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
              {/* Teach CC — arm this lane to capture the next incoming CC#.
                  Button shows "Listening… ✕" while armed; C++ solos the lane
                  and waits for one CC.  The paramChange echo for ccNumber exits
                  teach mode automatically; ✕ cancels without changing the CC#. */}
              <div style={{ marginTop: 8 }}>
                {teaching ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: 'Inter Tight', fontSize: 11,
                      color: paper.amberInk, letterSpacing: 0.3,
                      animation: 'dq-pulse 1s ease-in-out infinite',
                    }}>● Listening for CC…</span>
                    <Btn paper={paper} small onClick={() => {
                      eng.cancelTeach?.();
                      setTeaching(false);
                    }}>✕</Btn>
                  </div>
                ) : (
                  <Btn paper={paper} small onClick={() => {
                    eng.beginTeach?.(focusLane.id);
                    setTeaching(true);
                  }}>Teach CC →</Btn>
                )}
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
              <DrawnDial value={focusLane.smooth} size={52} defaultValue={0}
                onChange={v => eng.updateLane(focusLane.id, { smooth: v })}
                sublabel={focusLane.smooth.toFixed(2)} paper={paper} />
            </div>
          </div>

          <div>
            <Label paper={paper}>Output range</Label>
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
                marginTop: 5, fontSize: 11, color: paper.ink50,
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
                <DrawnDial value={focusLane.velocity} min={1} max={127} size={52} defaultValue={100}
                  onChange={v => eng.updateLane(focusLane.id, { velocity: Math.round(v) })}
                  sublabel={focusLane.velocity} paper={paper} />
              </div>
            </div>
          )}

          {/* ── Per-lane transport override ─────────────────────────────── */}
          {/* Default: useGlobalPlayback=true — lane tracks the global transport.
              When overridden, this lane's MIDI output runs at its own direction
              and speed multiplier.  The canvas still shows a single global
              playhead (per-lane phase display is a future improvement). */}
          <div style={{ borderTop: `1px dashed ${paper.rule}`, paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Label paper={paper}>Per-lane transport</Label>
              <Btn paper={paper} small
                active={!focusLane.useGlobalPlayback}
                onClick={() => {
                  const turningOn = focusLane.useGlobalPlayback; // true = currently global, switching to override
                  eng.updateLane(focusLane.id, {
                    useGlobalPlayback: !focusLane.useGlobalPlayback,
                    ...(turningOn
                      // Turning override ON: seed from global so the lane doesn't jump.
                      ? { laneDirection: eng.direction,
                          laneSpeedMul: eng.syncOn ? 1.0 : eng.speed }
                      // Turning override OFF: resume the lane if it was paused.
                      // Without this, a lane paused via override stays disabled
                      // even after returning to the global transport.
                      : { enabled: true }
                    ),
                  });
                }}>
                {focusLane.useGlobalPlayback ? 'global' : 'override'}
              </Btn>
            </div>

            {!focusLane.useGlobalPlayback && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Direction — mirrors PlaybackControl exactly:
                    • tap a non-active segment → change direction (re-enables if paused)
                    • tap the active segment → toggle pause for this lane only
                    • dot on active segment: green = playing, grey = paused
                    Pause uses enabled=false; processLane() bails before advancing the
                    phase, so the playhead freezes and resumes from the same spot. */}
                <div>
                  <Label paper={paper}>Direction</Label>
                  <div style={{
                    display: 'inline-flex', marginTop: 6,
                    border: `1px solid ${paper.ink}`, borderRadius: 2,
                    overflow: 'hidden', background: paper.card,
                  }}>
                    {[
                      { id: 'rev', title: 'Reverse — tap again to pause',
                        icon: <svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L4 8l6 5V3z" fill="currentColor"/></svg> },
                      { id: 'pp',  title: 'Ping-Pong — tap again to pause',
                        icon: <svg width="20" height="16" viewBox="0 0 20 16"><path d="M6 3L2 8l4 5V3zm8 0v10l4-5-4-5z" fill="currentColor"/></svg> },
                      { id: 'fwd', title: 'Forward — tap again to pause',
                        icon: <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l6 5-6 5V3z" fill="currentColor"/></svg> },
                    ].map((s, i) => {
                      const isThisDir = (focusLane.laneDirection ?? 'fwd') === s.id;
                      const active = isThisDir;  // highlight whichever direction is set
                      const playing = focusLane.enabled;
                      return (
                        <button key={s.id}
                          title={s.title}
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => {
                            if (isThisDir) {
                              // tap active segment → toggle pause
                              eng.updateLane(focusLane.id, { enabled: !playing });
                            } else {
                              // tap different segment → change direction, resume if paused
                              eng.updateLane(focusLane.id, {
                                laneDirection: s.id,
                                ...(!playing ? { enabled: true } : {}),
                              });
                            }
                          }}
                          style={{
                            border: 'none',
                            borderLeft: i > 0 ? `1px solid ${paper.ink}` : 'none',
                            background: active ? paper.ink : 'transparent',
                            color: active ? paper.bg : paper.ink70,
                            padding: '6px 10px', cursor: 'pointer', minWidth: 36,
                            position: 'relative',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                          {s.icon}
                          {active && (
                            <span style={{
                              position: 'absolute', bottom: 2, right: 2,
                              width: 8, height: 8, borderRadius: '50%',
                              background: playing ? 'oklch(80% 0.15 140)' : 'oklch(80% 0.05 60)',
                              border: `1.5px solid ${paper.ink}`,
                            }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Speed multiplier — applies on top of global speed in both free and
                    sync modes, so it is never disabled.  Log-scale slider keeps the
                    musically useful 0.5×–2× region centred and equally spread. */}
                <div>
                  <Label paper={paper}>Speed ×</Label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <LogSlider
                      value={focusLane.laneSpeedMul ?? 1}
                      min={0.1} max={10}
                      snapTo={[0.25, 0.5, 1, 2, 4]}
                      ticks={[
                        { value: 0.25, label: '¼' },
                        { value: 0.5,  label: '½' },
                        { value: 1,    label: '1' },
                        { value: 2,    label: '2' },
                        { value: 4,    label: '4' },
                        { value: 8,    label: '' },   // unlabelled — just a mark
                      ]}
                      onChange={v => eng.updateLane(focusLane.id, { laneSpeedMul: v })}
                      paper={paper} width={150} />
                    <span style={{
                      fontFamily: '"Instrument Serif", Georgia, serif',
                      fontSize: 18, fontStyle: 'italic',
                      fontVariantNumeric: 'tabular-nums', minWidth: 38,
                    }}>{(focusLane.laneSpeedMul ?? 1).toFixed(2)}×</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Legato (one-shot toggle hidden — see roadmap C.1) ─────────── */}
          {/* One-shot (loopMode APVTS param) is wired but the engine doesn't
              hold the sentinel reliably: the lane restarts in sync with other
              lanes immediately after the single run ends.  Root cause unclear —
              likely the standalone timer or the sync-group reset path clearing
              rt.playheadSeconds before the next heartbeat.  Hidden from UI
              until the engine fix is confirmed.  The APVTS param, bridge
              handler, and JS state field (lane.oneShot) are all in place so
              re-exposing the button is a one-line change here. */}
          <div style={{ borderTop: `1px dashed ${paper.rule}`, paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Legato: Note-On fires before Note-Off so consecutive notes
                  tie without silence.  Shown only in Note mode. */}
              {focusLane.target === 'Note' && (
                <Btn paper={paper} small
                  active={focusLane.legato}
                  title="Legato: send Note On before Note Off (no gap between notes)"
                  onClick={() => eng.updateLane(focusLane.id, { legato: !focusLane.legato })}>
                  legato
                </Btn>
              )}
            </div>
          </div>

          {/* ── Phase offset ─────────────────────────────────────────────── */}
          {/* Shifts the curve lookup start point.  The playhead still advances
              from 0→1, but the curve is sampled with a wrap-around offset so
              lane 1 at 0% and lane 2 at 50% are always a half-cycle apart. */}
          <div>
            <Label paper={paper}>Phase offset</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Slider
                value={focusLane.phaseOffset ?? 0}
                min={0} max={100} step={1}
                onChange={v => eng.updateLane(focusLane.id, { phaseOffset: Math.round(v) })}
                paper={paper} width={140} />
              <span style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 18, fontStyle: 'italic', minWidth: 38,
                fontVariantNumeric: 'tabular-nums',
              }}>{Math.round(focusLane.phaseOffset ?? 0)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab handle.  Audit F-01: 36 px wide in open state so the
          close-tab hit area meets the iOS touch-target floor (closed
          state inherits the wider 44 px collapsed strip). */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: open ? 36 : '100%',
        background: paper.bgDeep, border: 'none',
        borderRight: `1px solid ${paper.rule}`,
        boxShadow: `inset -2px 0 0 ${paper.rule}`,
        cursor: 'pointer',
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        fontFamily: 'Inter Tight', fontSize: 11, letterSpacing: 2,
        color: paper.ink70, textTransform: 'uppercase',
        padding: '14px 2px',
      }}>{open ? '▸' : '◂ shape'}</button>
    </div>
  );
}

// ── Right lane panel (always visible) ───────────────────────
function JuceLanePanel({ eng, paper, width, height, open, setOpen, recorder }) {
  // C++ engine caps lanes at kMaxLanes (4); hide the "+ Lane" button when
  // we're already at the cap so the click doesn't silently no-op.
  const MAX_LANES = 4;
  const canAdd = eng.lanes.length < MAX_LANES;

  // F-21: Brief disabled window after add/remove so the button can't be
  // double-fired before the C++ round-trip (stateSnapshot) settles the lane
  // count.  500 ms is enough for the bridge echo to arrive; the button
  // re-enables automatically.
  const [addPending, setAddPending] = React.useState(false);
  const handleAddLane = React.useCallback((e) => {
    e.stopPropagation();
    if (addPending || !canAdd) return;
    setAddPending(true);
    eng.addLane?.();
    setTimeout(() => setAddPending(false), 500);
  }, [addPending, canAdd, eng.addLane]);

  return (
    <div style={{
      width, alignSelf: 'stretch', flexShrink: 0,
      borderRight: `1px solid ${paper.rule}`,
      background: open ? paper.card : 'transparent',
      position: 'relative', overflow: 'hidden',
      transition: 'width 200ms ease-out',
    }}>
      {/* Content — only rendered when open; positioned so it stays clear of
          the 36 px tab handle on the right edge. */}
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, right: 36,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          <div style={{
            padding: '10px 10px 6px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.5,
            color: paper.ink50, textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            <span>Lanes</span>
            {canAdd && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleAddLane}
                title="Add lane"
                disabled={addPending}
                style={{
                  width: 28, height: 28, padding: 0,
                  border: `1px solid ${paper.rule}`,
                  background: paper.bg, borderRadius: 2,
                  color: addPending ? paper.ink30 : paper.ink70,
                  cursor: addPending ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Inter Tight', fontSize: 16, lineHeight: 1,
                  position: 'relative', zIndex: 5,
                  opacity: addPending ? 0.5 : 1,
                  transition: 'opacity 150ms',
                }}>{addPending ? '…' : '+'}</button>
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
            {/* Row 1: mute dot · lane name · eye ──────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Mute dot — solid = active, hollow = muted (MIDI output). */}
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); eng.updateLane(l.id, { enabled: !l.enabled }); }}
                title={l.enabled ? 'Mute lane' : 'Unmute lane'}
                style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  background: l.enabled ? l.color : paper.bg,
                  border: `2px solid ${l.color}`,
                  boxSizing: 'border-box',
                  boxShadow: focused ? `0 0 0 2px ${paper.bg}, 0 0 0 3.5px ${l.color}` : 'none',
                  opacity: l.enabled ? 1 : 0.6,
                  cursor: 'pointer', padding: 0,
                  transition: 'background 120ms, opacity 120ms',
                }} />
              <span style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontStyle: 'italic', fontSize: 17,
                color: focused ? paper.ink : paper.ink70, lineHeight: 1,
                flex: 1,
                textDecoration: l.enabled ? 'none' : `line-through ${paper.ink30}`,
              }}>Lane {l.id + 1}</span>
              {/* Eye — toggles curve visibility on canvas (independent of mute). */}
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); eng.updateLane(l.id, { visible: l.visible === false ? true : false }); }}
                title={l.visible === false ? 'Show curve' : 'Hide curve'}
                style={{
                  flexShrink: 0, padding: 2, border: 'none', borderRadius: 2,
                  background: 'transparent',
                  color: l.visible === false ? paper.ink30 : paper.ink50,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  transition: 'color 120ms',
                }}>
                {l.visible === false ? (
                  // Eye closed — upper arc + lashes
                  <svg width={14} height={10} viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
                    <path d="M1 4C3 1 5 0 7 0C9 0 11 1 13 4" strokeWidth={1.3}/>
                    <line x1={3.5} y1={6} x2={3} y2={8.5} strokeWidth={1.1}/>
                    <line x1={7}   y1={6.5} x2={7} y2={9} strokeWidth={1.1}/>
                    <line x1={10.5} y1={6} x2={11} y2={8.5} strokeWidth={1.1}/>
                  </svg>
                ) : (
                  // Eye open — almond outline + pupil
                  <svg width={14} height={10} viewBox="0 0 14 10" fill="none" aria-hidden="true">
                    <path d="M1 5C3 1.5 5 0 7 0C9 0 11 1.5 13 5C11 8.5 9 10 7 10C5 10 3 8.5 1 5Z"
                      stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round"/>
                    <circle cx={7} cy={5} r={2} fill="currentColor"/>
                  </svg>
                )}
              </button>
            </div>
            {/* Row 2: target label (flex:1) · ARM button · MIDI activity dot ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.8,
                color: paper.ink50, textTransform: 'uppercase', flex: 1,
              }}>
                {l.target === 'PitchBend' ? 'Pitch Bend' : l.target}
                {l.target === 'CC' && ` · CC ${l.targetDetail}`}
                {l.target === 'Note' && (() => {
                  const sc = window.SCALES?.find(s => s.id === l.scaleId);
                  const root = window.pitchName?.(l.scaleRoot, eng.useFlats) ?? '';
                  return ` · ${root}${sc ? ' ' + sc.name : ''}`;
                })()}
              </span>
              {/* ARM button + MIDI activity dot ─────────────────────────────
                  Lives in row 2 so row 1 (lane name) never gets squished.
                  Hollow circle = armed, filled = recording.
                  Dot: green = in-range MIDI received; amber = out-of-range or
                  wrong channel; grey = armed but idle. */}
              {recorder?.hasAccess && (() => {
                const isArmed = recorder.armedLane === l.id;
                const isRec   = isArmed && recorder.isRecording;
                const act     = isArmed && recorder.midiActivity?.tick > 0;
                const inRange = recorder.midiActivity?.inRange !== false;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); recorder.setArmedLane(l.id); }}
                      title={isArmed
                        ? (isRec ? 'Recording — click REC to stop' : 'Armed — click REC to start, or click here to disarm')
                        : 'Arm this lane for MIDI recording'}
                      style={{
                        flexShrink: 0, width: 16, height: 16, padding: 0,
                        border: 'none', borderRadius: 3, boxSizing: 'border-box',
                        background: isRec  ? 'oklch(50% 0.18 25 / 0.18)'
                                  : isArmed ? 'oklch(65% 0.14 65 / 0.15)'
                                  : 'transparent',
                        color: isRec  ? 'oklch(62% 0.22 25)'
                             : isArmed ? 'oklch(65% 0.16 65)'
                             : paper.ink50,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'color 120ms, background 120ms',
                      }}>
                      <svg width={9} height={9} viewBox="0 0 9 9" aria-hidden="true">
                        <circle cx={4.5} cy={4.5} r={3.5}
                          fill={isRec ? 'currentColor' : 'none'}
                          stroke="currentColor" strokeWidth={1.5}/>
                      </svg>
                    </button>
                    {isArmed && (
                      <div
                        title={act
                          ? (inRange ? 'MIDI received — in range' : 'MIDI received — out of range or wrong channel')
                          : 'Armed — waiting for MIDI'}
                        style={{
                          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                          background: act
                            ? (inRange ? 'oklch(65% 0.20 145)' : 'oklch(70% 0.18 65)')
                            : paper.ink20,
                          boxShadow: act
                            ? (inRange ? '0 0 3px oklch(65% 0.20 145 / 0.7)' : '0 0 3px oklch(70% 0.18 65 / 0.7)')
                            : 'none',
                          transition: act ? 'none' : 'background 300ms, box-shadow 300ms',
                        }}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
            {focused && (
              <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                <ConfirmChip paper={paper}
                  onConfirm={() => eng.clearLane(l.id)} />
              </div>
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
          // not the smooth curve underneath.  Use per-lane phase when available.
          const lPhase = eng.lanePhases?.[l.id] ?? eng.phase;
          const raw = sampleLaneQuantized(l, lPhase);
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
          // Audit F-15: emphasise the focused lane's readout so the active
          // lane reads at a glance even when several lanes are running.
          const isFocus = l.id === eng.focus;
          return (
            <div key={l.id} style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              marginBottom: isFocus ? 6 : 3,
              opacity: isFocus ? 1 : 0.7,
            }}>
              <span style={{
                width: isFocus ? 9 : 7, height: isFocus ? 9 : 7,
                borderRadius: '50%', background: l.color, flexShrink: 0,
              }} />
              <span style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontStyle: 'italic',
                fontSize: isFocus ? 26 : 16, lineHeight: 1,
                fontWeight: isFocus ? 600 : 400,
                color: l.color,
                fontVariantNumeric: 'tabular-nums',
              }}>{val}</span>
            </div>
          );
        })}
        </div>
        </div>
      )}

      {/* Tab handle — mirrors JuceShapeWell's collapsed/open handle, but
          anchored to the RIGHT edge of the left panel instead of the left
          edge of the right panel. */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title={open ? 'Hide lane panel' : 'Show lane panel'}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: open ? 36 : '100%',
          background: paper.bgDeep, border: 'none',
          borderLeft: `1px solid ${paper.rule}`,
          boxShadow: `inset 2px 0 0 ${paper.rule}`,
          cursor: 'pointer',
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
          fontFamily: 'Inter Tight', fontSize: 11, letterSpacing: 2,
          color: paper.ink70, textTransform: 'uppercase',
          padding: '14px 2px',
        }}>{open ? '▸' : 'lanes ◂'}</button>
    </div>
  );
}

// Two-tap confirm pattern (audit F-10).  First tap arms the action and
// returns visible "armed" state for the host button to restyle (red border,
// "tap again" label).  Second tap within timeoutMs commits.  The armed
// state auto-clears after the timeout so an accidental first tap doesn't
// leave a dangerous button hot.
function useConfirmTap(action, timeoutMs = 1500) {
  const [armed, setArmed] = React.useState(false);
  const timerRef = React.useRef(null);
  React.useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);
  const onTap = React.useCallback(() => {
    if (armed) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setArmed(false);
      action();
    } else {
      setArmed(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setArmed(false);
        timerRef.current = null;
      }, timeoutMs);
    }
  }, [armed, action, timeoutMs]);
  return [armed, onTap];
}

// Top-bar Btn-style button that requires two taps to commit a destructive
// action.  Module-scope so React reconciles to the same DOM node across the
// 30 Hz phase-driven re-render flood (avoids the click-eating bug pattern).
function ConfirmBtn({ paper, onConfirm, label, armedLabel = 'Tap to confirm', title }) {
  const [armed, onTap] = useConfirmTap(onConfirm);
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onTap(); }}
      title={armed ? `${title || label} — tap again to confirm` : title || label}
      style={{
        padding: '4px 10px', height: 36,
        border: `1px solid ${armed ? 'oklch(52% 0.18 22)' : paper.rule}`,
        background: armed ? 'oklch(94% 0.04 25)' : 'transparent',
        color: armed ? 'oklch(40% 0.18 22)' : paper.ink70,
        borderRadius: 2, cursor: 'pointer',
        fontFamily: 'Inter Tight', fontSize: 11, letterSpacing: 0.5,
        textTransform: 'uppercase',
        position: 'relative', zIndex: 5,
      }}>{armed ? armedLabel : label}</button>
  );
}

// Lane-Clear chip variant (lane panel).  Same two-tap pattern, but styled
// as a chip and scoped to a single lane via the `onConfirm` prop closure.
function ConfirmChip({ paper, onConfirm, label = 'Clear', armedLabel = 'Tap again' }) {
  const [armed, onTap] = useConfirmTap(onConfirm);
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onTap(); }}
      style={{
        padding: '4px 8px', minHeight: 28,
        borderRadius: 2,
        border: `1px solid ${armed ? 'oklch(52% 0.18 22)' : paper.rule}`,
        background: armed ? 'oklch(94% 0.04 25)' : 'transparent',
        color: armed ? 'oklch(40% 0.18 22)' : paper.ink70,
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.5,
        textTransform: 'uppercase', cursor: 'pointer',
      }}>{armed ? armedLabel : label}</button>
  );
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
      width: 36, height: 36, border: `1px solid ${paper.rule}`,
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
      width: 36, height: 36,
      border: `1px solid ${active ? paper.amberInk : paper.rule}`,
      background: active ? paper.amberInk : paper.card,
      color: active ? paper.bg : paper.ink70,
      borderRadius: 2, cursor: 'pointer', padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', zIndex: 5,
    }}>
      {/* Tic-tac-toe hash grid — both axes at once */}
      <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round">
        <line x1={5}  y1={1}  x2={5}  y2={13} strokeWidth={1.5}/>
        <line x1={9}  y1={1}  x2={9}  y2={13} strokeWidth={1.5}/>
        <line x1={1}  y1={5}  x2={13} y2={5}  strokeWidth={1.5}/>
        <line x1={1}  y1={9}  x2={13} y2={9}  strokeWidth={1.5}/>
      </svg>
    </button>
  );
}

// Compact numeric pill — shows the current grid count between density steppers.
function CountPill({ value, paper }) {
  return (
    <div style={{
      minWidth: 32, height: 36, padding: '0 8px',
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
        padding: '4px 10px', height: 30, minWidth: 36,
        border: `1px solid ${active ? paper.amberInk : paper.rule}`,
        background: active ? paper.amberInk : paper.card,
        color: active ? paper.bg : paper.ink50,
        borderRadius: 2, cursor: 'pointer',
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontStyle: 'italic', fontSize: 13,
        position: 'relative', zIndex: 5,
      }}>{label}</button>
  );
}

// Editable decimal bitmask field for the scale panel.  Shows the current
// scaleMask as a 0..4095 integer and lets the user type a new value to set
// it directly — mirrors the native editor's mask entry.  Local draft state
// keeps the input editable while invalid; only commits on Enter / blur.
function ScaleMaskInput({ lane, updateLane, paper }) {
  const current = lane.scaleMask & 0xFFF;
  const [draft, setDraft] = React.useState(String(current));
  // Re-sync when the lane's mask changes from elsewhere (toggle, preset,
  // All/Invert/None) so the input doesn't get stuck on a stale value.
  React.useEffect(() => { setDraft(String(current)); }, [current]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 0xFFF && n !== current) {
      updateLane(lane.id, { scaleMask: n, scaleId: recognizeScaleId(n) });
    } else {
      setDraft(String(current));   // revert if invalid
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.4,
        color: paper.ink50, textTransform: 'uppercase',
      }}>Mask</span>
      <input type="text" value={draft}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { setDraft(String(current)); e.currentTarget.blur(); }
        }}
        onBlur={commit}
        style={{
          width: 64, padding: '3px 8px',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 13, fontVariantNumeric: 'tabular-nums',
          color: paper.ink, background: paper.bg,
          border: `1px solid ${paper.rule}`, borderRadius: 2,
          textAlign: 'right', outline: 'none',
        }} />
      <span style={{
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: 10, color: paper.ink50,
      }}>0x{current.toString(16).toUpperCase().padStart(3, '0')}</span>
    </div>
  );
}

function LockBtn({ axis, active, onClick, paper }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (onClick) onClick(e); }}
      title={`${axis} quantize ${active ? 'on (click to unlock)' : 'off (click to lock)'}`} style={{
      width: 36, height: 36, border: `1px solid ${active ? paper.amberInk : paper.rule}`,
      background: active ? paper.amberInk : 'transparent',
      color: active ? paper.bg : paper.ink50,
      borderRadius: 2, cursor: 'pointer', padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter Tight', fontSize: 11, letterSpacing: 0.5,
      gap: 3,
      position: 'relative', zIndex: 5,
    }}>
      {active ? (
        // Closed padlock — body + U-shackle arcing upward (sweep=1 = clockwise
        // in SVG y-down coords = visually upward from left arm to right arm)
        <svg width={14} height={16} viewBox="0 0 14 16" aria-hidden="true">
          <rect x={1} y={8} width={12} height={7} rx={1.5} fill="currentColor"/>
          <path d="M4 8 L4 5.5 A3 3 0 0 1 10 5.5 L10 8"
            fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        // Open padlock — right arm raised above body, clearly unlatched
        <svg width={14} height={16} viewBox="0 0 14 16" aria-hidden="true">
          <rect x={1} y={8} width={12} height={7} rx={1.5} fill="currentColor" opacity={0.55}/>
          <path d="M4 8 L4 5.5 A3 3 0 0 1 10 5.5 L10 1.5"
            fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
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
  // Note presets: finest (chromatic = every semitone) → coarsest (octave).
  const yNotePresets = [
    { label: 'chr', div: Math.min(127, noteSpan) },
    { label: '3rd', div: Math.max(2, Math.round(noteSpan / 4)) },
    { label: '5th', div: Math.max(2, Math.round(noteSpan / 7)) },
    { label: 'oct', div: Math.max(2, Math.round(noteSpan / 12)) },
  ];
  // Value presets: finest (24 steps) → coarsest (2 steps), top to bottom.
  const yValuePresets = [
    { label: '24', div: 24 },
    { label: '16', div: 16 },
    { label: '8',  div: 8 },
    { label: '4',  div: 4 },
    { label: '2',  div: 2 },
  ];
  const showPresets = true;
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
      <GridBtn axis="Y" denser={true}  paper={paper} onClick={() => setGridY(g => Math.min(24, g + 1))} />
      <CountPill value={gridY} paper={paper} />
      <GridBtn axis="Y" denser={false} paper={paper} onClick={() => setGridY(g => Math.max(2, g - 1))} />
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
      // Clip overflow so the right-side qurves/scale toggles can't spill past
      // the gutter when the X presets are showing on a narrow window.
      overflow: 'hidden',
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
        <GridBtn axis="X" denser={false} paper={paper} onClick={() => setGridX(g => Math.max(2, g - 1))} />
        <CountPill value={gridX} paper={paper} />
        <GridBtn axis="X" denser={true}  paper={paper} onClick={() => setGridX(g => Math.min(32, g + 1))} />
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
      {/* F-07: "qurves" renamed to "Shelf" — more descriptive.  Available
          regardless of lane type so users can browse/load at any time. */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setShelfOpen(!shelfOpen); }}
        title="Qurve library — save &amp; load curve shapes"
        style={{
          padding: '4px 10px', height: 28, marginRight: 6,
          background: shelfOpen ? paper.ink : paper.card,
          color: shelfOpen ? paper.bg : paper.ink50,
          border: `1px solid ${shelfOpen ? paper.ink : paper.rule}`,
          borderRadius: 2, cursor: 'pointer',
          fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1,
          textTransform: 'uppercase',
          position: 'relative', zIndex: 5,
        }}>{shelfOpen ? '▾ shelf' : '▸ shelf'}</button>
      {/* Scale panel button — shown for Note lanes.  When closed, shows the
          current recognised scale name so the user knows a scale is active
          without having to open the panel (F-07 discoverability). */}
      {focusLane?.target === 'Note' && (() => {
        const scaleName = (window.SCALES.find(s => s.id === focusLane.scaleId) || { name: 'Scale' }).name;
        return (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setScaleOpen(!scaleOpen); }}
            title="Scale / pitch-class set editor"
            style={{
              padding: '4px 12px', height: 28, marginRight: 8,
              background: scaleOpen ? paper.ink : paper.card,
              color: scaleOpen ? paper.bg : paper.ink50,
              border: `1px solid ${scaleOpen ? paper.ink : paper.rule}`,
              borderRadius: 2, cursor: 'pointer',
              fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1,
              textTransform: 'uppercase',
              position: 'relative', zIndex: 5,
            }}>{scaleOpen ? `▾ scale` : `▴ ${scaleName}`}</button>
        );
      })()}
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
  // Clamp the readout to stay inside the canvas vertically.  The huge
  // serif numerals (fontSize: 38) plus the small uppercase units below
  // total ~50 px; without this clamp, low values land near canvasH and
  // the text overflows the canvas's overflow:hidden into the X gutter
  // — which is what made the canvas appear to be "cut off by the gutter".
  // Audit F-25 dropped the font from 52 → 38 to reduce curve occlusion
  // (especially in Note mode where labels like "C♯-1" are wider).
  const READOUT_H = 50;
  const top = Math.max(4, Math.min(y - 22, canvasH - READOUT_H));
  return (
    <div style={{
      position: 'absolute',
      left: onLeft ? Math.max(4, x - 100) : x + 14,
      top,
      pointerEvents: 'none', zIndex: 5,
      lineHeight: 0.9,
    }}>
      <div style={{
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontSize: 38, fontStyle: 'italic',
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

// ── MIDI input recording ─────────────────────────────────────

// Convert raw MIDI events captured during recording to a Float32Array curve.
// For Note lanes: also returns midiNotes array for piano-roll display.
// For CC/AT/PB: step-interpolates between events.
function eventsToQurve(events, lane, loopSec) {
  const N = 256;
  const arr = new Float32Array(N).fill(0.5);
  if (events.length === 0) return { curve: null, notes: null };

  if (lane.target === 'Note') {
    const midiNotes = [];
    const stack = {}; // note# → { tNorm, vel }
    events.forEach(ev => {
      const tNorm = Math.min(1, ev.t / loopSec);
      if (ev.type === 'on') {
        stack[ev.note] = { tNorm, vel: ev.vel };
      } else if (ev.type === 'off' && stack[ev.note]) {
        const { tNorm: s, vel } = stack[ev.note];
        midiNotes.push({ note: ev.note, vel, start: s, end: tNorm });
        delete stack[ev.note];
      }
    });
    // Close any notes still open at loop end
    Object.entries(stack).forEach(([note, { tNorm: s, vel }]) => {
      midiNotes.push({ note: parseInt(note, 10), vel, start: s, end: 1 });
    });
    // Paint pitch curve using NaN as sentinel for gaps.
    // Gaps before the first note stay at 0.5 (center/silence);
    // gaps after a note hold that note's last value (monosynth hold behaviour).
    arr.fill(NaN);
    midiNotes.forEach(n => {
      const v = n.note / 127;
      const si = Math.max(0, Math.round(n.start * (N - 1)));
      const ei = Math.min(N - 1, Math.round(n.end * (N - 1)));
      for (let i = si; i <= ei; i++) arr[i] = v;
    });
    let lastVal = 0.5;
    for (let i = 0; i < N; i++) {
      if (isNaN(arr[i])) { arr[i] = lastVal; }
      else { lastVal = arr[i]; }
    }
    return { curve: arr, notes: midiNotes };
  }

  // CC / Aftertouch / PitchBend — step-hold between events
  const sorted = [...events].sort((a, b) => a.t - b.t);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * loopSec;
    while (j < sorted.length - 1 && sorted[j + 1].t <= t) j++;
    arr[i] = sorted[j].v;
  }
  return { curve: arr, notes: null };
}

// useMidiRecorder — manages MIDI recording with an ARM / REC workflow.
//
// Workflow:
//   1. Click ARM on a lane  → arms that lane (only one lane armed at a time).
//   2. Click REC in the transport → starts capturing MIDI for the armed lane.
//   3. Click REC again → stops capture, runs eventsToQurve, updates the lane curve.
//
// Two MIDI sources:
//   Web MIDI mode  — browser / Chrome / Edge: navigator.requestMIDIAccess.
//   JUCE mode      — WKWebView: C++ buffers incoming MIDI; bridge emits "midiIn"
//                    events via eng.setMidiInHandler (wired in main.jsx patchEngine).
//
// Live preview:
//   During recording of a Note lane, liveRecRef tracks in-progress notes so
//   PianoRollOverlay can render them before eventsToQurve runs.
//   A 100 ms interval keeps the display current while notes are held.
function useMidiRecorder(eng) {
  const isJuceMode = typeof window.__JUCE__ !== 'undefined';

  // ── Web MIDI access ────────────────────────────────────────────────────────
  const [access, setAccess]   = React.useState(null);
  const [inputs, setInputs]   = React.useState([]);
  const [inputId, setInputId] = React.useState(null);

  // ── ARM / REC state ────────────────────────────────────────────────────────
  // armedLane: which lane will record when REC is pressed (null = none).
  // isRecording: capture is actively running.
  const [armedLane, setArmedLaneState] = React.useState(null);
  const [isRecording, setIsRecording]  = React.useState(false);
  const armedLaneRef  = React.useRef(null);
  const isRecordingRef = React.useRef(false);
  // NOTE: the refs below are also updated synchronously in the ARM/start/stop
  // functions so processMidiBytes always sees the current value without waiting
  // for a React effect to fire (effects run after paint — that's too late when
  // JUCE's 30 Hz timer fires between the click and the next render).
  React.useEffect(() => { armedLaneRef.current  = armedLane;   }, [armedLane]);
  React.useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // ── Raw event accumulator ──────────────────────────────────────────────────
  // eventsRef: raw events accumulated during capture, converted on stop.
  const eventsRef = React.useRef(null);  // { startMs, events[] } | null

  // ── Live note preview ──────────────────────────────────────────────────────
  // liveRecRef: {active: {noteNum→{vel,tStart}}, done:[{note,vel,tStart,tEnd}]}
  // Updated synchronously on each MIDI event; read by PianoRollOverlay via ref.
  const liveRecRef = React.useRef({ active: {}, done: [] });
  // liveRecTick bumps every 100 ms while recording so the overlay re-renders.
  const [liveRecTick, setLiveRecTick] = React.useState(0);
  React.useEffect(() => {
    if (!isRecording) { liveRecRef.current = { active: {}, done: [] }; return; }
    const id = setInterval(() => setLiveRecTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, [isRecording]);

  // ── MIDI activity indicator ────────────────────────────────────────────────
  // midiActivity: { tick, inRange } — updated on every incoming MIDI event
  // before channel/range filtering so the indicator lights up for ALL messages
  // (including out-of-range notes, which are the most useful to flag).
  const [midiActivity, setMidiActivity] = React.useState({ tick: 0, inRange: true });
  const midiActivityTimerRef = React.useRef(null);

  const engRef = React.useRef(eng);
  React.useEffect(() => { engRef.current = eng; }, [eng]);

  // ── Web MIDI: request access ───────────────────────────────────────────────
  React.useEffect(() => {
    if (isJuceMode) return;
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then(acc => {
      const refresh = () => {
        const ins = [...acc.inputs.values()];
        setInputs(ins);
        if (ins.length === 1) setInputId(ins[0].id);
      };
      setAccess(acc);
      refresh();
      acc.onstatechange = refresh;
    }).catch(() => {});
  }, [isJuceMode]);

  // ── Shared MIDI processor ──────────────────────────────────────────────────
  // recMs: milliseconds since recording started, supplied by C++ audio thread.
  //   • In JUCE mode this value is accurate (stamped in processBlock) so note
  //     positions are correct even if the 30 Hz drain timer fires irregularly.
  //   • In Web MIDI mode recMs is undefined; we fall back to performance.now().
  const processMidiBytes = React.useCallback((laneId, status, d1, d2, recMs) => {
    // Indicator fires whenever the lane is ARMED, regardless of recording state.
    // This lets the user verify MIDI is flowing before pressing REC.
    if (armedLaneRef.current !== laneId) return;

    const lane = engRef.current.lanes.find(l => l.id === laneId);
    if (!lane) return;
    const ch   = (status & 0x0F) + 1;
    const type =  status & 0xF0;

    // ── MIDI activity indicator ──────────────────────────────────────────────
    // Green = note in range on any channel.
    // Amber = note received but out of range or on a different channel than the
    //         lane's configured output channel (the user may want to adjust the
    //         lane's channel or range setting).
    let inRange = true;
    if (type === 0x90 && d2 > 0 && lane.target === 'Note') {
      const lo = Math.round(lane.rangeMin * 127);
      const hi = Math.round(lane.rangeMax * 127);
      inRange = d1 >= lo && d1 <= hi;
    }
    // Channel mismatch counts as "out of range" for the indicator only —
    // the note is still captured (see below).
    if (lane.channel !== ch) inRange = false;
    if (midiActivityTimerRef.current) clearTimeout(midiActivityTimerRef.current);
    setMidiActivity(prev => ({ tick: prev.tick + 1, inRange }));
    midiActivityTimerRef.current = setTimeout(() =>
      setMidiActivity(prev => ({ ...prev, tick: 0 })), 300);

    // ── Capture (only while actively recording) ──────────────────────────────
    if (!isRecordingRef.current) return;
    const rec = eventsRef.current;
    if (!rec) return;

    // Use C++ timestamp when available (JUCE mode); fall back to JS wall-clock.
    // The C++ timestamp is stamped in processBlock — it stays accurate even when
    // the JS 30 Hz timer fires late or sends a burst of queued events at once.
    const t = (recMs !== undefined && recMs >= 0)
      ? recMs / 1000
      : (performance.now() - rec.startMs) / 1000;

    // Accept MIDI from any channel during recording — the per-lane channel
    // setting governs playback output, not input capture.
    if (lane.target === 'CC' && type === 0xB0 && d1 === lane.targetDetail) {
      rec.events.push({ t, v: d2 / 127 });
    } else if (lane.target === 'Aftertouch' && type === 0xD0) {
      rec.events.push({ t, v: d1 / 127 });
    } else if (lane.target === 'PitchBend' && type === 0xE0) {
      rec.events.push({ t, v: ((d2 << 7) | d1) / 16383 });
    } else if (lane.target === 'Note') {
      if (type === 0x90 && d2 > 0) {
        rec.events.push({ t, note: d1, vel: d2, type: 'on' });
        // Live preview: open a new active note
        liveRecRef.current.active[d1] = { vel: d2, tStart: t };
        setLiveRecTick(n => n + 1);
      } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
        rec.events.push({ t, note: d1, type: 'off' });
        // Live preview: finalise the note
        const open = liveRecRef.current.active[d1];
        if (open) {
          liveRecRef.current.done.push({ note: d1, vel: open.vel, tStart: open.tStart, tEnd: t });
          delete liveRecRef.current.active[d1];
          setLiveRecTick(n => n + 1);
        }
      }
    }
  }, []);

  // ── Web MIDI: attach handler on port change ────────────────────────────────
  React.useEffect(() => {
    if (isJuceMode || !access || !inputId) return;
    const port = access.inputs.get(inputId);
    if (!port) return;
    const handle = (msg) => {
      const data = msg.data;
      if (!data || data.length < 2) return;
      const lane = armedLaneRef.current;
      if (lane === null) return;
      processMidiBytes(lane, data[0], data[1], data[2] ?? 0);
      // No recMs in Web MIDI mode — processMidiBytes falls back to performance.now()
    };
    port.onmidimessage = handle;
    return () => { port.onmidimessage = null; };
  }, [isJuceMode, access, inputId, processMidiBytes]);

  // ── JUCE bridge: register midiIn handler ──────────────────────────────────
  React.useEffect(() => {
    if (!isJuceMode || !eng.setMidiInHandler) return;
    eng.setMidiInHandler(({ lane, status, data1, data2, ms }) => {
      // Pass C++ ms offset so processMidiBytes can use accurate timestamps.
      processMidiBytes(lane, status, data1, data2, ms);
    });
    return () => eng.setMidiInHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJuceMode, processMidiBytes]);

  // ── ARM a lane (toggle — clicking armed lane disarms) ─────────────────────
  const setArmedLane = React.useCallback((laneId) => {
    // Stop any active recording before re-arming
    if (isRecordingRef.current) stopRecording();
    const next = (armedLaneRef.current === laneId) ? null : laneId;
    armedLaneRef.current = next;  // sync update so processMidiBytes sees it immediately
    setArmedLaneState(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start / stop recording ─────────────────────────────────────────────────
  const startRecording = React.useCallback(() => {
    const lane = armedLaneRef.current;
    if (lane === null) return;
    eventsRef.current = { startMs: performance.now(), events: [] };
    liveRecRef.current = { active: {}, done: [] };
    isRecordingRef.current = true;  // sync update — don't wait for React effect
    setIsRecording(true);
    if (isJuceMode && engRef.current.beginRecord) engRef.current.beginRecord(lane);
  }, [isJuceMode]);

  const stopRecording = React.useCallback(() => {
    const lane = armedLaneRef.current;
    isRecordingRef.current = false;  // sync update — blocks processMidiBytes immediately
    setIsRecording(false);
    if (isJuceMode && engRef.current.stopRecord) engRef.current.stopRecord();
    const rec = eventsRef.current;
    eventsRef.current = null;
    if (!rec || lane === null) return;
    const e = engRef.current;
    const laneObj = e.lanes.find(l => l.id === lane);
    if (!laneObj) return;
    // Map all recorded events proportionally to [0,1] using the actual
    // recording duration as the denominator.  Using the engine's loopSec
    // (beats*60/100, or 2/speed) mismaps events whenever the host BPM ≠ 100
    // or the user records for longer than one loop: timestamps past loopSec
    // are clamped to tNorm=1.0 and rendered at x=w (outside the SVG viewBox),
    // making those notes invisible in the committed overlay even though they
    // showed correctly in the live preview (which normalises to max tEnd).
    const totalDuration = Math.max(0.001, (performance.now() - rec.startMs) / 1000);
    const { curve, notes } = eventsToQurve(rec.events, laneObj, totalDuration);
    if (!curve) return;
    // setCurve updates React state AND sends the curve to the C++ engine
    // (updateLane with a 'curve' patch skips sendCurve, so C++ never learned
    // about the recorded data — the curve would revert on the next stateSnapshot).
    e.setCurve(lane, curve);
    // midiNotes is JS-only (piano-roll display), so patch it separately via
    // setLanes to avoid interfering with the sendParam loop in updateLane.
    if (notes !== null && notes.length > 0) {
      e.setLanes(prev => prev.map(l => l.id === lane ? { ...l, midiNotes: notes } : l));
    }
  }, [isJuceMode]);

  const toggleRecording = React.useCallback(() => {
    if (isRecordingRef.current) stopRecording(); else startRecording();
  }, [startRecording, stopRecording]);

  return {
    hasAccess: isJuceMode || !!access,
    inputs,
    inputId,
    setInputId,
    armedLane,
    setArmedLane,
    isRecording,
    toggleRecording,
    // For live note preview — ref + tick read by PianoRollOverlay
    liveRecRef,
    liveRecTick,   // changing value forces re-render of overlay consumers
    // MIDI activity indicator: { tick (0=idle/>0=active), inRange }
    midiActivity,
  };
}

// ── Piano-roll overlay ───────────────────────────────────────
// Renders recorded MIDI note events as translucent horizontal bars,
// using the lane's range to determine Y mapping — matching the curve canvas.
// Acts as onion skin when the user draws a new curve over a recorded pattern.
//
// Live preview: when liveRecRef + isRecording are provided, also renders
// in-progress notes (both completed and still-held) in real time at 100 ms
// resolution, before eventsToQurve runs at stop.
function PianoRollOverlay({ lane, w, h, liveRecRef, isRecording, liveRecTick }) {
  if (!lane) return null;
  const lo    = Math.round(lane.rangeMin * 127);
  const hi    = Math.round(lane.rangeMax * 127);
  const span  = Math.max(1, hi - lo);
  const rowH  = Math.max(3, Math.min(14, h / span));
  const color = lane.color || '#888';
  const noteToY = (note) => h * (1 - (note - lo) / span);

  // Committed notes from previous recording (onion skin)
  const committed = lane.midiNotes ?? [];

  // Live notes during active recording — read directly from mutable ref
  // so we avoid a full state copy for every 100 ms tick.
  const liveNotes = [];
  if (isRecording && liveRecRef?.current) {
    const live = liveRecRef.current;
    const now  = performance.now();
    // We need the recording start time to convert ms → seconds.
    // It's stored on eventsRef (via rec.startMs) but we can derive it from
    // done notes' tStart values, or just use the first entry's tStart.
    // Simpler: accept that we don't know startMs here and render durations
    // as-is using the done list (tStart/tEnd) and active notes clipped to 1.
    // We use tEnd - tStart proportional to loopSec — but we don't have loopSec here.
    // So we skip the fraction conversion for live notes and instead render them
    // relative to the MAXIMUM observed tEnd (or a rolling window).
    // NOTE: for the live preview we render positions using normalised t-values
    // capped to [0,1], which are pre-computed in stopRecording anyway.
    // For simplicity, we just show completed notes with tStart/tEnd as fractions
    // assuming a 1-second loop — this gives a relative picture, not exact.
    // The PianoRoll is just feedback; the real output comes from eventsToQurve.
    live.done.forEach(n => {
      liveNotes.push({ note: n.note, vel: n.vel, start: n.tStart, end: n.tEnd });
    });
    const maxT = Math.max(1, ...live.done.map(n => n.tEnd ?? 0),
                          ...Object.values(live.active).map(n => n.tStart));
    Object.entries(live.active).forEach(([noteStr, { vel, tStart }]) => {
      liveNotes.push({ note: parseInt(noteStr), vel, start: tStart, end: maxT });
    });
    // Suppress the liveRecTick dependency warning — we want re-renders on tick
    void liveRecTick;
  }

  if (!committed.length && !liveNotes.length) return null;

  // Scale factor: committed notes are already in [0,1] fractions.
  // Live notes are in seconds; normalise by the max time seen.
  const liveMax = liveNotes.length
    ? Math.max(1, ...liveNotes.map(n => n.end ?? n.start)) : 1;

  return (
    <svg width={w} height={h} style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
    }}>
      {/* Committed (onion skin) */}
      {committed.map((n, i) => (
        <rect key={`c${i}`}
          x={n.start * w}
          y={noteToY(n.note) - rowH / 2}
          width={Math.max(3, (n.end - n.start) * w)}
          height={rowH}
          fill={color}
          opacity={(n.vel / 127) * 0.28}
          rx={2}
        />
      ))}
      {/* Live — brighter while recording */}
      {liveNotes.map((n, i) => (
        <rect key={`l${i}`}
          x={(n.start / liveMax) * w}
          y={noteToY(n.note) - rowH / 2}
          width={Math.max(3, ((n.end - n.start) / liveMax) * w)}
          height={rowH}
          fill={color}
          opacity={Math.min(0.80, (n.vel / 127) * 0.65)}
          rx={2}
        />
      ))}
    </svg>
  );
}

// ── MIDI input selector ──────────────────────────────────────
// Shown in the top bar when Web MIDI API is available.
function MidiInputSelector({ recorder, paper }) {
  const { hasAccess, inputs, inputId, setInputId } = recorder;
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return null;

  const baseStyle = {
    height: 30, padding: '0 8px',
    background: paper.card, border: `1px solid ${paper.rule}`,
    borderRadius: 2, cursor: 'pointer', flexShrink: 0,
    fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.8,
    color: paper.ink70, display: 'flex', alignItems: 'center', gap: 5,
    textTransform: 'uppercase',
  };

  if (!hasAccess) return (
    <div style={{ ...baseStyle, color: paper.ink30 }}>
      <span style={{ fontSize: 8 }}>●</span> MIDI in
    </div>
  );

  if (inputs.length === 0) return (
    <div style={{ ...baseStyle, color: paper.ink30 }}>
      <span style={{ fontSize: 8 }}>●</span> No MIDI
    </div>
  );

  const activeColor = 'oklch(55% 0.17 25)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span style={{ fontSize: 8, color: inputId ? activeColor : paper.ink30 }}>●</span>
      <select
        value={inputId || ''}
        onChange={e => setInputId(e.target.value || null)}
        style={{
          height: 30, padding: '0 6px',
          background: paper.card, border: `1px solid ${paper.rule}`,
          borderRadius: 2, cursor: 'pointer',
          fontFamily: 'Inter Tight', fontSize: 10,
          color: paper.ink70, maxWidth: 130,
        }}
      >
        <option value="">— MIDI IN —</option>
        {inputs.map(inp => (
          <option key={inp.id} value={inp.id}>{inp.name}</option>
        ))}
      </select>
    </div>
  );
}

// ── Qurve shelf ──────────────────────────────────────────────
// Built-in demo curves shown before any user-saved entries.
const BUILTIN_QURVES = [
  { id: 'b0', name: 'slow arch',       target: 'CC',          curve: makeSineCurve(64, 0.5, 0.4,  0.8, 0) },
  { id: 'b1', name: 'fast zigzag',     target: 'CC',          curve: makeSineCurve(64, 0.5, 0.35, 3,   0) },
  { id: 'b2', name: 'pentatonic glide',target: 'Note',        curve: makeSineCurve(64, 0.5, 0.3,  1.5, Math.PI / 4) },
  { id: 'b3', name: 'breath swell',    target: 'Aftertouch',  curve: makeSineCurve(64, 0.4, 0.35, 0.6, Math.PI / 6) },
  { id: 'b4', name: 'stutter',         target: 'CC',          curve: makeSineCurve(64, 0.5, 0.45, 6,   0) },
];

// Library key — stored in localStorage as JSON.  curve is serialised as a
// regular Array (Float32Array isn't JSON-safe) and restored on load.
const LIBRARY_KEY = 'dq-library';

function loadLibrary() {
  try {
    const raw = localStorage?.getItem(LIBRARY_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map(q => ({
      ...q,
      curve: q.curve ? new Float32Array(q.curve) : null,
    }));
  } catch { return []; }
}

function persistLibrary(items) {
  try {
    localStorage?.setItem(LIBRARY_KEY, JSON.stringify(
      items.map(q => ({ ...q, curve: q.curve ? Array.from(q.curve) : null }))
    ));
  } catch { /* storage full or unavailable */ }
}

function QurveShelf({ eng, paper, focusLane }) {
  const [library, setLibraryRaw] = React.useState(loadLibrary);

  const setLibrary = React.useCallback((next) => {
    const arr = typeof next === 'function' ? next(library) : next;
    setLibraryRaw(arr);
    persistLibrary(arr);
  }, [library]);

  // Inline save flow
  const [saving, setSaving] = React.useState(false);
  const [saveName, setSaveName] = React.useState('');
  const nameRef = React.useRef(null);

  const canSave = !!focusLane?.curve;

  const startSave = () => {
    if (!canSave) return;
    const d = new Date();
    const date = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const auto = `${focusLane.target} ${date} ${hh}:${mm}`;
    setSaveName(auto);
    setSaving(true);
    setTimeout(() => { nameRef.current?.select(); }, 0);
  };

  const commitSave = () => {
    if (!focusLane?.curve) { setSaving(false); return; }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: saveName.trim() || 'Untitled',
      target: focusLane.target,
      curve: focusLane.curve,
      quantizeX: focusLane.quantizeX,
      quantizeY: focusLane.quantizeY,
      xDivisions: focusLane.xDivisions,
      yDivisions: focusLane.yDivisions,
      rangeMin: focusLane.rangeMin,
      rangeMax: focusLane.rangeMax,
      scaleId: focusLane.scaleId,
      scaleRoot: focusLane.scaleRoot,
      scaleMask: focusLane.scaleMask,
      // midiNotes is JS-only (piano-roll display) but worth persisting so the
      // onion-skin overlay stays visible after the qurve is reloaded from the library.
      midiNotes: focusLane.midiNotes ?? null,
    };
    setLibrary(prev => [...prev, entry]);
    setSaving(false);
    setSaveName('');
  };

  const deleteItem = React.useCallback((id) => {
    setLibrary(prev => prev.filter(q => q.id !== id));
  }, [setLibrary]);

  const allItems = [...BUILTIN_QURVES, ...library];

  return (
    <div style={{
      height: '100%', padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{
          fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 1.5,
          color: paper.ink50, textTransform: 'uppercase',
        }}>Qurve Library</div>
        <div style={{ flex: 1 }} />
        {saving ? (
          <>
            <input
              ref={nameRef}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitSave();
                if (e.key === 'Escape') { setSaving(false); setSaveName(''); }
              }}
              placeholder="Name…"
              style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontStyle: 'italic', fontSize: 13,
                border: `1px solid ${paper.amber}`, borderRadius: 2,
                background: paper.card, color: paper.ink,
                padding: '3px 8px', width: 150, outline: 'none',
              }}
            />
            <Btn paper={paper} small tone="active" onClick={commitSave}>Save</Btn>
            <Btn paper={paper} small onClick={() => { setSaving(false); setSaveName(''); }}>✕</Btn>
          </>
        ) : (
          <Btn paper={paper} small
            tone={canSave ? 'active' : undefined}
            onClick={startSave}
            title={canSave ? 'Save current curve to library' : 'Draw a curve first'}
            style={{ opacity: canSave ? 1 : 0.4 }}
          >Save current +</Btn>
        )}
      </div>

      {/* Card row */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {allItems.map(q => (
          <QurveCard
            key={q.id}
            q={q}
            paper={paper}
            focusLane={focusLane}
            onLoad={() => {
              // setCurve sends the curve data to C++ (updateLane skips sendCurve).
              eng.setCurve(eng.focus, q.curve);
              // Remaining fields: send APVTS params via updateLane; midiNotes is
              // JS-only (piano-roll overlay) so it's handled silently by updateLane.
              const patch = {};
              if (q.quantizeX != null)  patch.quantizeX  = q.quantizeX;
              if (q.quantizeY != null)  patch.quantizeY  = q.quantizeY;
              if (q.xDivisions != null) patch.xDivisions = q.xDivisions;
              if (q.yDivisions != null) patch.yDivisions = q.yDivisions;
              if (q.rangeMin   != null) patch.rangeMin   = q.rangeMin;
              if (q.rangeMax   != null) patch.rangeMax   = q.rangeMax;
              if (q.scaleId    != null) patch.scaleId    = q.scaleId;
              if (q.scaleRoot  != null) patch.scaleRoot  = q.scaleRoot;
              if (q.scaleMask  != null) patch.scaleMask  = q.scaleMask;
              if (q.midiNotes  != null) patch.midiNotes  = q.midiNotes;
              if (Object.keys(patch).length > 0) eng.updateLane(eng.focus, patch);
            }}
            onDelete={q.id.startsWith('b') ? null : () => deleteItem(q.id)}
          />
        ))}
      </div>
    </div>
  );
}

function QurveCard({ q, paper, focusLane, onLoad, onDelete }) {
  const [pendingDelete, setPendingDelete] = React.useState(false);

  // Auto-cancel confirm after 2 s
  React.useEffect(() => {
    if (!pendingDelete) return;
    const t = setTimeout(() => setPendingDelete(false), 2000);
    return () => clearTimeout(t);
  }, [pendingDelete]);

  return (
    <div
      onClick={onLoad}
      style={{
        flexShrink: 0, width: 110, height: 90,
        background: paper.card,
        border: `1px solid ${paper.rule}`,
        borderRadius: 2, cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', padding: '6px 6px 4px',
        gap: 4, position: 'relative',
      }}
    >
      <svg width={98} height={50} style={{ flex: 1 }}>
        <CurvePath curve={q.curve} w={98} h={50}
          stroke={focusLane?.color || paper.laneInk}
          opacity={0.7} width={1.5} />
      </svg>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontStyle: 'italic', fontSize: 12, color: paper.ink,
          lineHeight: 1, overflow: 'hidden', whiteSpace: 'nowrap', flex: 1,
        }}>{q.name}</div>
        {onDelete && (
          pendingDelete ? (
            <span
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{
                fontSize: 9, color: paper.laneRose, fontFamily: 'Inter Tight',
                cursor: 'pointer', flexShrink: 0, letterSpacing: 0.3,
              }}
            >del?</span>
          ) : (
            <span
              onClick={e => { e.stopPropagation(); setPendingDelete(true); }}
              style={{
                fontSize: 11, color: paper.ink30, fontFamily: 'Inter Tight',
                cursor: 'pointer', flexShrink: 0, lineHeight: 1,
              }}
            >×</span>
          )
        )}
      </div>
      {/* Bottom meta row: target + compact grid summary */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontFamily: 'Inter Tight', fontSize: 9, letterSpacing: 0.6,
        color: paper.ink50, textTransform: 'uppercase',
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        <span>{q.target}</span>
        {(q.quantizeX || q.quantizeY) && (
          <span style={{ color: paper.amber, letterSpacing: 0 }}>
            {q.quantizeX ? `×${q.xDivisions}` : ''}
            {q.quantizeX && q.quantizeY ? '·' : ''}
            {q.quantizeY ? `÷${q.yDivisions}` : ''}
          </span>
        )}
        {q.rangeMin != null && q.rangeMax != null && (
          <span style={{ color: paper.ink30 }}>
            {Math.round(q.rangeMin * 100)}–{Math.round(q.rangeMax * 100)}%
          </span>
        )}
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

      {/* Spacer pushes the connection indicator to the right edge. */}
      <div style={{ flex: 1 }} />

      {/* Audit F-12 / F-19: bridge connection indicator.  ●  host = JUCE
          WebView with bridge active; ○  standalone = no JUCE host (file://
          preview or webapp).  Live-derived from window.__JUCE__, not
          plumbed through the engine, so the indicator works everywhere
          the bundle runs. */}
      <BridgeStatus paper={paper} />
    </div>
  );
}

// Connection-status pill rendered in the bottom bar.  Module-scope so it
// reconciles to a stable DOM node across phase-driven re-renders, and
// re-checks window.__JUCE__ on a 2 s heartbeat (covers the unlikely case
// of the bridge being injected after first paint).
function BridgeStatus({ paper }) {
  const [connected, setConnected] = React.useState(
    () => typeof window !== 'undefined' && typeof window.__JUCE__ !== 'undefined');
  React.useEffect(() => {
    const id = setInterval(() => {
      const next = typeof window !== 'undefined' && typeof window.__JUCE__ !== 'undefined';
      setConnected(prev => prev === next ? prev : next);
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <span title={connected ? 'JUCE host connected' : 'Standalone (no JUCE bridge)'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'Inter Tight', fontSize: 10, letterSpacing: 0.8,
        color: paper.ink50, textTransform: 'uppercase',
      }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: connected ? 'oklch(72% 0.15 145)' : 'transparent',
        border: `1.5px solid ${connected ? 'oklch(50% 0.15 145)' : paper.ink30}`,
        boxSizing: 'border-box',
      }} />
      <span>{connected ? 'host' : 'standalone'}</span>
    </span>
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

// ── Help overlay — quick reference ───────────────────────────
// Port of the native editor's HelpOverlay (PluginEditor.cpp).
// Full-screen semi-transparent backdrop + centred card.
// Dismiss: tap backdrop, press Escape, or press ?.
// Module-scope so React keeps stable identity across phase-driven re-renders.
function HelpOverlay({ paper, onClose }) {
  const entries = [
    ['DRAW',
     'Draw a curve on the canvas. Left → right = time (0–100%). Bottom → top = value (min → max output).'],
    ['PLAY / PAUSE',
     'Tap a direction segment (◀ ⟷ ▶) to select direction; tap the active segment again to pause/resume.'],
    ['LANES',
     'Each lane = independent MIDI stream. Tap a lane row in the right panel to focus it. Coloured dots = live playheads.'],
    ['+ (Add lane)',
     'Add a lane (up to 4). Each lane has its own curve, routing, grid and quantization.'],
    ['SHAPE PANEL',
     'Left panel: output type (CC / Aftertouch / PitchBend / Note), CC#, channel, velocity, smoothing, output range.'],
    ['MUTE',
     'Silences a lane without erasing its curve. Hollow dot + strikethrough in the lane panel.'],
    ['MIDI RECORD',
     'When a MIDI input is connected (select it in the top bar), each lane shows a ⏺ record button. '
     + 'Press ⏺ to start capturing — the lane listens only to its message type and channel. '
     + 'Press again to stop and convert to a curve. Note lanes also store note events as a piano-roll '
     + 'overlay (visible as translucent bars on the canvas), which acts as an onion skin when redrawing.'],
    ['SCALE',
     'Note lanes only. Tap the ▴ Scale button (bottom of canvas, right side) to open the scale editor. '
     + 'Tap pitch-class circles to toggle; double-tap to set root. Pick a preset or type a decimal mask (0–4095).'],
    ['SHELF',
     'Curve library — ▸ Shelf button. Browse saved shapes and tap to load onto the focused lane.'],
    ['FREE / SYNC',
     'Free = manual speed (×0.25–×4). Sync = loop length in host beats (1–32). '
     + 'The slider controls speed in Free mode and beat count in Sync mode.'],
    ['GRID',
     'Y-gutter buttons adjust vertical grid density; X-gutter adjusts horizontal. '
     + 'Lock padlock (🔒) snaps playback phase (X) or output value (Y) to grid steps — visible as a dashed staircase.'],
    ['SMOOTH',
     'Per-lane output smoothing 0–1. 0 = instant response. Bypassed for pitch-change detection in Note mode.'],
    ['RANGE',
     'Per-lane output min/max. Drag the filled band to transpose; spread handles to expand. '
     + 'In Note mode, displays note names (e.g. C3–G5).'],
    ['CLEAR',
     'Erase all curves and stop playback. Requires a second tap to confirm.'],
    ['! (Panic)',
     'All Notes Off on every MIDI channel. Use if notes get stuck.'],
    ['Space',
     'Toggle play / pause (keyboard shortcut). Ignored when a text field has focus.'],
    ['1 – 4',
     'Select lane 1–4 (keyboard shortcut). Ignored when a text field has focus.'],
    ['? / Escape',
     'Open or close this reference. You are here.'],
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'oklch(20% 0.01 60 / 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      {/* Card — stop propagation so clicks inside don't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: paper.card,
          border: `1px solid ${paper.rule}`,
          borderRadius: 6,
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          padding: '24px 28px',
          maxWidth: 640, width: '92%',
          maxHeight: '88vh', overflowY: 'auto',
        }}
      >
        {/* Title row */}
        <div style={{
          display: 'flex', alignItems: 'baseline',
          justifyContent: 'space-between', marginBottom: 20,
        }}>
          <div style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontStyle: 'italic', fontSize: 22, color: paper.ink,
          }}>DrawnQurve · Quick Reference</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            cursor: 'pointer', fontSize: 18, color: paper.ink50,
            padding: '0 4px', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Entry table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(([label, desc]) => (
            <div key={label} style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: 12, alignItems: 'baseline',
            }}>
              <div style={{
                fontFamily: 'Inter Tight', fontSize: 10,
                fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                color: paper.amberInk, textAlign: 'right',
                paddingTop: 2,
              }}>{label}</div>
              <div style={{
                fontFamily: 'Inter Tight', fontSize: 12,
                color: paper.ink70, lineHeight: 1.55,
              }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 20, paddingTop: 14,
          borderTop: `1px dashed ${paper.rule}`,
          fontFamily: 'Inter Tight', fontSize: 10,
          color: paper.ink30, letterSpacing: 0.8, textAlign: 'center',
          textTransform: 'uppercase',
        }}>Tap outside · press ? · press Escape to close</div>
      </div>
    </div>
  );
}

Object.assign(window, { JuceIPadStudio, QurveShelf, PianoRollOverlay, MidiInputSelector, DiscoveryChip, HelpOverlay });
