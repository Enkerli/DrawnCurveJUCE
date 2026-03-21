# DrawnCurveJUCE — Handoff & Advice Document

_Generated from branch `claude/multilane-note-mode-issues-sk8w4` after merging main._

---

## What Is Actually Built Right Now

The engine and processor are substantially complete for a 3-lane MIDI effect. This is
much further along than earlier notes suggested. Key inventory:

### Engine (`GestureEngine`)
- **3 simultaneous lanes** (`kMaxLanes = 3`), each with independent curve snapshot,
  playhead, one-pole smoother, dedup state, and hysteresis state
- **Note hysteresis** — `lockedNote` float in `LaneRuntime`; pitch only commits when
  raw value moves ≥ 0.6 semitones from locked position (fixes C♯/D♯ rapid pulsing)
- **Scale quantization** — `ScaleConfig { uint16_t mask; uint8_t root }` applied per lane
  in Note mode; quantized note feeds the existing hysteresis + dedup chain
- **All four MIDI types**: CC (0xB0), Channel Pressure (0xD0), Pitch Bend (0xE0, 14-bit),
  Note (0x90/0x80 monophonic glide with Note Off chasing)
- **Note Off on stop**: atomic `_noteOffNeeded[lane]` set by `setPlaying(false)`;
  cleared exactly once on the next `processBlock()` call

### Processor (`DrawnCurveProcessor`)
- **Per-lane APVTS parameters** keyed as `"l0_msgType"`, `"l1_ccNumber"`, etc., using
  the `laneParam(lane, base)` inline helper
- **Per-lane parameters**: `msgType`, `ccNumber`, `midiChannel`, `smoothing`,
  `minOutput`, `maxOutput`, `noteVelocity`, `scaleMode`, `scaleRoot`, `scaleMask`, `enabled`
- **Shared parameters**: `playbackSpeed`, `syncEnabled`, `syncBeats`, `playbackDirection`
- **Scale presets**: 8 preset masks (Chromatic, Major, Natural Minor, Dorian,
  Pentatonic Major/Minor, Blues, Custom) + 12-bit custom mask
- **Teach/Learn**: `beginTeach(lane)` / `cancelTeach()` / `isTeachPending(lane)`;
  audio thread intercepts incoming CC and writes to the pending lane's `ccNumber`
  parameter — `acceptsMidi()` returns `true` to enable this
- **State persistence**: per-lane base64-encoded curve tables + all snapshot fields;
  backward-compatible reader for v1 single-lane presets (old `"tableData"` key)
- **HiRes timer fallback**: fires at 10 ms when audio thread is idle; MIDI buffered in
  `_pendingMidi` and flushed on next `processBlock()`

### UI (`PluginEditor`)
- **Message-type buttons** now draw path-based icons: tilde wave (CC), downward arrow
  (Aft), bidirectional arrow (PB), eighth-note glyph (Note) — via `SymbolLF`
- **Direction buttons** already used path arrows (Fwd/Rev/P-P) before this branch
- Single `CurveDisplay` — still shows only one curve (Lane 0)
- Single set of parameter sliders — not yet per-lane

---

## What Still Needs to Be Done

### Priority 1 — Stuck Notes Fix (two small changes)

**Part A — silence note before drawing starts**

`DrawnCurveProcessor::beginCapture(int lane)` currently does only `_capture.begin()`.
It should tell the engine to stop that lane's note first:

```cpp
// Source/PluginProcessor.cpp — beginCapture()
void DrawnCurveProcessor::beginCapture (int lane)
{
    _engine.setLanePlaying (lane, false);   // emits Note Off on next processBlock
    _capture.begin();
}
```

If `GestureEngine` doesn't yet have a per-lane `setLanePlaying()`, the quickest fix
is to call `setPlaying(false)` (which already sets `_noteOffNeeded` for all active lanes)
and then re-start playback after `finalizeCapture()` completes.

**Part B — `reset()` must not cancel a pending Note Off**

