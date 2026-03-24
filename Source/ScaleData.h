#pragma once

/**
 * @file ScaleData.h
 *
 * dcScale — pitch-class set families, modes, and transformations.
 *
 * Bitmask convention (matches ScaleLattice and GestureEngine):
 *   bit (11 - interval) = 1  →  interval is active in the scale.
 *   bit 11 = interval 0 (root/unison)
 *   bit 10 = interval 1 (minor 2nd)
 *   …
 *   bit  0 = interval 11 (major 7th)
 *
 * All data is root-relative: the same mask means the same interval pattern
 * regardless of which pitch class is the root.  The root is a separate
 * parameter (scaleRoot).
 *
 * Header-only — no .cpp required.  No JUCE dependency.
 */

#include <cstdint>
#include <cstring>
#include <iterator>   // std::size

//==============================================================================
namespace dcScale
{

//──────────────────────────────────────────────────────────────────────────────
// Data structures
//──────────────────────────────────────────────────────────────────────────────

struct Entry
{
    const char* name;
    uint16_t    mask;
};

struct Family
{
    const char*   name;
    const Entry*  modes;
    int           count;
};

/** Result of recognising a mask against the built-in database. */
struct ScaleID
{
    int  family;   ///< Index into kFamilies[], or -1 if unrecognised.
    int  mode;     ///< Index into kFamilies[family].modes[], or -1.
    bool exact;    ///< true = exact match, false = unrecognised / custom.
};

//──────────────────────────────────────────────────────────────────────────────
// Family mode tables
//──────────────────────────────────────────────────────────────────────────────

// ── 0: Diatonic ──────────────────────────────────────────────────────────────
//    All seven modes of the diatonic (major) scale.
//    Ionian mask 0xAD5 verified against kScalePresetMasks in PluginProcessor.
static constexpr Entry kDiatonic[] =
{
    { "Ionian",      0xAD5 },   // 0 2 4 5 7 9 11  — Major
    { "Dorian",      0xB56 },   // 0 2 3 5 7 9 10
    { "Phrygian",    0xD5A },   // 0 1 3 5 7 8 10
    { "Lydian",      0xAB5 },   // 0 2 4 6 7 9 11
    { "Mixolydian",  0xAD6 },   // 0 2 4 5 7 9 10
    { "Aeolian",     0xB5A },   // 0 2 3 5 7 8 10  — Natural Minor
    { "Locrian",     0xD6A },   // 0 1 3 5 6 8 10
};

// ── 1: Pentatonic ─────────────────────────────────────────────────────────────
//    Five modes of the major pentatonic (rotation family).
static constexpr Entry kPentatonic[] =
{
    { "Major",       0xA94 },   // 0 2 4 7 9
    { "Suspended",   0xA52 },   // 0 2 5 7 10   (Egyptian)
    { "Man Gong",    0x94A },   // 0 3 5 8 10
    { "Ritusen",     0xA54 },   // 0 2 5 7 9
    { "Minor",       0x952 },   // 0 3 5 7 10
};

// ── 2: Jazz Minor ─────────────────────────────────────────────────────────────
//    Seven modes of the melodic minor (ascending) scale.
static constexpr Entry kJazzMinor[] =
{
    { "Jazz Minor",        0xB55 },   // 0 2 3 5 7 9 11
    { "Dorian \u266d2",    0xD56 },   // 0 1 3 5 7 9 10  (Phrygian \u266e6)
    { "Lydian Aug.",       0xAAD },   // 0 2 4 6 8 9 11
    { "Lydian Dom.",       0xAB6 },   // 0 2 4 6 7 9 10  (Overtone)
    { "Mixo. \u266d6",     0xADA },   // 0 2 4 5 7 8 10  (Hindu)
    { "Half-Dim.",         0xB6A },   // 0 2 3 5 6 8 10  (Locrian \u266e2)
    { "Altered",           0xDAA },   // 0 1 3 4 6 8 10  (Super Locrian)
};

// ── 3: Harmonic Minor ─────────────────────────────────────────────────────────
//    Seven modes of the harmonic minor scale.
static constexpr Entry kHarmonicMinor[] =
{
    { "Harmonic Minor",    0xB59 },   // 0 2 3 5 7 8 11
    { "Locrian \u266e6",   0xD66 },   // 0 1 3 5 6 9 10
    { "Ionian \u266f5",    0xACD },   // 0 2 4 5 8 9 11  (Augmented Major)
    { "Ukrainian Dor.",    0xB36 },   // 0 2 3 6 7 9 10  (Dorian \u266f4)
    { "Phrygian Dom.",     0xCDA },   // 0 1 4 5 7 8 10  (Spanish)
    { "Lydian \u266f2",    0x9B5 },   // 0 3 4 6 7 9 11
    { "Ultra Locrian",     0xDAC },   // 0 1 3 4 6 8 9
};

// ── 4: Symmetric ──────────────────────────────────────────────────────────────
static constexpr Entry kSymmetric[] =
{
    { "Whole Tone",        0xAAA },   // 0 2 4 6 8 10
    { "Dim. WH",           0xB6D },   // 0 2 3 5 6 8 9 11  (whole-half)
    { "Dim. HW",           0xDB6 },   // 0 1 3 4 6 7 9 10  (half-whole)
    { "Augmented",         0x999 },   // 0 3 4 7 8 11
};

// ── 5: Bebop ──────────────────────────────────────────────────────────────────
//    8-note bebop scales (diatonic + one chromatic passing tone each).
static constexpr Entry kBebop[] =
{
    { "Dominant",     0xAD7 },   // 0 2 4 5 7 9 10 11  (Mixolydian + maj7)
    { "Major",        0xADD },   // 0 2 4 5 7 8 9 11  (Major + b6)
    { "Minor",        0xB5B },   // 0 2 3 5 7 8 10 11  (Nat. Minor + maj7)
    { "Mel. Minor",   0xB57 },   // 0 2 3 5 7 9 10 11  (Mel. Minor + nat7)
};

// ── 6: Blues ──────────────────────────────────────────────────────────────────
static constexpr Entry kBlues[] =
{
    { "Blues",        0x972 },   // 0 3 5 6 7 10  — hexatonic
    { "Major Blues",  0xB94 },   // 0 2 3 4 7 9
};

// ── 7: Chordal ────────────────────────────────────────────────────────────────
//    Triads and seventh chords as degenerate scales (2–4 notes).
//    Useful for chord-tone quantization / "glorified arp" workflows.
static constexpr Entry kChordal[] =
{
    { "Major",         0x890 },   // 0 4 7
    { "Minor",         0x910 },   // 0 3 7
    { "Diminished",    0x920 },   // 0 3 6
    { "Augmented",     0x888 },   // 0 4 8
    { "Sus 2",         0xA10 },   // 0 2 7
    { "Sus 4",         0x850 },   // 0 5 7
    { "Maj 7",         0x891 },   // 0 4 7 11
    { "Min 7",         0x912 },   // 0 3 7 10
    { "Dom 7",         0x892 },   // 0 4 7 10
    { "Half-Dim 7",    0x922 },   // 0 3 6 10
    { "Dim 7",         0x924 },   // 0 3 6 9
};

//──────────────────────────────────────────────────────────────────────────────
// Master family list
//──────────────────────────────────────────────────────────────────────────────

static constexpr Family kFamilies[] =
{
    { "Diatonic",       kDiatonic,      7  },
    { "Pentatonic",     kPentatonic,    5  },
    { "Jazz Minor",     kJazzMinor,     7  },
    { "Harm. Minor",    kHarmonicMinor, 7  },
    { "Symmetric",      kSymmetric,     4  },
    { "Bebop",          kBebop,         4  },
    { "Blues",          kBlues,         2  },
    { "Chordal",        kChordal,       11 },
};

static constexpr int kNumFamilies = static_cast<int> (std::size (kFamilies));

//──────────────────────────────────────────────────────────────────────────────
// Transformations
//──────────────────────────────────────────────────────────────────────────────

/**
 * Rotate the pitch-class set up by @p semitones.
 *
 * Rotating a mask and then updating scaleRoot by the same amount produces a
 * transposition.  Rotating the mask while keeping scaleRoot fixed changes the
 * mode (same notes, different tonic emphasis).
 *
 * Internally: left-rotate the 12-bit word by @p semitones positions.
 * E.g. rotating Ionian by 2 yields Dorian (same PCS, root shifts up 2).
 */
inline uint16_t pcsRotate (uint16_t mask, int semitones) noexcept
{
    semitones = ((semitones % 12) + 12) % 12;
    if (semitones == 0) return mask;
    return static_cast<uint16_t> (((mask << semitones) | (mask >> (12 - semitones))) & 0xFFF);
}

/**
 * Return the complement: all 12 notes that are NOT in the given set.
 * Complement of Chromatic (0xFFF) → empty (0x000), and vice-versa.
 */
inline uint16_t pcsComplement (uint16_t mask) noexcept
{
    return static_cast<uint16_t> ((~mask) & 0xFFF);
}

/**
 * Return the canonical (prime) form: the lowest-valued rotation of the mask.
 * Useful as a rotation-invariant identifier for a scale type.
 */
inline uint16_t pcsCanonical (uint16_t mask) noexcept
{
    uint16_t best = mask;
    for (int i = 1; i < 12; ++i)
    {
        const uint16_t rot = pcsRotate (mask, i);
        if (rot < best) best = rot;
    }
    return best;
}

/** Count active notes in a mask. */
inline int pcsNoteCount (uint16_t mask) noexcept
{
    int n = 0;
    for (int i = 0; i < 12; ++i) n += (mask >> i) & 1;
    return n;
}

//──────────────────────────────────────────────────────────────────────────────
// Recognition
//──────────────────────────────────────────────────────────────────────────────

/**
 * Identify a mask against the built-in family/mode database.
 *
 * Returns { family, mode, true } on an exact match, or { -1, -1, false }
 * if the mask is not found (custom / user-edited state).
 *
 * Matching is root-relative: the mask must equal the stored entry exactly.
 * Chromatic (0xFFF) and empty (0x000) are intentionally not in the database;
 * callers should check for these special cases before calling pcsRecognise.
 */
inline ScaleID pcsRecognise (uint16_t mask) noexcept
{
    for (int f = 0; f < kNumFamilies; ++f)
    {
        const Family& fam = kFamilies[f];
        for (int m = 0; m < fam.count; ++m)
        {
            if (fam.modes[m].mask == mask)
                return { f, m, true };
        }
    }
    return { -1, -1, false };
}

} // namespace dcScale
