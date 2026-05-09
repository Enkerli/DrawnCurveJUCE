// ---------------------------------------------------------------------------
// Scale database — direct port of ScaleData.h
//
// Bitmask convention: bit (11 - interval) = 1 → interval is in the scale.
// bit 11 = root (interval 0), bit 0 = major 7th (interval 11).
// ---------------------------------------------------------------------------

export interface ScaleEntry {
  /** Stable camelCase identifier matching the plugin's tokens.jsx SCALES[].id */
  id: string
  name: string
  mask: number
}

export interface ScaleFamily {
  name: string
  modes: ScaleEntry[]
}

export const SCALE_FAMILIES: ScaleFamily[] = [
  {
    name: 'Diatonic',
    modes: [
      { id: 'ionian',       name: 'Ionian',      mask: 0xad5 },  // 0 2 4 5 7 9 11 — Major
      { id: 'dorian',       name: 'Dorian',      mask: 0xb56 },  // 0 2 3 5 7 9 10
      { id: 'phrygian',     name: 'Phrygian',    mask: 0xd5a },  // 0 1 3 5 7 8 10
      { id: 'lydian',       name: 'Lydian',      mask: 0xab5 },  // 0 2 4 6 7 9 11
      { id: 'mixolydian',   name: 'Mixolydian',  mask: 0xad6 },  // 0 2 4 5 7 9 10
      { id: 'aeolian',      name: 'Aeolian',     mask: 0xb5a },  // 0 2 3 5 7 8 10 — Natural Minor
      { id: 'locrian',      name: 'Locrian',     mask: 0xd6a },  // 0 1 3 5 6 8 10
    ],
  },
  {
    name: 'Pentatonic',
    modes: [
      { id: 'pentMaj',    name: 'Major',     mask: 0xa94 },  // 0 2 4 7 9
      { id: 'suspended',  name: 'Suspended', mask: 0xa52 },  // 0 2 5 7 10 — Egyptian
      { id: 'manGong',    name: 'Man Gong',  mask: 0x94a },  // 0 3 5 8 10
      { id: 'ritusen',    name: 'Ritusen',   mask: 0xa54 },  // 0 2 5 7 9
      { id: 'pentMin',    name: 'Minor',     mask: 0x952 },  // 0 3 5 7 10
    ],
  },
  {
    name: 'Jazz Minor',
    modes: [
      { id: 'jazzMinor',   name: 'Jazz Minor',  mask: 0xb55 },
      { id: 'dorianFlat2', name: 'Dorian ♭2',   mask: 0xd56 },
      { id: 'lydianAug',   name: 'Lydian Aug.',  mask: 0xaad },
      { id: 'lydianDom',   name: 'Lydian Dom.',  mask: 0xab6 },
      { id: 'mixoFlat6',   name: 'Mixo. ♭6',    mask: 0xada },
      { id: 'halfDim',     name: 'Half-Dim.',    mask: 0xb6a },
      { id: 'altered',     name: 'Altered',      mask: 0xdaa },
    ],
  },
  {
    name: 'Harm. Minor',
    modes: [
      { id: 'harmMinor',    name: 'Harmonic Minor', mask: 0xb59 },
      { id: 'locrianNat6',  name: 'Locrian ♮6',     mask: 0xd66 },
      { id: 'ionianSharp5', name: 'Ionian ♯5',      mask: 0xacd },
      { id: 'ukrainianDor', name: 'Ukrainian Dor.', mask: 0xb36 },
      { id: 'phrygianDom',  name: 'Phrygian Dom.',  mask: 0xcda },
      { id: 'lydianSharp2', name: 'Lydian ♯2',      mask: 0x9b5 },
      { id: 'ultraLocrian', name: 'Ultra Locrian',  mask: 0xdac },
    ],
  },
  {
    name: 'Symmetric',
    modes: [
      { id: 'chromatic', name: 'Chromatic',  mask: 0xfff },  // all 12 — kept here for family completeness
      { id: 'wholeTone', name: 'Whole Tone', mask: 0xaaa },
      { id: 'dimWH',     name: 'Dim. WH',   mask: 0xb6d },
      { id: 'dimHW',     name: 'Dim. HW',   mask: 0xdb6 },
      { id: 'augmented', name: 'Augmented', mask: 0x999 },
    ],
  },
  {
    name: 'Bebop',
    modes: [
      { id: 'bebopDom',    name: 'Dominant',   mask: 0xad7 },
      { id: 'bebopMaj',    name: 'Major',      mask: 0xadd },
      { id: 'bebopMin',    name: 'Minor',      mask: 0xb5b },
      { id: 'bebopMelMin', name: 'Mel. Minor', mask: 0xb57 },
    ],
  },
  {
    name: 'Blues',
    modes: [
      { id: 'blues',    name: 'Blues',       mask: 0x972 },
      { id: 'majBlues', name: 'Major Blues', mask: 0xb94 },
    ],
  },
  {
    name: 'Chordal',
    modes: [
      { id: 'chordMaj',      name: 'Major',      mask: 0x890 },
      { id: 'chordMin',      name: 'Minor',      mask: 0x910 },
      { id: 'chordDim',      name: 'Diminished', mask: 0x920 },
      { id: 'chordAug',      name: 'Augmented',  mask: 0x888 },
      { id: 'chordSus2',     name: 'Sus 2',      mask: 0xa10 },
      { id: 'chordSus4',     name: 'Sus 4',      mask: 0x850 },
      { id: 'chordMaj7',     name: 'Maj 7',      mask: 0x891 },
      { id: 'chordMin7',     name: 'Min 7',      mask: 0x912 },
      { id: 'chordDom7',     name: 'Dom 7',      mask: 0x892 },
      { id: 'chordHalfDim7', name: 'Half-Dim 7', mask: 0x922 },
      { id: 'chordDim7',     name: 'Dim 7',      mask: 0x924 },
    ],
  },
]