`GestureEngine::reset()` (or per-lane reset) currently calls
`_noteOffNeeded[lane].store(false, ...)`. Removing that line lets the Note Off
fire on the next `processBlock()` before the new curve takes over. The Note Off path
in `processBlock()` runs before the `_isPlaying` guard and is therefore always reached.

Verify carefully: host-sync rising edge calls `reset()` before `setPlaying(true)`.
If no note was playing (`lastSentValue == -1`), the Note Off path is a no-op — safe.

### Priority 2 — MIDI Panic Button

A "!!" button (or long-press on Clear) that silences all active notes immediately.
Classic safety valve; invaluable during development and live use.

**Engine side** — add to `GestureEngine`:
```cpp
// GestureEngine.hpp — new atomic:
std::atomic<bool> _panicNeeded { false };

// GestureEngine.hpp — new UI-thread method:
void triggerPanic();

// GestureEngine.cpp — implementation:
void GestureEngine::triggerPanic()
{
    _isPlaying.store (false, std::memory_order_release);
    _panicNeeded.store (true, std::memory_order_release);
}

// GestureEngine.cpp — at top of processBlock(), before _noteOffNeeded check:
if (_panicNeeded.exchange (false, std::memory_order_acq_rel))
{
    if (midiOut)
        for (uint8_t ch = 0; ch < 16; ++ch)
            midiOut (0xB0u | ch, 0x7Bu, 0x00u);   // All Notes Off (CC 123)
    // reset all per-lane dedup state
    for (auto& rt : _runtimes)
        rt.lastSentValue = -1;
        rt.lockedNote    = -1.0f;
    return;
}
```

**Processor side** — add `void triggerPanic()` to `DrawnCurveProcessor` that delegates
to `_engine.triggerPanic()`.

**UI side** — add `juce::TextButton panicButton { "!!" }` to `DrawnCurveEditor`.
Place it in Row 1, right of the Clear button. In the help overlay, document it as
"!! — MIDI Panic: silences all notes on all channels."

### Priority 3 — Default to Note Mode

One character in `PluginProcessor.cpp`, `createParams()`, for the `msgType` parameter:
```cpp
// Change the last argument from 0 (CC) to 3 (Note):
juce::StringArray { "CC", "Channel Pressure", "Pitch Bend", "Note" }, 3));
```
Applies to all new lanes. Existing saved state restores the persisted value so old
presets are unaffected.

### Priority 4 — Multi-Lane UI

The engine supports 3 lanes but the editor still shows a single-lane view. The UI
needs to expose what the engine can already do.

**`LaneStrip` component** — a horizontal strip per lane containing:
- Compact `CurveDisplay` (use `getCurveTable(lane)` / `currentPhase(lane)`)
- Message-type radio group (reads/writes `laneParam(lane, "msgType")`)
- Channel slider (`laneParam(lane, "midiChannel")`)
- CC#/Vel slider (`laneParam(lane, "ccNumber")` or `"noteVelocity"` depending on mode)
- Scale picker (segmented control or small buttons: Chromatic / Major / … / Custom)
- Range slider (min/max output)
- Smooth slider
- Enable/mute toggle
- "Learn" button (calls `proc.beginTeach(lane)`; polls `proc.isTeachPending(lane)`
  to show pending state)

**`DrawnCurveEditor` changes**:
- Stack `LaneStrip` components vertically; curve displays scale down to fit
- "Add Lane" button (disabled when all 3 lanes are active)
- Global direction + speed/sync controls remain at the top

**Drawing target**: tapping a lane strip activates it; subsequent gestures go to
`beginCapture(lane)` / `finalizeCapture(lane)` for that lane index.

### Priority 5 — Per-Lane Playback Direction (Optional)

Currently `playbackDirection` is a single shared parameter. Moving it per-lane
requires adding `laneParam(lane, "direction")` to `createParams()` and passing
the per-lane value into each lane's processing. Low priority unless users ask.

