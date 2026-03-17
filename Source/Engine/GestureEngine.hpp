#pragma once
#include "LaneSnapshot.hpp"
#include <atomic>
#include <functional>
#include <cstdint>

/**
 * @file GestureEngine.hpp
 *
 * Real-time, lock-minimised MIDI playback engine.
 *
 * Threading
 * ─────────
 * UI thread  : setSnapshot / clearSnapshot / setPlaying / setScaleConfig
 * Audio thread: processBlock (or fallback HiRes timer — never both at once)
 * All cross-thread state uses std::atomic with explicit ordering.
 */

// ---------------------------------------------------------------------------
/**
 * Scale quantization configuration.
 *
 * mask  — 12-bit interval pattern, root-relative.
 *         Bit 0 = root is active, bit 1 = root+1 semitone active, …, bit 11 = root+11.
 *         0xFFF = chromatic (all notes) = no quantization.
 *
 * root  — root pitch class (0=C, 1=C#/Db, …, 11=B).
 *
 * Built-in preset masks (all root-relative):
 *   Chromatic      : 0xFFF   (all 12)
 *   Major          : 0xAB5   (0,2,4,5,7,9,11)
 *   Natural Minor  : 0x5AD   (0,2,3,5,7,8,10)
 *   Dorian         : 0x6AD   (0,2,3,5,7,9,10)
 *   Pentatonic Maj : 0x295   (0,2,4,7,9)
 *   Pentatonic Min : 0x4A9   (0,3,5,7,10)
 *   Blues          : 0x4E9   (0,3,5,6,7,10)
 *   Custom         : user-defined mask
 *
 * The bitmask decimal notation (user-facing): bits are read left-to-right as
 * C, C#, D, D#, E, F, F#, G, G#, A, A#, B (i.e., C = most significant of the
 * 12-bit value). This is the reverse of the internal root-relative ordering.
 * Conversion is handled in the UI layer; the engine always uses root-relative
 * internal ordering.
 */
struct ScaleConfig
{
    uint16_t mask { 0xFFF };   ///< Root-relative 12-bit interval mask; 0xFFF = chromatic
    uint8_t  root { 0     };   ///< Root pitch class (0=C … 11=B)
};

// ---------------------------------------------------------------------------
/// Per-lane runtime state — render thread only.
struct LaneRuntime
{
    double playheadSeconds = 0.0;   ///< Elapsed time within current loop period
    int    lastSentValue   = -1;    ///< Last emitted value; -1 = nothing sent yet
    float  smoothedValue   = 0.0f;  ///< One-pole smoother accumulator
};

// ---------------------------------------------------------------------------
/**
 * Real-time-safe MIDI playback engine.
 */
class GestureEngine
{
public:
    using MIDIOut = std::function<void(uint8_t status, uint8_t data1, uint8_t data2)>;

    // ── UI-thread API ─────────────────────────────────────────────────────────
    void setSnapshot    (const LaneSnapshot* snapshot);
    void clearSnapshot  ();
    void setPlaying     (bool playing);
    void reset          ();

    /// Update scale quantization config atomically (safe to call any time).
    void setScaleConfig (ScaleConfig config);

    // ── Query API (UI or render thread) ──────────────────────────────────────
    bool  getPlaying()      const;
    float getCurrentPhase() const;

    // ── Render-thread API ─────────────────────────────────────────────────────
    /**
     * Advance the playhead and emit MIDI.
     * @param speedRatio  >1 = faster; <1 = slower.
     * @param direction   Forward / Reverse / PingPong.
     */
    void processBlock (uint32_t frameCount, double sampleRate, const MIDIOut& midiOut,
                       float speedRatio = 1.0f,
                       PlaybackDirection direction = PlaybackDirection::Forward);

    // ── Utility (also called from UI for Y-axis display) ─────────────────────
    /**
     * Quantize rawNote to the nearest active scale note.
     * @param movingUp  Tiebreaker: true prefers the higher note on equal distance.
     * @return  Clamped MIDI note in [0, 127].
     */
    static int quantizeNote (int rawNote, ScaleConfig sc, bool movingUp);

private:
    std::atomic<const LaneSnapshot*> _snapshot     { nullptr };
    std::atomic<bool>                _isPlaying     { false   };
    std::atomic<float>               _currentPhase  { 0.0f   };
    std::atomic<bool>                _noteOffNeeded { false   };

    /// Packed ScaleConfig: bits 0-11 = mask, bits 12-15 = root.
    std::atomic<uint32_t>            _scalePacked   { 0xFFF   };

    LaneRuntime _runtime;   ///< Render-thread only

    float sampleCurve (const LaneSnapshot& snap, float phase) const;

    static uint32_t    packScale   (ScaleConfig s) noexcept { return (uint32_t(s.root) << 12) | s.mask; }
    static ScaleConfig unpackScale (uint32_t p)    noexcept { return { uint16_t(p & 0xFFF), uint8_t(p >> 12) }; }
};
