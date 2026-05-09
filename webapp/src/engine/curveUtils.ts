// curveUtils.ts — curve generator and display-sampling utilities.
//
// Ported from Source/WebUI/design/engine.jsx so the webapp's display layer
// (CurveCanvas, future ShapeWell, TypoReadout) uses the exact same sampling
// logic as the plugin's JS UI.
//
// Note: GestureEngine.ts has its own private sampleCurve for audio-thread use;
// this module is for UI-thread display only.

// ---------------------------------------------------------------------------
// sampleCurve — linear-interpolate a Float32Array curve at phase ∈ [0, 1].
// ---------------------------------------------------------------------------
export function sampleCurve(curve: Float32Array | null | undefined, phase: number): number {
  if (!curve) return 0.5
  const n = curve.length
  const idx = phase * (n - 1)
  const i = Math.floor(idx)
  const f = idx - i
  const a = curve[i]
  const b = curve[Math.min(n - 1, i + 1)]
  return a + (b - a) * f
}

// ---------------------------------------------------------------------------
// sampleLaneQuantized — sample a lane's curve with quantization applied.
//
// Mirrors C++ GestureEngine::processLane() and engine.jsx::sampleLaneQuantized
// so every display (staircase overlay, readouts) shows what MIDI actually emits.
//
// xQuantize: snap phase to ⌊phase/tickWidth⌋ × tickWidth (S&H in time)
// yQuantize: snap output to nearest 1/yDivisions step
// phaseOffset: shift sampling phase without moving the visual playhead (0..100)
// ---------------------------------------------------------------------------
export interface LaneDisplayParams {
  curve: Float32Array | null | undefined
  quantizeX: boolean
  xDivisions: number
  quantizeY: boolean
  yDivisions: number
  phaseOffset?: number   // 0..100
}

export function sampleLaneQuantized(lane: LaneDisplayParams, phase: number): number {
  if (!lane?.curve) return 0.5
  let p = phase

  if (lane.quantizeX && lane.xDivisions >= 2) {
    const tickWidth = 1 / lane.xDivisions
    p = Math.floor(p / tickWidth) * tickWidth
  }

  if (lane.phaseOffset) {
    p = ((p + lane.phaseOffset / 100) % 1 + 1) % 1
  }

  let v = sampleCurve(lane.curve, p)

  if (lane.quantizeY && lane.yDivisions >= 2) {
    const step = 1 / lane.yDivisions
    v = Math.round(v / step) * step
  }

  return v
}

// ---------------------------------------------------------------------------
// Curve generators — all return Float32Array of length n (default 256).
// ---------------------------------------------------------------------------

/** Sine wave.  center=0.5, amp=0.35, cycles=1, phase=0 gives a full period. */
export function makeSineCurve(
  n = 256,
  center = 0.5,
  amp = 0.35,
  cycles = 1,
  phase = 0,
): Float32Array {
  const arr = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    arr[i] = Math.max(0, Math.min(1, center + amp * Math.sin(2 * Math.PI * cycles * t + phase)))
  }
  return arr
}

/** Triangle wave.  amp controls peak-to-peak amplitude around center. */
export function makeTriangleCurve(n = 256, center = 0.5, amp = 0.4, cycles = 1): Float32Array {
  const arr = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * cycles
    const phase = t - Math.floor(t)
    const tri = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase
    arr[i] = Math.max(0, Math.min(1, center + amp * tri))
  }
  return arr
}

/** Sawtooth wave rising from low to high per cycle. */
export function makeSawtoothCurve(n = 256, center = 0.5, amp = 0.4, cycles = 1): Float32Array {
  const arr = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * cycles
    const phase = t - Math.floor(t)
    const saw = 2 * phase - 1  // -1..1
    arr[i] = Math.max(0, Math.min(1, center + amp * saw))
  }
  return arr
}

/** Square wave.  duty controls the high/low split (0..1, default 0.5). */
export function makeSquareCurve(n = 256, center = 0.5, amp = 0.4, cycles = 1, duty = 0.5): Float32Array {
  const arr = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * cycles
    const phase = t - Math.floor(t)
    const sq = phase < duty ? 1 : -1
    arr[i] = Math.max(0, Math.min(1, center + amp * sq))
  }
  return arr
}

// ---------------------------------------------------------------------------
// smoothCurvePoints — build a Float32Array from raw freehand {x,y} points.
// Mirrors engine.jsx::smoothCurvePoints exactly.
// ---------------------------------------------------------------------------
export interface RawPoint {
  x: number  // 0..1
  y: number  // 0..1
}

export function smoothCurvePoints(points: RawPoint[] | null | undefined, n = 256): Float32Array | null {
  if (!points || points.length < 2) return null

  const sorted = [...points].sort((a, b) => a.x - b.x)
  const arr = new Float32Array(n)
  let j = 0

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    while (j < sorted.length - 2 && sorted[j + 1].x < t) j++
    const a = sorted[j]
    const b = sorted[j + 1] ?? a
    const span = Math.max(0.0001, b.x - a.x)
    const f = Math.max(0, Math.min(1, (t - a.x) / span))
    arr[i] = Math.max(0, Math.min(1, a.y + (b.y - a.y) * f))
  }

  // one-pole low-pass (k=0.3 matches the plugin's smoothing constant)
  let prev = arr[0]
  const k = 0.3
  for (let i = 0; i < n; i++) {
    prev = prev + k * (arr[i] - prev)
    arr[i] = prev
  }

  return arr
}
