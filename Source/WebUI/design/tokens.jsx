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

// Scale presets (pitch-class bitmasks, MSB = C)
const SCALES = [
  { id: 'chromatic', name: 'Chromatic',   mask: 0b111111111111 },
  { id: 'major',     name: 'Major',       mask: 0b101011010101 },
  { id: 'minor',     name: 'Nat. Minor',  mask: 0b101101011010 },
  { id: 'dorian',    name: 'Dorian',      mask: 0b101101010110 },
  { id: 'pentMaj',   name: 'Pent. Maj',   mask: 0b101010010100 },
  { id: 'pentMin',   name: 'Pent. Min',   mask: 0b100101010010 },
  { id: 'blues',     name: 'Blues',       mask: 0b100101110010 },
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
