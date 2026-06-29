// main.jsx — JUCE WebView entry point for DrawnQurve
//
// esbuild injects react-globals.js first, so React/ReactDOM are already globals
// by the time any import runs.  Design files use React.useState etc. as globals —
// that's intentional; do not add React imports to the design files.

// ── Design system globals ─────────────────────────────────────────────────────
import './design/tokens.jsx';       // window.PAPER, LANES, SCALES, PITCH_*
import './design/engine.jsx';       // window.useDrawnQurveEngine (demo), sampleCurve …
import './design/ui-primitives.jsx';
import './design/curve-canvas.jsx';
import './design/scale-editor.jsx';

// ── JUCE bridge ───────────────────────────────────────────────────────────────
import { initJuceBridge, sendCurve, sendParam, sendFocus,
         sendPlaying, sendDirection, sendEnabled, sendGlobalActual,
         sendClearLane, sendAddLane, sendRemoveLane, sendPanic,
         sendBeginTeach, sendCancelTeach,
         sendBeginRecord, sendStopRecord } from './juce-bridge.js';

// ── Patch useDrawnQurveEngine ─────────────────────────────────────────────────
// Must run before juce-ipad.jsx is imported (esbuild preserves import order in
// the output bundle, so the IIFE below executes before the juce-ipad.jsx content).
//
// Strategy: wrap the demo hook so all mutations also notify JUCE, and overlay
// JUCE-driven state (phase, lane params) on top of the demo animation state.
// Falls back gracefully to pure demo mode when __JUCE__ is not present.

