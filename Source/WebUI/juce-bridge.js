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
  // scaleRoot / scaleMask are GLOBAL params — not in per-lane APVTS IDs.
  // They appear here so updateLane() can display them; setParam calls are no-ops
  // (getParameter("l0_scaleRoot") returns null and is silently skipped).
  ['scaleRoot',   'scaleRoot',   v => Math.round(v),          v => v / 11],     // raw: 0-11
  ['scaleMask',   'scaleMask',   v => Math.round(v),          v => v / 4095],   // raw: 0-4095
];

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
        return {
          ...l,
          color: l.color ?? fallback.color,
          name:  l.name  ?? fallback.name ?? `Lane ${l.id + 1}`,
          curve: l.curve ? arrayToF32(l.curve) : null,
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

  // Playhead phase — C++ sends at ~30 Hz from a juce::Timer
  juceOn('phase', ({ phase }) => onEvent({ type: 'setPhase', phase }));

  // Single APVTS parameter changed
  juceOn('paramChange', ({ id, value }) => onEvent({ type: 'paramChange', id, value }));

  // Curve data for one lane
  juceOn('curveData', ({ lane, data }) =>
    onEvent({ type: 'curveData', lane, curve: data ? arrayToF32(data) : null }));

  // Tell C++ we're ready — it will reply with stateSnapshot
  juceEmit('uiReady', {});
}

// ── JS → C++ senders (call from UI event handlers) ───────────────────────────

export function sendParam(lane, field, value) {
  for (const [f, suffix, , toRaw] of LANE_MAP) {
    if (f === field) {
      juceEmit('setParam', { id: laneParamId(lane, suffix), value: toRaw(value) });
      return;
    }
  }
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

// Export the LANE_MAP for use in C++ param-change dispatching
export { LANE_MAP, laneParamId };
