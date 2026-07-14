#pragma once
#include "LaneSnapshot.hpp"
#include <atomic>
#include <functional>
#include <array>
#include <cstdint>

/**
 * @file GestureEngine.hpp
 *
 * Real-time, lock-minimised MIDI playback engine.
 *
 * Threading
 * ─────────
 * UI thread  : setSnapshot / clearSnapshot / setPlaying / setScaleConfig / setLaneEnabled
 * Audio thread: processBlock (or fallback HiRes timer — never both at once)
 * All cross-thread state uses std::atomic with explicit ordering.
 *
 * Multi-lane, multi-qurve
 * ───────────────────────
 * Up to kMaxLanes lanes play simultaneously.  Each lane holds up to kMaxQurves
 * independent curves ("qurves"), each with its own snapshot, playhead, and —
 * in Note mode — its own held-note tracking, so one note lane can sound
 * polyphonically (several drawn curves looping over the same routing/scale).
 * CC/PB/AT lanes remain monophonic by policy: the UI only ever populates
 * qurve 0 for those message types (the engine itself is type-agnostic).
 *
 * Lane-level configuration is SHARED by all of a lane's qurves: enabled/mute,
 * pause, scale quantization, speed, and direction.  Playback (isPlaying) and
 * the global phase display (currentPhase) are shared across all lanes.  Each
 * qurve's curve advances its own playheadSeconds using the common speed ratio,
 * so curves recorded at different durations loop at their natural rates.
 */

static constexpr int kMaxLanes  = 4;
static constexpr int kMaxQurves = 4;   ///< Max independent curves per (note) lane

// ---------------------------------------------------------------------------
/**
 * Scale quantization configuration.
 *
 * mask  — 12-bit interval pattern, root-relative.
 *         Bit 0 = root is active, bit 1 = root+1 semitone active, …, bit 11 = root+11.
 *         0xFFF = chromatic (all notes) = no quantization.
 *
 * root  — root pitch class (0=C, 1=C#/Db, …, 11=B).
 */
struct ScaleConfig
{
    uint16_t mask { 0xFFF };   ///< Root-relative 12-bit interval mask; 0xFFF = chromatic
    uint8_t  root { 0     };   ///< Root pitch class (0=C … 11=B)
};

// ---------------------------------------------------------------------------
/// Per-qurve runtime state — render thread only.
struct LaneRuntime
{
    double  playheadSeconds  = 0.0;   ///< Elapsed playback time within the current loop period
    int     lastSentValue    = -1;    ///< Last emitted value (-1 = nothing sent yet); for dedup + Note Off
    uint8_t lastSentChannel  = 0;     ///< MIDI channel used for the last Note On; used for matching Note Off
                                      ///<  even if the snapshot is replaced or cleared between events.
    float   smoothedValue    = 0.0f;  ///< One-pole smoother state
    int     lastXTick        = -1;    ///< Last committed X-grid tick index (for xQuantize dedup; -1 = none)
};

// ---------------------------------------------------------------------------
/**
 * Real-time-safe MIDI playback engine supporting kMaxLanes lanes of up to
 * kMaxQurves polyphonic curves each.
 */
class GestureEngine
{
public:
    using MIDIOut = std::function<void(uint8_t status, uint8_t data1, uint8_t data2)>;

    GestureEngine();

    // ── UI-thread API ─────────────────────────────────────────────────────────
    /// Install/replace the snapshot for one qurve of a lane.
    void setSnapshot    (int lane, int qurve, const LaneSnapshot* snapshot);
    /// Back-compat single-curve form — targets qurve 0.
    void setSnapshot    (int lane, const LaneSnapshot* snapshot) { setSnapshot (lane, 0, snapshot); }

    /// Clear ONE qurve of a lane (queues its Note Off).
    void clearQurve     (int lane, int qurve);
    /// Clear every qurve of a lane (queues all Note Offs).
    void clearSnapshot  (int lane);
    void clearAllSnapshots();
    void setPlaying     (bool playing);
    void reset          ();

    /// Reset all qurves and seed each smoother from the correct starting phase
    /// for the given direction.  Use this in host-sync start events so that
    /// Reverse/PingPong begin at their correct curve position without a
    /// "glide from zero" artefact caused by the standard reset()'s cold-start.
    void resetForDirection (PlaybackDirection dir);

    /// Send a Note Off for every qurve of one lane (sets _noteOffNeeded)
    /// without stopping other lanes.
    /// Call from beginCapture() on the UI thread before drawing a new curve.
    void stopLane       (int lane);
    /// Send a Note Off for one qurve only.
    void stopQurve      (int lane, int qurve);

    /// Rewind one qurve's playhead and smoother without clearing its note-off
    /// flag or lastSentValue.  Call from finalizeCapture() after loading a new
    /// snapshot.
    void resetQurve     (int lane, int qurve);
    /// Back-compat: rewind every qurve of the lane.
    void resetLane      (int lane);

    /// Update scale quantization config for one lane atomically (shared by its qurves).
    void setScaleConfig (int lane, ScaleConfig config);

    /// Mute/unmute a lane (all its qurves).  When transitioning from
    /// enabled→disabled, queues Note Offs for any held notes so playback on
    /// that lane silences cleanly.
    /// Safe to call from the render thread (processBlock) on every block.
    void setLaneEnabled (int lane, bool enabled);

    /// Pause / resume an individual lane (all its qurves) without affecting
    /// other lanes.  On pause the lane's Note Offs are queued immediately; on
    /// resume playback continues from the same playhead positions.
    void setLanePaused (int lane, bool paused);
    bool getLanePaused (int lane) const noexcept;

