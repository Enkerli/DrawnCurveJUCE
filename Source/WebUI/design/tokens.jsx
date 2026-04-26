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
const SCALES = [
  // Diatonic modes
  { id: 'major',        name: 'Major (Ionian)',       mask: 0b101011010101, family: 'Diatonic' },
  { id: 'dorian',       name: 'Dorian',               mask: 0b101101010110, family: 'Diatonic' },
  { id: 'phrygian',     name: 'Phrygian',             mask: 0b110101011010, family: 'Diatonic' },
  { id: 'lydian',       name: 'Lydian',               mask: 0b101010110101, family: 'Diatonic' },
  { id: 'mixolydian',   name: 'Mixolydian',           mask: 0b101011010110, family: 'Diatonic' },
  { id: 'minor',        name: 'Aeolian (Nat. Minor)', mask: 0b101101011010, family: 'Diatonic' },
  { id: 'locrian',      name: 'Locrian',              mask: 0b110101101010, family: 'Diatonic' },
  // Pentatonic
  { id: 'pentMaj',      name: 'Major',                mask: 0b101010010100, family: 'Pentatonic' },
  { id: 'pentMin',      name: 'Minor',                mask: 0b100101010010, family: 'Pentatonic' },
  { id: 'egyptian',     name: 'Egyptian',             mask: 0b101001010010, family: 'Pentatonic' },
  { id: 'blues',        name: 'Blues',                mask: 0b100101110010, family: 'Pentatonic' },
  // Symmetric
  { id: 'chromatic',    name: 'Chromatic',            mask: 0b111111111111, family: 'Symmetric' },
  { id: 'wholeTone',    name: 'Whole Tone',           mask: 0b101010101010, family: 'Symmetric' },
  { id: 'dimHW',        name: 'Diminished (h-w)',     mask: 0b110110110110, family: 'Symmetric' },
  { id: 'dimWH',        name: 'Diminished (w-h)',     mask: 0b101101101101, family: 'Symmetric' },
  { id: 'augmented',    name: 'Augmented',            mask: 0b100110011001, family: 'Symmetric' },
  // Harmonic
  { id: 'harmMinor',    name: 'Harmonic Minor',       mask: 0b101101011001, family: 'Harmonic' },
  { id: 'melMinor',     name: 'Melodic Minor',        mask: 0b101101010101, family: 'Harmonic' },
  { id: 'hungarianMin', name: 'Hungarian Minor',      mask: 0b101100111001, family: 'Harmonic' },
];

const PITCH_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const PITCH_SHORT = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];

// Utility: bit i of mask (i=0 → C, i=11 → B when MSB order)
function pcActive(mask, pc) {
  return (mask >> (11 - pc)) & 1;
}
function togglePc(mask, pc) {
  return mask ^ (1 << (11 - pc));
}

Object.assign(window, { PAPER, LANES, SCALES, PITCH_NAMES, PITCH_SHORT, pcActive, togglePc });