---

## Architectural Notes

### Parameter naming convention
```
laneParam(0, "msgType")  → "l0_msgType"
laneParam(1, "ccNumber") → "l1_ccNumber"
```
Use `laneParam()` everywhere; never build these strings manually.

### Thread safety model
- `_engineLock` (SpinLock): guards all engine calls between audio thread and HiRes timer
- Atomics with explicit ordering for cross-thread state (`_isPlaying`, `_noteOffNeeded`,
  `_snapshot[lane]`, `_currentPhase`)
- UI thread writes to APVTS parameters; audio thread reads via `getRawParameterValue()`
- `_teachPendingLane` is atomic int; audio thread writes CC# param (acceptable pattern)

### Snapshot ownership
Heap-allocated with `new`, never freed (MVP). `_laneSnaps[lane]` is UI-thread-owned.
Engine holds `atomic<const LaneSnapshot*>` per lane. Never delete while engine runs.

### Scale quantization chain (Note mode)
```
curve table → smooth → range map → rawNote (0–127 float)
  → hysteresis gate (lockedNote ± 0.6 semitones)
  → quantizeNote(ScaleConfig) → integer MIDI pitch
  → dedup vs lastSentValue → Note Off / Note On
```
Hysteresis runs on the pre-quantized float, so the deadband is in chromatic semitone
space regardless of which scale is active.

### Scale preset masks (12-bit, root-relative)
```
0xFFF = Chromatic          (all 12 semitones)
0xAB5 = Major              (W W H W W W H)
0x5AD = Natural Minor
0x6AD = Dorian
0x295 = Pentatonic Major
0x4A9 = Pentatonic Minor
0x4E9 = Blues
0x000 = Custom             (uses scaleMask param directly)
```
Bit 0 = root, bit 1 = root+1 semitone, bit 11 = root+11 semitones.

---

## Future Ideas (Keep a Note Of)

- **Sustain pedal**: `acceptsMidi()` is already `true`. Detect CC 64; suppress Note Off
  while pedal is held. Store `bool pedalDown[16]` per channel in the processor.
- **Theremin / continuous pitch mode**: hold a fixed Note On while PitchBend tracks Y.
  Well-suited to MPE (per-note pitch bend on individual channels per lane).
- **MPE routing**: each Note-mode lane outputs on its own MIDI channel (channels 2–4
  for lanes 0–2; channel 1 as MPE global).
- **Quantize-by-loop-length on new draw**: queue a `_pendingSnap[lane]` and swap it
  at phase == 0 instead of immediately. Requires an extra atomic pointer in
  `GestureEngine` and a "swap at wrap" check in `processBlock()`.
- **Independent lane speeds**: `float speedMultiplier` per lane on top of master speed.
- **Fugue Machine mode**: per-lane playheads independently started/stopped/phase-offset.
  `LaneRuntime.playheadSeconds` is already separate per lane; only control + UI missing.

---

## Verification Checklist

After landing Priority 1–3 on main + Xcode build:

| # | Test | Pass condition |
|---|---|---|
| 1 | Draw curve → draw new curve immediately | Old note stops cleanly before new curve plays |
| 2 | Draw curves rapidly (5–6 times) | No stuck notes at any point |
| 3 | Press !! during playback | All notes off; confirmed with MIDI monitor |
| 4 | Slow curve across C♯/D boundary | Single clean transition, no pulsing |
| 5 | Scale = Major, play full range | Only major-scale pitches emitted |
| 6 | CC mode | Smooth 0–127 CC; no note messages |
| 7 | Pitch Bend mode | 14-bit messages; centre = 8192 at mid-Y |
| 8 | Save preset → reload | All per-lane values and curve tables restored |
| 9 | Load old v1 preset | Backward-compat reader puts curve in lane 0 |
| 10 | Teach/Learn: press Learn on lane 1, send CC 7 | Lane 1 `ccNumber` = 7 |