    /// Lock all looping qurves to the same normalized phase (0..1).
    /// When enabled, the first valid qurve acts as the phase master;
    /// all other looping qurves sample their curves at the same phase.
    /// One-shot qurves are unaffected and still run their own playheads.
    void setLanesSynced (bool synced);
    bool getLanesSynced () const noexcept;

    // ── Query API (UI or render thread) ──────────────────────────────────────
    bool  getPlaying()      const;
    /// Phase of the first valid playing qurve — for backward-compat UI use.
    float getCurrentPhase() const;
    /// Per-qurve phase (0-1); returns 0 if the qurve has no valid snapshot.
    float getCurrentPhaseForQurve (int lane, int qurve) const;
    /// Back-compat: qurve 0's phase.
    float getCurrentPhaseForLane (int lane) const { return getCurrentPhaseForQurve (lane, 0); }
    /// Last MIDI value emitted on this qurve (-1 = nothing committed yet).
    /// For Note: MIDI note number; for CC/AT: 0–127; for PB: 0–16383.
    /// Mirror of LaneRuntime::lastSentValue, written by the render thread
    /// after every commit so the UI thread can read it lock-free.
    int   getLastSentValueForQurve (int lane, int qurve) const noexcept;
    /// Back-compat: qurve 0's last value.
    int   getLastSentValue (int lane) const noexcept { return getLastSentValueForQurve (lane, 0); }

    // ── Render-thread API ─────────────────────────────────────────────────────
    /**
     * Advance all qurve playheads and emit MIDI.
     * @param speedRatio  >1 = faster; <1 = slower.  Applied equally to all lanes.
     * @param direction   Forward / Reverse / PingPong.
     */
    void processBlock (uint32_t frameCount, double sampleRate, const MIDIOut& midiOut,
                       float speedRatio = 1.0f,
                       PlaybackDirection direction = PlaybackDirection::Forward);

    /// Per-lane overload: each lane gets its own speed multiplier and direction
    /// (shared by that lane's qurves).
    void processBlock (uint32_t frameCount, double sampleRate, const MIDIOut& midiOut,
                       const std::array<float, kMaxLanes>& speedRatios,
                       const std::array<PlaybackDirection, kMaxLanes>& directions);

    /// Render-thread: anchor all looping qurve playheads to the given normalized
    /// phase (0..1), derived from the host's PPQ position each processBlock.
    /// Corrects for loop jumps and repositions so the engine stays locked to
    /// the host transport when syncEnabled is on.  One-shot qurves are skipped.
    /// @param phase        Target phase 0..1 (= fmod(ppqPos / syncBeats, 1))
    /// @param speedRatio   Global effective speed (same value passed to processBlock)
    void seekToPhase (float phase, float speedRatio) noexcept;

    // ── Utility (also called from UI for Y-axis display) ─────────────────────
    static int quantizeNote (int rawNote, ScaleConfig sc, bool movingUp);

private:
    static constexpr int kMaxSlots = kMaxLanes * kMaxQurves;
    static constexpr int slotOf (int lane, int qurve) noexcept { return lane * kMaxQurves + qurve; }
    static constexpr int laneOf (int slot) noexcept            { return slot / kMaxQurves; }

    // Per-qurve ("slot") state
    std::array<std::atomic<const LaneSnapshot*>, kMaxSlots> _snapshots;
    std::array<std::atomic<bool>,                kMaxSlots> _noteOffNeeded;
    std::array<LaneRuntime,                      kMaxSlots> _runtimes;      ///< Render-thread only
    std::array<std::atomic<float>,               kMaxSlots> _slotPhases;    ///< Per-qurve phase 0..1

    /// UI-readable mirror of LaneRuntime::lastSentValue.  Updated by the render
    /// thread immediately after every rt.lastSentValue write so the cursor
    /// readout (CurveDisplay) can fetch the last committed value lock-free.
    std::array<std::atomic<int>, kMaxSlots> _lastSentMirror;

    // Per-lane state (shared by that lane's qurves)
    std::array<std::atomic<uint32_t>, kMaxLanes> _scalesPacked;
    std::array<std::atomic<bool>,     kMaxLanes> _laneEnabled;   ///< false = muted
    std::array<std::atomic<bool>,     kMaxLanes> _lanePaused;    ///< true = lane individually paused

    std::atomic<bool>  _isPlaying    { false };
    std::atomic<float> _currentPhase { 0.0f  };   ///< First valid qurve's phase (compat)

    std::atomic<bool> _lanesSynced  { false };

    /// Render-thread-only master clock used when _lanesSynced is true.
    double _syncMasterPlayhead  { 0.0 };
    /// Render-thread-only: tracks previous sync state so we can reset the
    /// master playhead cleanly the moment sync is first enabled.
    bool   _syncWasEnabled      { false };

    float sampleCurve (const LaneSnapshot& snap, float phase) const;

    /// Process one qurve (identified by flat slot index; the lane's shared
    /// config — enable/pause/scale — is read via laneOf(slot)).
    /// @param forcedPhase  When >= 0, looping qurves use this phase instead of
    ///                     their own playheadSeconds-derived phase.  One-shot
    ///                     qurves always use their own.
    void processSlot (int slot, uint32_t frameCount, double sampleRate,
                      const MIDIOut& midiOut,
                      float speedRatio, PlaybackDirection direction,
                      float forcedPhase = -1.0f);

    static uint32_t    packScale   (ScaleConfig s) noexcept { return (uint32_t(s.root) << 12) | s.mask; }
    static ScaleConfig unpackScale (uint32_t p)    noexcept { return { uint16_t(p & 0xFFF), uint8_t(p >> 12) }; }
};
