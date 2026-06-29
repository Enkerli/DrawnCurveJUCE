// juce-bridge.js — wires React state to JUCE's WebBrowserComponent native integration.
//
// JUCE 8 bridge API:
//   C++ → JS:  webBrowser.emitEventIfBrowserIsVisible("eventId", juceVar)
//              received as: window.__JUCE__.backend.addEventListener("eventId", cb)
//   JS → C++:  window.__JUCE__.backend.emitEvent("eventId", data)
//              handled by: Options::withEventListener("eventId", nativeCb)
//
// Run-without-JUCE:  all juceEmit() calls are no-ops; juceOn() callbacks never fire.
// The UI runs in demo/animation mode just like the design prototype.

// ── Bridge primitives ─────────────────────────────────────────────────────────

function juceEmit(eventId, data) {
  if (typeof window.__JUCE__ !== 'undefined' && window.__JUCE__.backend)
    window.__JUCE__.backend.emitEvent(eventId, data);
}

function juceOn(eventId, cb) {
  if (typeof window.__JUCE__ !== 'undefined' && window.__JUCE__.backend)
    window.__JUCE__.backend.addEventListener(eventId, cb);
}

// Mirror console.log/warn/error to C++ stdout via a 'log' event.  This is
// the only reliable way to read JS diagnostics inside the JUCE WKWebView,
// since console output otherwise vanishes into the WebContent subprocess.
if (typeof window !== 'undefined' && !window.__juceLogPatched) {
  window.__juceLogPatched = true;
  for (const level of ['log', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      try {
        const msg = args.map(a => {
          if (a == null) return String(a);
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch { return String(a); }
          }
          return String(a);
        }).join(' ');
        juceEmit('log', { level, msg });
      } catch {}
    };
  }
}

// ── Parameter ID helpers (must match laneParam() in PluginProcessor.h) ────────

function laneParamId(lane, key) { return `l${lane}_${key}`; }

// ── Curve serialisation ───────────────────────────────────────────────────────

function arrayToF32(arr) {
  const f = new Float32Array(256);
  if (Array.isArray(arr)) for (let i = 0; i < 256; i++) f[i] = arr[i] ?? 0.5;
  return f;
}

function f32ToArray(f) {
  if (!f) return null;
  const a = new Array(f.length);
  for (let i = 0; i < f.length; i++) a[i] = f[i];
  return a;
}

