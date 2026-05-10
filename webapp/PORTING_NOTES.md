# Webapp Port — Status & What's Still Needed

## What Was Built (May 2026, webview-ui branch)

These steps produced genuinely useful infrastructure but **diverged from the
goal of matching the standalone's Look & Feel**. They should be treated as a
foundation layer, not a finished port.

| Step | File(s) | What it does |
|------|---------|--------------|
| 1 | `engine/scaleData.ts` | Full 48-scale taxonomy with `id` fields, `recognizeScaleId`, `pcActive`, `togglePc` — now matches the plugin's `tokens.jsx` |
| 2 | `components/primitives/` | `Btn`, `Slider`, `RangeSlider`, `LogSlider` ported from `Source/WebUI/design/ui-primitives.jsx` |
| 3 | `engine/curveUtils.ts` | `sampleCurve`, `sampleLaneQuantized`, `makeSine/Triangle/Sawtooth/Square`, `smoothCurvePoints` — mirrors `engine.jsx` exactly |
| 4 | `components/CurveCanvas.tsx` | Rendering + gesture layer split out of `CurveDisplay`; exports shared constants so it can be embedded without axis controls |
| 5 | `components/ShapeWell.tsx` | Miniature curve thumbnail + one-click shape generators (Sine / Tri / Saw / Square / Clear) |
| 6–7 | `components/QurveShelf.tsx` | `localStorage`-backed curve library: save, rename (double-click), delete, apply |

## Why It Doesn't Match the Standalone

The standalone's WebUI is built around a single cohesive design system defined in
`Source/WebUI/design/`:

- **`tokens.jsx`** — `PAPER` palette, `LANES` (colour + dash + name), `SCALES` list,
  `pitchName`, font variables, per-target colour semantics
- **`ui-primitives.jsx`** — `Btn`, `Slider`, `RangeSlider`, `LogSlider`, `DrawnDial`,
  `PlaybackControl`, `Tag`, `Label` — all wired to `PAPER` tokens, not CSS vars
- **`scale-editor.jsx`** — `ChromaticWheel`, `PianoScaleRow`, `ScalePicker` — the
  complete scale-editing surface with mask bitmask logic
- **`juce-ipad.jsx`** — the entire L-shape gutter layout: top bar, collapsible
  shape well (with CC/AT/PB/Note selector, CC number slider, Teach CC, channel
  slider, phase-offset slider, smoothing dial, range slider), lane panel (right),
  scale panel (bottom), Qurve shelf (bottom), bottom bar summary

The webapp built its own parallel components (`CurveDisplay`, `LaneControls`,
`Toolbar`) with a different layout, different token names, and different
interactions. Merging the two means **replacing** those components with ports of
the design files, not patching them incrementally.

## What a True Integration Requires

### Phase 1 — Design-system tokens
Port `Source/WebUI/design/tokens.jsx` → `webapp/src/design/tokens.ts`:
- `PAPER` object (replace the scattered CSS var references)
- `LANES` array (colour, dash, name — currently duplicated in 3 places in the webapp)
- `SCALES` is done (`scaleData.ts`); add `pitchName(pc, useFlats)` alias
- Font variable constants (`FONT_SANS`, `FONT_SERIF`, `FONT_HAND`)

### Phase 2 — UI primitives (done, needs PAPER wiring)
`webapp/src/components/primitives/` already exists. Refactor to accept `paper`
prop (matching the plugin pattern) instead of hardcoded CSS vars so themes work
the same way as in the plugin.

### Phase 3 — Scale editor surface
Port `Source/WebUI/design/scale-editor.jsx` → `webapp/src/components/ScaleEditor.tsx`:
- `ChromaticWheel` (12-segment wheel with toggle/highlight)
- `PianoScaleRow` (mini keyboard with root + active notes)
- `ScalePicker` (family tree picker, same 48-scale taxonomy)
- `recognizeScaleId` / `formatMaskBits` (already in `scaleData.ts`)

### Phase 4 — Replace the layout
The biggest lift. `App.tsx` + `CurveDisplay` + `LaneControls` + `Toolbar` should be
**replaced** (not patched) by a TypeScript port of `juce-ipad.jsx`:
- `JuceIPadStudio` outer shell → `Studio.tsx`
- Top bar → `TopBar.tsx`
- Left shape well (collapsible) → port `JuceShapeWell` → `ShapeWell.tsx`
  (the current `ShapeWell.tsx` is a stub; the real one has ~150 lines of controls)
- Right lane panel (collapsible) → `LanePanel.tsx`
- Bottom scale panel + Qurve shelf → `ScalePanel.tsx` + existing `QurveShelf.tsx`
- Bottom bar summary → `BottomBar.tsx`

The `CurveCanvas.tsx` created in Step 4 **is reusable** in this layout — it
correctly handles drawing, gesture capture, and playhead rendering.

### Phase 5 — MIDI bridge shim
`Source/WebUI/juce-bridge.js` already no-ops when `window.__JUCE__` is absent.
Add a thin wrapper in `webapp/src/midi/juceShim.ts` that:
- Exports `sendParam`, `sendGlobalActual` etc. as no-ops
- Routes note/CC output to the existing `WebMidiManager`
- Fires `paramChange` synthetic events when `handleUpdateParams` is called

This lets the ported `juce-ipad.jsx` run in the webapp without a JUCE host.

### Phase 6 — Verify + deploy
`npm run build` in `webapp/`, smoke-test in Chromium + Safari + iOS Safari,
then merge to `main` to trigger the GitHub Actions deploy to
`enkerli.github.io/DrawnQurve`.

## Files to Keep / Reuse

| File | Keep as-is | Notes |
|------|-----------|-------|
| `engine/scaleData.ts` | ✓ | Fully aligned with plugin |
| `engine/curveUtils.ts` | ✓ | Mirrors `engine.jsx` exactly |
| `engine/gestureEngine.ts` | ✓ | Web MIDI playback engine |
| `engine/captureSession.ts` | ✓ | Freehand capture |
| `engine/types.ts` | ✓ | |
| `midi/webMidi.ts` | ✓ | Web MIDI output |
| `components/CurveCanvas.tsx` | ✓ | Core renderer, reuse in new layout |
| `components/primitives/` | refactor | Needs `paper` prop instead of CSS vars |
| `components/QurveShelf.tsx` | refactor | localStorage model is good; UI skin needs update |
| `components/ShapeWell.tsx` | replace | Stub only; port real `JuceShapeWell` controls |
| `components/CurveDisplay.tsx` | replace | Superseded by new layout |
| `components/LaneControls.tsx` | replace | Superseded by new layout |
| `components/Toolbar.tsx` | replace | Superseded by new layout |
| `components/ScaleLattice.tsx` | keep | Already in webapp; wire into `ScalePanel` |
| `App.tsx` | replace | Superseded by `Studio.tsx` |