// ── patchEngine — JUCE bridge overlay ────────────────────────────────────────
// Wraps the demo hook so every UI mutation also drives JUCE's APVTS, and
// every incoming JUCE event (phase tick, paramChange, stateSnapshot) flows
// back into React state.
//
// Design rule: this IIFE must finish executing BEFORE juce-ipad.jsx is
// imported.  esbuild preserves import order in the output bundle, so the
// IIFE runs first automatically — do not reorder the imports.
//
// Layering:
//   design/engine.jsx   — pure demo hook  (no JUCE knowledge)
//   main.jsx            — JUCE-aware wrapper  (this block)
//   design/juce-ipad.jsx — layout; calls useDrawnQurveEngine() which by
//                          the time it runs is already the wrapped version
(function patchEngine() {
  const demoEngine = window.useDrawnQurveEngine;

  window.useDrawnQurveEngine = function useDrawnQurveEngine(initial = {}) {
    const demo = demoEngine(initial);

    // Phase driven by JUCE (overrides the demo RAF loop *while it's actively
    // emitting* — i.e. inside a host that's running the audio graph).  In the
    // standalone the JUCE timer often emits a single phase=0 at startup and
    // then nothing more (the engine's phase doesn't actually advance there).
    // If we trusted that one-shot value forever, the playhead would freeze at
    // 0; so we tag every JUCE phase event with a wall-clock timestamp and only
    // honour it for ~200 ms — long enough to bridge between consecutive 30 Hz
    // ticks, short enough to fall back to the demo RAF when JUCE goes quiet.
    const [jucePhase, setJucePhase] = React.useState(null);
    // Per-lane phases from C++: array indexed by lane id, or null in demo mode.
    const [juceLanePhases, setJuceLanePhases] = React.useState(null);
    const jucePhaseTimeRef = React.useRef(0);
    // Handler for incoming MIDI events forwarded from the C++ bridge.
    // useMidiRecorder registers itself here in JUCE mode.
    const midiInHandlerRef = React.useRef(null);
    const isJuceDriving =
      jucePhase != null && (performance.now() - jucePhaseTimeRef.current) < 200;
    const effectivePhase = isJuceDriving ? jucePhase : demo.phase;
    // Effective per-lane phases: use JUCE array when driving, else null (caller falls back to global).
    const effectiveLanePhases = isJuceDriving ? juceLanePhases : null;

    // Wire up the bridge on first mount
    React.useEffect(() => {
      initJuceBridge((action) => {
        switch (action.type) {
          case 'setPhase':
            jucePhaseTimeRef.current = performance.now();
            setJucePhase(action.phase);
            if (action.lanePhases) setJuceLanePhases(action.lanePhases);
            // Mirror host transport state into the demo RAF loop so that when
            // the host pauses (JUCE stops emitting phase), the demo loop also
            // pauses rather than taking over and causing "keeps looping".
            if (action.playing !== undefined) demo.setPlaying(action.playing);
            break;
          case 'midiIn':
            if (midiInHandlerRef.current) midiInHandlerRef.current(action);
            break;
          case 'setLanes':     demo.setLanes(action.lanes);         break;
          case 'setPlaying':   demo.setPlaying(action.playing);     break;
          case 'setDirection': demo.setDirection(action.direction); break;
          case 'setFocus':     demo.setFocus(action.focus);         break;
          case 'setSyncOn':    demo.setSyncOn(action.syncOn);       break;
          case 'setBeats':     demo.setBeats(action.beats);         break;
          case 'setSpeed':     demo.setSpeed(action.speed);         break;
          case 'setActiveLaneCount':
            // Truncate lanes to the active count
            demo.setLanes(prev => prev.slice(0, action.count));
            break;
          case 'curveData':
            demo.setLanes(prev => prev.map(l =>
              l.id === action.lane ? { ...l, curve: action.curve } : l));
            break;
          case 'paramChange': {
            const { id, value } = action;

            // All scale and playback params are now per-lane (l<n>_ prefix).
            // GLOBAL_PARAM_MAP is empty; globalFieldForParamId() always returns
            // null.  The block below handles all per-lane dispatch.

            // Per-lane params — match l<n>_ prefix and dispatch into that lane.
            demo.setLanes(prev => {
              const next = [...prev];
              for (let L = 0; L < next.length; L++) {
                const prefix = `l${L}_`;
                if (!id.startsWith(prefix)) continue;
                const suffix = id.slice(prefix.length);
                const patch = {};
                // value is the ACTUAL parameter value (not 0-1 normalised):
                //   AudioParameterChoice → index   AudioParameterInt → integer
                if (suffix === 'enabled')          patch.enabled          = value > 0.5;
                if (suffix === 'msgType')          patch.target           = ['CC','Aftertouch','PitchBend','Note'][Math.round(value)] ?? 'CC';
                if (suffix === 'ccNumber')         patch.targetDetail     = Math.round(value);        // 0-127
                if (suffix === 'midiChannel')      patch.channel          = Math.round(value);         // 1-16
                if (suffix === 'smoothing')        patch.smooth           = value;                     // 0-1
                if (suffix === 'minOutput')        patch.rangeMin         = value;                     // 0-1
                if (suffix === 'maxOutput')        patch.rangeMax         = value;                     // 0-1
                if (suffix === 'noteVelocity')     patch.velocity         = Math.round(value);         // 1-127
                if (suffix === 'xQuantize')        patch.quantizeX        = value > 0.5;
                if (suffix === 'yQuantize')        patch.quantizeY        = value > 0.5;
                if (suffix === 'xDivisions')       patch.xDivisions       = Math.round(value);        // 2-32
                if (suffix === 'yDivisions')       patch.yDivisions       = Math.round(value);        // 2-24
                // Per-lane scale quantization (moved from global to per-lane)
                if (suffix === 'scaleRoot')        patch.scaleRoot        = Math.round(value);        // 0-11
                if (suffix === 'scaleMask') {
                  patch.scaleMask = Math.round(value);                                                // 0-4095
                  // Re-derive scaleId so the picker stays in sync with the mask.
                  patch.scaleId   = window.recognizeScaleId?.(patch.scaleMask) ?? 'custom';
                }
                // Playback behaviour
                if (suffix === 'loopMode')          patch.oneShot          = value > 0.5;
                if (suffix === 'legatoMode')        patch.legato           = value > 0.5;
                if (suffix === 'phaseOffset')       patch.phaseOffset      = value;                   // 0-100
                // Per-lane playback overrides
                if (suffix === 'useGlobalPlayback') patch.useGlobalPlayback = value > 0.5;
                if (suffix === 'laneDirection')     patch.laneDirection    = ['fwd','rev','pp'][Math.round(value)] ?? 'fwd';
                if (suffix === 'laneSpeedMul')      patch.laneSpeedMul     = value;                   // 0.1-10.0
                if (Object.keys(patch).length) {
                  next[L] = { ...next[L], ...patch };
                  return next;
                }
              }
              return prev;
            });
            break;
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Wrapped mutators that also notify JUCE ──────────────────────────────
    const setCurve = React.useCallback((id, curve) => {
      demo.setCurve(id, curve);
      sendCurve(id, curve);
    }, [demo.setCurve]);

    const setFocus = React.useCallback((id) => {
      demo.setFocus(id);
      sendFocus(id);
    }, [demo.setFocus]);

    const setPlaying = React.useCallback((p) => {
      const next = typeof p === 'function' ? p(demo.playing) : p;
      demo.setPlaying(next);
      sendPlaying(next);
    }, [demo.setPlaying, demo.playing]);

    const setDirection = React.useCallback((d) => {
      demo.setDirection(d);
      sendDirection(d);
      // Mirror the UI choice ('fwd'/'rev'/'pp') into the global APVTS param.
      const idx = Math.max (0, ['fwd', 'rev', 'pp'].indexOf(d));
      sendGlobalActual('playbackDirection', idx);
    }, [demo.setDirection]);

    // ── Global transport setters wired to APVTS ──────────────────────────────
    // The demo RAF used to drive the playhead from `beats`/`speed`; now JUCE
    // does, and we need these sliders to actually move the engine.  All four
    // dispatch through sendGlobalActual which lets C++ apply the parameter's
    // own NormalisableRange (so e.g. playbackSpeed's skew=0.5 is honoured).
    const setSyncOn = React.useCallback((v) => {
      demo.setSyncOn(v);
      sendGlobalActual('syncEnabled', v ? 1.0 : 0.0);
    }, [demo.setSyncOn]);
    const setBeats = React.useCallback((v) => {
      const next = typeof v === 'function' ? v(demo.beats) : v;
      demo.setBeats(next);
      sendGlobalActual('syncBeats', next);
    }, [demo.setBeats, demo.beats]);
    const setSpeed = React.useCallback((v) => {
      const next = typeof v === 'function' ? v(demo.speed) : v;
      demo.setSpeed(next);
      sendGlobalActual('playbackSpeed', next);
    }, [demo.setSpeed, demo.speed]);

    const updateLane = React.useCallback((id, patch) => {
      demo.updateLane(id, patch);
      if ('enabled' in patch) sendEnabled(id, patch.enabled);
      Object.entries(patch).forEach(([field, value]) => sendParam(id, field, value));
    }, [demo.updateLane]);

    const clearLane = React.useCallback((id) => {
      demo.clearLane(id);
      sendClearLane(id);
    }, [demo.clearLane]);

    // Add / remove lanes — both go through the C++ side.  C++ updates
    // `proc.activeLaneCount`, then re-emits stateSnapshot so the JS lane
    // array is replaced wholesale (palette + defaults are pulled from
    // window.LANES + APVTS in juce-bridge.js).  No local state mutation
    // needed here; sendAddLane() / sendRemoveLane() are fire-and-forget.
    const addLane = React.useCallback(() => {
      sendAddLane();
    }, []);
    const removeLane = React.useCallback((id) => {
      sendRemoveLane(id);
    }, []);

    const clearAll = React.useCallback(() => {
      demo.clearAll();
      demo.lanes.forEach(l => sendClearLane(l.id));
    }, [demo.clearAll, demo.lanes]);

    // Apply scaleRoot + scaleMask to every active lane in one operation.
    // Used by the "↕ All" button in the scale panel.
    //
    // Correctness note: calling updateLane() per-lane in a forEach inside a
    // click handler triggers multiple demo.updateLane() → setLanes() calls.
    // Even with React 18 batching, the updateLane closure captures demo.lanes
    // at render time and can miss lanes that were added since.  This helper
    // uses a single functional setLanes update (guaranteed to see latest state)
    // + explicit sendParam broadcast, which is both atomic and correct.
    const applyScaleToAll = React.useCallback((scaleRoot, scaleMask) => {
      // Re-derive scaleId so all lanes show the correct scale name after copy.
      const scaleId = window.recognizeScaleId?.(scaleMask) ?? 'custom';
      demo.setLanes(prev => prev.map(l => ({ ...l, scaleRoot, scaleMask, scaleId })));
      // Broadcast to C++ APVTS for every currently-known lane.
      demo.lanes.forEach(l => {
        sendParam(l.id, 'scaleRoot', scaleRoot);
        sendParam(l.id, 'scaleMask', scaleMask);
      });
    }, [demo.setLanes, demo.lanes]);

    return {
      ...demo,
      phase: effectivePhase,
      lanePhases: effectiveLanePhases,
      setCurve,
      setFocus,
      setPlaying,
      setDirection,
      setSyncOn,
      setBeats,
      setSpeed,
      updateLane,
      clearLane,
      clearAll,
      addLane,
      removeLane,
      applyScaleToAll,
      panic: sendPanic,
      beginTeach: sendBeginTeach,
      cancelTeach: sendCancelTeach,
      // MIDI recording bridge — used by useMidiRecorder in JUCE mode.
      beginRecord: sendBeginRecord,
      stopRecord:  sendStopRecord,
      setMidiInHandler: (fn) => { midiInHandlerRef.current = fn; },
    };
  };
})();

// ── iPad layout (must be imported after patchEngine runs) ─────────────────────
import './design/juce-ipad.jsx';   // Object.assign(window, { JuceIPadStudio, … })

// ── Root component ────────────────────────────────────────────────────────────
function App() {
  const [size, setSize] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  React.useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const Studio = window.JuceIPadStudio;
  return Studio
    ? React.createElement(Studio, { width: size.w, height: size.h })
    : React.createElement('div', { style: { padding: 24, fontFamily: 'sans-serif' } }, 'Loading…');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(App)
);