// ── Lane field ↔ APVTS param mapping ─────────────────────────────────────────
// Each entry: [reactField, paramSuffix, rawToReact, reactToRaw]
// LANE_MAP: [reactField, paramSuffix, rawToReact, reactToRaw]
//
// rawToReact  — converts APVTS raw value  → React state value.
//               JUCE delivers ACTUAL values (not 0-1 normalised):
//                 AudioParameterChoice → choice index (0,1,2,3)
//                 AudioParameterInt    → integer in its declared range
//                 AudioParameterFloat  → float in its declared range (0-1 for smooth/range)
//
// reactToRaw  — converts React state value → normalised 0-1 value for
//               AudioProcessorParameter::setValueNotifyingHost().
const LANE_MAP = [
  ['target',      'msgType',
   v => ['CC','Aftertouch','PitchBend','Note'][Math.round(v)] ?? 'CC',  // raw: index 0-3
   v => (['CC','Aftertouch','PitchBend','Note'].indexOf(v)) / 3],
  ['targetDetail','ccNumber',    v => Math.round(v),          v => v / 127],    // raw: 0-127
  ['channel',     'midiChannel', v => Math.round(v),          v => (v - 1) / 15], // raw: 1-16
  ['smooth',      'smoothing',   v => v,                      v => v],           // raw: 0-1
  ['rangeMin',    'minOutput',   v => v,                      v => v],           // raw: 0-1
  ['rangeMax',    'maxOutput',   v => v,                      v => v],           // raw: 0-1
  ['velocity',    'noteVelocity',v => Math.round(v),          v => v / 127],    // raw: 1-127
  // Playback behaviour — loop mode and legato tie.
  ['oneShot',     'loopMode',    v => v > 0.5,                v => v ? 1.0 : 0.0],   // raw: 0=loop, 1=one-shot
  ['legato',      'legatoMode',  v => v > 0.5,                v => v ? 1.0 : 0.0],   // raw: 0/1 (Note mode only)
  // Phase offset — curve lookup start point.  APVTS stores 0–100 (percent);
  // JS stores the same 0–100 value.  Normalise to 0-1 for setValueNotifyingHost.
  ['phaseOffset', 'phaseOffset', v => v,                      v => v / 100],         // raw: 0-100
  // Quantization — per-lane bool/int params used by the audio engine.
  ['quantizeX',   'xQuantize',   v => v > 0.5,                v => v ? 1.0 : 0.0],   // raw: 0/1
  ['quantizeY',   'yQuantize',   v => v > 0.5,                v => v ? 1.0 : 0.0],   // raw: 0/1
  ['xDivisions',  'xDivisions',  v => Math.round(v),          v => (v - 2) / 30],    // raw: 2-32
  ['yDivisions',  'yDivisions',  v => Math.round(v),          v => (v - 2) / 22],    // raw: 2-24
  // Scale quantization — now per-lane (l<n>_scaleRoot, l<n>_scaleMask).
  // Moved from GLOBAL_PARAM_MAP; each lane can target an independent scale.
  ['scaleRoot',   'scaleRoot',   v => Math.round(v),          v => v / 11],          // raw: 0-11
  ['scaleMask',   'scaleMask',   v => Math.round(v),          v => v / 4095],        // raw: 0-4095
  // Per-lane playback overrides (exposed via "Override Transport" toggle in shape well).
  // useGlobalPlayback defaults true — lanes follow global transport until overridden.
  ['useGlobalPlayback', 'useGlobalPlayback', v => v > 0.5,   v => v ? 1.0 : 0.0],   // raw: bool
  // laneDirection: APVTS choice index 0/1/2; stored as 'fwd'/'rev'/'pp' in React.
  ['laneDirection', 'laneDirection',
   v => (['fwd','rev','pp'])[Math.round(v)] ?? 'fwd',         // raw: 0/1/2
   v => ['fwd','rev','pp'].indexOf(v) / 2],                   // normalised to 0-1
  // laneSpeedMul: range 0.1–10.0, skew 0.5.  Normalised via JUCE's convertTo0to1:
  //   convertTo0to1(v) = proportion ^ skew   where proportion = (v - start) / range
  //   = ((v - 0.1) / 9.9) ^ 0.5   (square root, NOT square)
  // Note: convertFrom0to1 uses ^ (1/skew) = ^ 2 — the INVERSE formula.
  // Using ^ 2 here would send values through convertFrom0to1 twice and collapse
  // everything to near 0.1 (the minimum), which is the "snaps to 0.10×" bug.
  ['laneSpeedMul', 'laneSpeedMul',
   v => v,                                                     // raw: actual value (0.1-10.0)
   v => Math.pow(Math.max(0, (v - 0.1) / 9.9), 0.5)],        // normalised: sqrt = ^ skew (skew=0.5)
];

// ── Global APVTS params ───────────────────────────────────────────────────────
// Previously, scaleRoot/scaleMask lived here as single shared params.  They are
// now per-lane (l<n>_scaleRoot / l<n>_scaleMask) and live in LANE_MAP above.
// GLOBAL_PARAM_MAP is kept as an empty table so sendParam()'s findGlobal() call
// compiles without changes.  If a genuinely global param (no lane prefix) is
// ever needed again, add it here.
//
// IMPORTANT: keep in sync with PluginProcessor.cpp ParamID declarations.
// Per-lane param treated as global → lane 0 stomps every lane.
// Global param treated as per-lane → silent no-op (getParameter("l0_x") → null).
const GLOBAL_PARAM_MAP = [
  // (empty — all React lane fields now map to per-lane l<n>_... APVTS params)
];

