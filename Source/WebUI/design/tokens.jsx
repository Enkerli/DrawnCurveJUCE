// Design tokens — Sketchbook aesthetic (warm paper, light only)
// Shared between v1 "Sketchbook" and v2 "Studio"

const PAPER = {
  // surfaces — hex for SVG compat; oklch for CSS vars
  bg:      '#F5F0E8',
  bgDeep:  '#EDE6D8',
  card:    '#FAF8F4',
  rule:    '#D4CAB8',
  ruleFaint:'#EAE3D8',
  // ink
  ink:     '#2D2620',
  ink70:   '#574E44',
  ink50:   '#857870',
  ink30:   '#B3A99E',
  // accents
  amber:   '#C4873A',
  amberInk:'#8A5520',
  // lanes
  laneInk:   '#3A4060',
  laneRose:  '#C4624A',
  laneMoss:  '#4A7A55',
};

const LANES = [
  { id: 0, name: 'One',   color: PAPER.laneInk,  tint: 'oklch(88% 0.02 250)' },
  { id: 1, name: 'Two',   color: PAPER.laneRose, tint: 'oklch(92% 0.03  25)' },
  { id: 2, name: 'Three', color: PAPER.laneMoss, tint: 'oklch(91% 0.03 145)' },
];

// Scale presets — pitch-class bitmasks (MSB = root, bit 11 = interval 0).
// Masks are INTERVAL-based.  The engine looks up (semi - scaleRoot) % 12 before
// pcActive(mask, …), so the same mask transposes when scaleRoot changes — the
// wheel UI must therefore also rotate by scaleRoot before display (see
// ChromaticWheel in scale-editor.jsx).
//
// This is the SAME taxonomy as Source/ScaleData.h (8 families, 47 scales) so
// the JS UI shows everything the C++ engine recognises.  Hex masks match
// dcScale::kFamilies entries exactly — keep them in sync if either side
// adds a scale.
const SCALES = [
  // Diatonic — 7 modes of the major scale
  { id: 'ionian',        name: 'Ionian',          mask: 0xAD5, family: 'Diatonic' }, // 0 2 4 5 7 9 11  (Major)
  { id: 'dorian',        name: 'Dorian',          mask: 0xB56, family: 'Diatonic' }, // 0 2 3 5 7 9 10
  { id: 'phrygian',      name: 'Phrygian',        mask: 0xD5A, family: 'Diatonic' }, // 0 1 3 5 7 8 10
  { id: 'lydian',        name: 'Lydian',          mask: 0xAB5, family: 'Diatonic' }, // 0 2 4 6 7 9 11
  { id: 'mixolydian',    name: 'Mixolydian',      mask: 0xAD6, family: 'Diatonic' }, // 0 2 4 5 7 9 10
  { id: 'aeolian',       name: 'Aeolian',         mask: 0xB5A, family: 'Diatonic' }, // 0 2 3 5 7 8 10  (Nat. Minor)
  { id: 'locrian',       name: 'Locrian',         mask: 0xD6A, family: 'Diatonic' }, // 0 1 3 5 6 8 10

  // Pentatonic — 5 rotations of the major pentatonic
  { id: 'pentMaj',       name: 'Major',           mask: 0xA94, family: 'Pentatonic' }, // 0 2 4 7 9
  { id: 'suspended',     name: 'Suspended',       mask: 0xA52, family: 'Pentatonic' }, // 0 2 5 7 10  (Egyptian)
  { id: 'manGong',       name: 'Man Gong',        mask: 0x94A, family: 'Pentatonic' }, // 0 3 5 8 10
  { id: 'ritusen',       name: 'Ritusen',         mask: 0xA54, family: 'Pentatonic' }, // 0 2 5 7 9
  { id: 'pentMin',       name: 'Minor',           mask: 0x952, family: 'Pentatonic' }, // 0 3 5 7 10

  // Jazz Minor — 7 modes of melodic minor (ascending)
  { id: 'jazzMinor',     name: 'Jazz Minor',      mask: 0xB55, family: 'Jazz Minor' }, // 0 2 3 5 7 9 11
  { id: 'dorianFlat2',   name: 'Dorian ♭2',       mask: 0xD56, family: 'Jazz Minor' }, // 0 1 3 5 7 9 10
  { id: 'lydianAug',     name: 'Lydian Aug.',     mask: 0xAAD, family: 'Jazz Minor' }, // 0 2 4 6 8 9 11
  { id: 'lydianDom',     name: 'Lydian Dom.',     mask: 0xAB6, family: 'Jazz Minor' }, // 0 2 4 6 7 9 10
  { id: 'mixoFlat6',     name: 'Mixo. ♭6',        mask: 0xADA, family: 'Jazz Minor' }, // 0 2 4 5 7 8 10
  { id: 'halfDim',       name: 'Half-Dim.',       mask: 0xB6A, family: 'Jazz Minor' }, // 0 2 3 5 6 8 10
  { id: 'altered',       name: 'Altered',         mask: 0xDAA, family: 'Jazz Minor' }, // 0 1 3 4 6 8 10

  // Harm. Minor — 7 modes of harmonic minor
  { id: 'harmMinor',     name: 'Harmonic Minor',  mask: 0xB59, family: 'Harm. Minor' }, // 0 2 3 5 7 8 11
  { id: 'locrianNat6',   name: 'Locrian ♮6',      mask: 0xD66, family: 'Harm. Minor' }, // 0 1 3 5 6 9 10
  { id: 'ionianSharp5',  name: 'Ionian ♯5',       mask: 0xACD, family: 'Harm. Minor' }, // 0 2 4 5 8 9 11
  { id: 'ukrainianDor',  name: 'Ukrainian Dor.',  mask: 0xB36, family: 'Harm. Minor' }, // 0 2 3 6 7 9 10
  { id: 'phrygianDom',   name: 'Phrygian Dom.',   mask: 0xCDA, family: 'Harm. Minor' }, // 0 1 4 5 7 8 10
  { id: 'lydianSharp2',  name: 'Lydian ♯2',       mask: 0x9B5, family: 'Harm. Minor' }, // 0 3 4 6 7 9 11
  { id: 'ultraLocrian',  name: 'Ultra Locrian',   mask: 0xDAC, family: 'Harm. Minor' }, // 0 1 3 4 6 8 9

  // Symmetric — equal-step / interval-pattern scales
  { id: 'chromatic',     name: 'Chromatic',       mask: 0xFFF, family: 'Symmetric' }, // all 12
  { id: 'wholeTone',     name: 'Whole Tone',      mask: 0xAAA, family: 'Symmetric' }, // 0 2 4 6 8 10
  { id: 'dimWH',         name: 'Dim. WH',         mask: 0xB6D, family: 'Symmetric' }, // 0 2 3 5 6 8 9 11
  { id: 'dimHW',         name: 'Dim. HW',         mask: 0xDB6, family: 'Symmetric' }, // 0 1 3 4 6 7 9 10
  { id: 'augmented',     name: 'Augmented',       mask: 0x999, family: 'Symmetric' }, // 0 3 4 7 8 11

  // Bebop — 8-note diatonic + chromatic passing tone
  { id: 'bebopDom',      name: 'Dominant',        mask: 0xAD7, family: 'Bebop' }, // 0 2 4 5 7 9 10 11
  { id: 'bebopMaj',      name: 'Major',           mask: 0xADD, family: 'Bebop' }, // 0 2 4 5 7 8 9 11
  { id: 'bebopMin',      name: 'Minor',           mask: 0xB5B, family: 'Bebop' }, // 0 2 3 5 7 8 10 11
  { id: 'bebopMelMin',   name: 'Mel. Minor',      mask: 0xB57, family: 'Bebop' }, // 0 2 3 5 7 9 10 11

  // Blues
  { id: 'blues',         name: 'Blues',           mask: 0x972, family: 'Blues' }, // 0 3 5 6 7 10
  { id: 'majBlues',      name: 'Major Blues',     mask: 0xB94, family: 'Blues' }, // 0 2 3 4 7 9

  // Chordal — triads & 7th chords as degenerate scales for chord-tone
  // quantization / "glorified arp" workflows
  { id: 'chordMaj',      name: 'Major',           mask: 0x890, family: 'Chordal' }, // 0 4 7
  { id: 'chordMin',      name: 'Minor',           mask: 0x910, family: 'Chordal' }, // 0 3 7
  { id: 'chordDim',      name: 'Diminished',      mask: 0x920, family: 'Chordal' }, // 0 3 6
  { id: 'chordAug',      name: 'Augmented',       mask: 0x888, family: 'Chordal' }, // 0 4 8
  { id: 'chordSus2',     name: 'Sus 2',           mask: 0xA10, family: 'Chordal' }, // 0 2 7
  { id: 'chordSus4',     name: 'Sus 4',           mask: 0x850, family: 'Chordal' }, // 0 5 7
  { id: 'chordMaj7',     name: 'Maj 7',           mask: 0x891, family: 'Chordal' }, // 0 4 7 11
  { id: 'chordMin7',     name: 'Min 7',           mask: 0x912, family: 'Chordal' }, // 0 3 7 10
  { id: 'chordDom7',     name: 'Dom 7',           mask: 0x892, family: 'Chordal' }, // 0 4 7 10
  { id: 'chordHalfDim7', name: 'Half-Dim 7',      mask: 0x922, family: 'Chordal' }, // 0 3 6 10
  { id: 'chordDim7',     name: 'Dim 7',           mask: 0x924, family: 'Chordal' }, // 0 3 6 9
];