export const NOTE_NAMES       = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export const NOTE_NAMES_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

export function noteNames(useFlats = false): readonly string[] {
  return useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES
}

export function midiNoteName(note: number, useFlats = false): string {
  const n = Math.max(0, Math.min(127, note | 0))
  return noteNames(useFlats)[n % 12] + (Math.floor(n / 12) - 1)
}

/** Quick presets shown in the UI above the lattice. */
export const QUICK_PRESETS: { name: string; mask: number }[] = [
  { name: 'Chrom.', mask: 0xfff },
  { name: 'Major',  mask: 0xad5 },
  { name: 'Minor',  mask: 0xb5a },
  { name: 'Penta',  mask: 0xa94 },
  { name: 'Blues',  mask: 0x972 },
  { name: 'WTone',  mask: 0xaaa },
]

/**
 * Find a mask in the database; returns "Family / Mode name" display string or
 * null when the mask doesn't match any known scale.  Chromatic is handled via
 * the Symmetric family entry rather than a special case so the id round-trip
 * works correctly.
 */
export function recogniseMask(mask: number): string | null {
  for (const family of SCALE_FAMILIES) {
    for (const mode of family.modes) {
      if (mode.mask === mask) return `${family.name} / ${mode.name}`
    }
  }
  return null
}

/**
 * Returns the stable camelCase id for a mask (e.g. 'ionian', 'pentMin') or
 * 'custom' when the mask doesn't match any known scale.  Mirrors the plugin's
 * recognizeScaleId() in design/scale-editor.jsx so JS state fields like
 * lane.scaleId stay in sync across plugin and webapp.
 */
export function recognizeScaleId(mask: number): string {
  for (const family of SCALE_FAMILIES) {
    for (const mode of family.modes) {
      if (mode.mask === mask) return mode.id
    }
  }
  return 'custom'
}

/**
 * Whether pitch class `pc` (0 = root interval, 11 = major 7th) is active in
 * `mask`.  Convention: bit (11 − pc) = 1 means the interval is in the scale.
 * Mirrors pcActive() in design/tokens.jsx and the C++ engine's pcActive().
 */
export function pcActive(mask: number, pc: number): boolean {
  return ((mask >> (11 - pc)) & 1) === 1
}

/**
 * Toggle pitch class `pc` in `mask` and return the new mask.
 * Mirrors togglePc() in design/tokens.jsx.
 */
export function togglePc(mask: number, pc: number): number {
  return mask ^ (1 << (11 - pc))
}

/** Rotate a 12-bit mask left by semitones (for mode transposition). */
export function pcsRotate(mask: number, semitones: number): number {
  semitones = ((semitones % 12) + 12) % 12
  if (semitones === 0) return mask
  return ((mask << semitones) | (mask >> (12 - semitones))) & 0xfff
}