function findGlobal(field) {
  return GLOBAL_PARAM_MAP.find(([f]) => f === field) || null;
}
function findGlobalById(paramId) {
  return GLOBAL_PARAM_MAP.find(([, id]) => id === paramId) || null;
}

// ── Main initialiser ──────────────────────────────────────────────────────────
// Call once from inside the patched useDrawnQurveEngine hook.
// onEvent(action) is called for every incoming JUCE event.

export function initJuceBridge(onEvent) {

  // Full state snapshot sent by C++ when UI first loads
  juceOn('stateSnapshot', (snap) => {
    if (snap.lanes) {
      // C++ doesn't (and shouldn't) know about visual lane palette — hydrate
      // colour and display name from window.LANES, falling back gracefully if
      // the snapshot has more lanes than the palette defines.
      const palette = window.LANES || [];
      const lanes = snap.lanes.map(l => {
        const fallback = palette[l.id] || palette[l.id % (palette.length || 1)] || {};
        // Derive scaleId from scaleMask so the scale picker and name label
        // stay correct even though C++ doesn't track this JS-only field.
        const mask = typeof l.scaleMask === 'number' ? l.scaleMask : 0xFFF;
        const scaleId = window.recognizeScaleId ? window.recognizeScaleId(mask) : 'custom';
        return {
          ...l,
          color: l.color ?? fallback.color,
          name:  l.name  ?? fallback.name ?? `Lane ${l.id + 1}`,
          dash:  fallback.dash ?? '0',
          curve: l.curve ? arrayToF32(l.curve) : null,
          scaleId,
        };
      });
      onEvent({ type: 'setLanes', lanes });
    }
    // Note: do NOT seed jucePhase from the snapshot. The snapshot fires once
    // at startup with phase=0; if we set it here, the engine's `jucePhase ?? demo.phase`
    // fallback never fires demo.phase again, freezing the playhead in standalone
    // builds where the JUCE timer doesn't actually advance phase between events.
    // Phase is exclusively driven by the live 'phase' heartbeat below.
    if (snap.playing   !== undefined) onEvent({ type: 'setPlaying',   playing: snap.playing });
    if (snap.direction !== undefined) onEvent({ type: 'setDirection', direction: snap.direction });
    if (snap.focus     !== undefined) onEvent({ type: 'setFocus',     focus: snap.focus });
    if (snap.syncOn    !== undefined) onEvent({ type: 'setSyncOn',    syncOn: snap.syncOn });
    if (snap.beats     !== undefined) onEvent({ type: 'setBeats',     beats: snap.beats });
    if (snap.speed     !== undefined) onEvent({ type: 'setSpeed',     speed: snap.speed });
    if (snap.activeLaneCount !== undefined)
      onEvent({ type: 'setActiveLaneCount', count: snap.activeLaneCount });
  });

  // Playhead phase — C++ sends at ~30 Hz from a juce::Timer.
  // `lanes` is an optional array of per-lane phases (indexed by lane id) that
  // enables each lane's CurvePath to show its own independent playhead when
  // override-transport is active.
  // `playing` mirrors the engine's _isPlaying flag so JS can pause its demo
  // RAF loop when the host transport stops, preventing the "keeps looping"
  // symptom where the demo loop takes over after JUCE stops emitting phase.
  juceOn('phase', ({ phase, lanes: lanePhases, playing }) =>
    onEvent({ type: 'setPhase', phase, lanePhases: lanePhases ?? null, playing }));

  // Incoming MIDI captured by the audio thread while a lane is armed for
  // recording.  JS recorder accumulates these and converts them to a curve.
  juceOn('midiIn', ({ lane, status, data1, data2 }) =>
    onEvent({ type: 'midiIn', lane, status, data1, data2 }));

  // Single APVTS parameter changed
  juceOn('paramChange', ({ id, value }) => onEvent({ type: 'paramChange', id, value }));

  // Curve data for one lane
  juceOn('curveData', ({ lane, data }) =>
    onEvent({ type: 'curveData', lane, curve: data ? arrayToF32(data) : null }));

  // Tell C++ we're ready — it will reply with stateSnapshot
  juceEmit('uiReady', {});
}