// Pitch-class names — split into all-sharp / all-flat tables so the
// chromatic notation toggle (♯/♭) in the top bar can swap between them.
// Source/ScaleLattice.h uses the same convention: false = sharps, true = flats.
const PITCH_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const PITCH_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];

// Backward-compat: PITCH_SHORT used to be a mixed-spelling array (sharps for
// C♯/F♯, flats for E♭/A♭/B♭).  Keep it pointing at the sharps table so any
// stale call site degrades to a sensible default; new code should call
// pitchName(pc, useFlats) instead.
const PITCH_NAMES = PITCH_SHARP;
const PITCH_SHORT = PITCH_SHARP;

// Resolve a pitch class index (0..11) to a name using the active spelling.
function pitchName(pc, useFlats) {
  return (useFlats ? PITCH_FLAT : PITCH_SHARP)[((pc % 12) + 12) % 12];
}

// Utility: bit i of mask (i=0 → C, i=11 → B when MSB order)
function pcActive(mask, pc) {
  return (mask >> (11 - pc)) & 1;
}
function togglePc(mask, pc) {
  return mask ^ (1 << (11 - pc));
}

Object.assign(window, {
  PAPER, LANES, SCALES,
  PITCH_NAMES, PITCH_SHORT, PITCH_SHARP, PITCH_FLAT,
  pitchName,
  pcActive, togglePc,
});