// ── JS → C++ senders (call from UI event handlers) ───────────────────────────

// Send an actual-domain value for a global APVTS parameter and let the C++
// side normalise via the parameter's own range (handles skew factors that
// would otherwise need to be duplicated on the JS side — playbackSpeed in
// particular has skew=0.5 which is awkward to invert in JavaScript).
export function sendGlobalActual(paramId, actualValue) {
  juceEmit('setParamActual', { id: paramId, value: actualValue });
}

export function sendParam(lane, field, value) {
  // All params are now per-lane — look up in LANE_MAP by React field name and
  // emit as l<lane>_<suffix> with the normalised (0-1) value.
  // GLOBAL_PARAM_MAP is empty; findGlobal() always returns null, so the old
  // global-dispatch branch below is kept only as documentation scaffolding.
  const g = findGlobal(field);
  if (g) {  // always false — GLOBAL_PARAM_MAP is empty
    const [, paramId, , toRaw] = g;
    juceEmit('setParam', { id: paramId, value: toRaw(value) });
    return;
  }
  for (const [f, suffix, , toRaw] of LANE_MAP) {
    if (f === field) {
      juceEmit('setParam', { id: laneParamId(lane, suffix), value: toRaw(value) });
      return;
    }
  }
}

// Broadcast a single field to every lane id in the given list.  Used by the
// UI's "global" quantize / grid toggles, which the C++ engine actually stores
// per-lane — so the UI mirror writes the same value to every active lane.
export function broadcastParam(laneIds, field, value) {
  for (const id of laneIds) sendParam(id, field, value);
}

// Resolve a global APVTS paramId (e.g. "scaleRoot") into the engine field name
// the UI uses.  Returns null for per-lane params or unknown ids.
export function globalFieldForParamId(paramId) {
  const g = findGlobalById(paramId);
  return g ? { field: g[0], rawToReact: g[2] } : null;
}

export function sendEnabled(lane, enabled) {
  juceEmit('setParam', { id: laneParamId(lane, 'enabled'), value: enabled ? 1.0 : 0.0 });
}

export function sendCurve(lane, f32) {
  juceEmit('setCurve', { lane, data: f32ToArray(f32) });
}

export function sendFocus(lane)          { juceEmit('setFocus',     { lane }); }
export function sendPlaying(playing)     { juceEmit('setPlaying',   { playing }); }
export function sendDirection(direction) { juceEmit('setDirection', { direction }); }
export function sendClearLane(lane)      { juceEmit('clearLane',    { lane }); }
export function sendAddLane()            { juceEmit('addLane',      {}); }
export function sendRemoveLane(lane)     { juceEmit('removeLane',   { lane }); }
export function sendPanic()              { juceEmit('panic',        {}); }
// Teach CC — arm a lane to capture the next incoming CC number.
// cancelTeach disarms without changing the CC number.
export function sendBeginTeach(lane)     { juceEmit('beginTeach',   { lane }); }
export function sendCancelTeach()        { juceEmit('cancelTeach',  {}); }

// MIDI recording — arm / disarm the audio-thread MIDI capture buffer.
// beginRecord tells C++ to start buffering incoming MIDI for the given lane;
// stopRecord clears the armed lane so the audio thread stops capturing.
export function sendBeginRecord(lane)    { juceEmit('beginRecord',  { lane }); }
export function sendStopRecord()         { juceEmit('stopRecord',   {}); }

// Export the LANE_MAP for use in C++ param-change dispatching
export { LANE_MAP, laneParamId };
