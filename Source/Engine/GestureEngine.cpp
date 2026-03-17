#include "GestureEngine.hpp"
#include <cmath>
#include <algorithm>

// ---------------------------------------------------------------------------
// UI-thread methods
// ---------------------------------------------------------------------------

void GestureEngine::setSnapshot (const LaneSnapshot* snapshot)
{
    _snapshot.store (snapshot, std::memory_order_release);
}

void GestureEngine::clearSnapshot()
{
    _snapshot.store  (nullptr, std::memory_order_release);
    _isPlaying.store (false,   std::memory_order_release);
}

void GestureEngine::setPlaying (bool playing)
{
    _isPlaying.store (playing, std::memory_order_release);
    if (! playing)
        _noteOffNeeded.store (true, std::memory_order_release);
}

void GestureEngine::reset()
{
    _noteOffNeeded.store (false, std::memory_order_relaxed);
    _runtime.playheadSeconds = 0.0;
    _runtime.lastSentValue   = -1;
    _runtime.smoothedValue   = 0.0f;
    _currentPhase.store (0.0f, std::memory_order_relaxed);
}

void GestureEngine::setScaleConfig (ScaleConfig config)
{
    _scalePacked.store (packScale (config), std::memory_order_release);
}

bool  GestureEngine::getPlaying()      const { return _isPlaying.load (std::memory_order_acquire); }
float GestureEngine::getCurrentPhase() const { return _currentPhase.load (std::memory_order_relaxed); }

// ---------------------------------------------------------------------------
// Static utilities
// ---------------------------------------------------------------------------

/**
 * Quantize rawNote to the nearest active scale note.
 *
 * The search checks up to 6 semitones in each direction.  On a tie the
 * tiebreaker (movingUp) chooses which octave direction to prefer — this
 * makes the quantization feel "intentional" as the curve crosses a midpoint.
 *
 * Octave boundaries are respected: we never return a note below 0 or above 127.
 */
int GestureEngine::quantizeNote (int rawNote, ScaleConfig sc, bool movingUp)
{
    if (sc.mask == 0xFFF) return rawNote;   // chromatic — no quantization

    rawNote = std::clamp (rawNote, 0, 127);

    const int pc       = rawNote % 12;
    const int interval = (pc - (int)sc.root + 12) % 12;

    if ((sc.mask >> interval) & 1) return rawNote;  // already a scale note

    int downNote = -1, upNote = -1;

    for (int d = 1; d <= 6; ++d)
    {
        if (downNote < 0 && rawNote - d >= 0)
        {
            const int di = (interval - d + 12) % 12;
            if ((sc.mask >> di) & 1)
                downNote = rawNote - d;
        }
        if (upNote < 0 && rawNote + d <= 127)
        {
            const int ui = (interval + d) % 12;
            if ((sc.mask >> ui) & 1)
                upNote = rawNote + d;
        }
        if (downNote >= 0 && upNote >= 0) break;
    }

    if (downNote < 0 && upNote < 0) return rawNote;  // empty mask edge case
    if (downNote < 0) return upNote;
    if (upNote < 0)   return downNote;

    const int dDown = rawNote - downNote;
    const int dUp   = upNote  - rawNote;
    if (dDown == dUp)  return movingUp ? upNote : downNote;   // tiebreaker
    return (dDown < dUp) ? downNote : upNote;
}

// ---------------------------------------------------------------------------
// Render-thread helpers
// ---------------------------------------------------------------------------

float GestureEngine::sampleCurve (const LaneSnapshot& snap, float phase) const
{
    const float idx  = phase * 255.0f;
    const int   i0   = static_cast<int> (idx);
    const int   i1   = (i0 + 1) & 255;
    const float frac = idx - static_cast<float> (i0);
    return snap.table[static_cast<size_t> (i0)]
         + frac * (snap.table[static_cast<size_t> (i1)]
                 - snap.table[static_cast<size_t> (i0)]);
}

// ---------------------------------------------------------------------------
// processBlock — render thread
// ---------------------------------------------------------------------------

void GestureEngine::processBlock (uint32_t frameCount, double sampleRate,
                                   const MIDIOut& midiOut,
                                   float speedRatio, PlaybackDirection direction)
{
    const auto* snap = _snapshot.load (std::memory_order_acquire);
    if (! snap || ! snap->valid) return;

    // ── Note Off cleanup ──────────────────────────────────────────────────────
    if (_noteOffNeeded.exchange (false, std::memory_order_acq_rel))
    {
        if (snap->messageType == MessageType::Note
            && _runtime.lastSentValue >= 0 && midiOut)
        {
            midiOut (0x80u | (snap->midiChannel & 0x0Fu),
                     static_cast<uint8_t> (_runtime.lastSentValue), 0u);
        }
        _runtime.lastSentValue = -1;
    }

    if (! _isPlaying.load (std::memory_order_acquire)) return;

    const double effectiveDur = static_cast<double> (snap->durationSeconds)
                                / static_cast<double> (std::max (speedRatio, 0.001f));

    // ── Advance playhead ──────────────────────────────────────────────────────
    _runtime.playheadSeconds += static_cast<double> (frameCount) / sampleRate;

    // ── Phase (direction-dependent) ───────────────────────────────────────────
    float phase;
    if (direction == PlaybackDirection::Reverse)
    {
        if (_runtime.playheadSeconds >= effectiveDur)
            _runtime.playheadSeconds = std::fmod (_runtime.playheadSeconds, effectiveDur);
        phase = 1.0f - static_cast<float> (_runtime.playheadSeconds / effectiveDur);
    }
    else if (direction == PlaybackDirection::PingPong)
    {
        const double ppDur = 2.0 * effectiveDur;
        if (_runtime.playheadSeconds >= ppDur)
            _runtime.playheadSeconds = std::fmod (_runtime.playheadSeconds, ppDur);
        const double frac = _runtime.playheadSeconds / effectiveDur;
        phase = (frac <= 1.0) ? static_cast<float> (frac)
                              : static_cast<float> (2.0 - frac);
    }
    else
    {
        if (_runtime.playheadSeconds >= effectiveDur)
            _runtime.playheadSeconds = std::fmod (_runtime.playheadSeconds, effectiveDur);
        phase = static_cast<float> (_runtime.playheadSeconds / effectiveDur);
    }

    const float target = sampleCurve (*snap, phase);
    _currentPhase.store (phase, std::memory_order_relaxed);

    // ── One-pole smoother ─────────────────────────────────────────────────────
    const float alpha = (snap->smoothing <= 0.0f)
        ? 1.0f
        : 1.0f - std::exp (- static_cast<float> (frameCount)
                           / (snap->smoothing * 2.0f * static_cast<float> (sampleRate)));
    _runtime.smoothedValue += alpha * (target - _runtime.smoothedValue);

    // ── Output range mapping ──────────────────────────────────────────────────
    const float ranged = snap->minOut + _runtime.smoothedValue * (snap->maxOut - snap->minOut);

    // ── Emit MIDI ─────────────────────────────────────────────────────────────
    switch (snap->messageType)
    {
        case MessageType::CC:
        {
            const int v = std::clamp (static_cast<int> (std::lround (ranged * 127.0f)), 0, 127);
            if (v != _runtime.lastSentValue)
            {
                if (midiOut) midiOut (0xB0u | (snap->midiChannel & 0x0Fu), snap->ccNumber, static_cast<uint8_t> (v));
                _runtime.lastSentValue = v;
            }
            break;
        }
        case MessageType::ChannelPressure:
        {
            const int v = std::clamp (static_cast<int> (std::lround (ranged * 127.0f)), 0, 127);
            if (v != _runtime.lastSentValue)
            {
                if (midiOut) midiOut (0xD0u | (snap->midiChannel & 0x0Fu), static_cast<uint8_t> (v), 0u);
                _runtime.lastSentValue = v;
            }
            break;
        }
        case MessageType::PitchBend:
        {
            const int v = std::clamp (static_cast<int> (std::lround (ranged * 16383.0f)), 0, 16383);
            if (v != _runtime.lastSentValue)
            {
                if (midiOut) midiOut (0xE0u | (snap->midiChannel & 0x0Fu),
                                     static_cast<uint8_t> (v & 0x7F),
                                     static_cast<uint8_t> ((v >> 7) & 0x7F));
                _runtime.lastSentValue = v;
            }
            break;
        }
        case MessageType::Note:
        {
            // Raw pitch from curve.
            const int rawNote = std::clamp (static_cast<int> (std::lround (ranged * 127.0f)), 0, 127);

            // Scale quantization (no-op when mask == 0xFFF).
            const ScaleConfig sc = unpackScale (_scalePacked.load (std::memory_order_acquire));
            const bool movingUp  = (_runtime.lastSentValue < 0)
                                || (rawNote >= _runtime.lastSentValue);
            const int note = quantizeNote (rawNote, sc, movingUp);

            if (note != _runtime.lastSentValue)
            {
                if (midiOut)
                {
                    if (_runtime.lastSentValue >= 0)
                        midiOut (0x80u | (snap->midiChannel & 0x0Fu),
                                 static_cast<uint8_t> (_runtime.lastSentValue), 0u);
                    midiOut (0x90u | (snap->midiChannel & 0x0Fu),
                             static_cast<uint8_t> (note), snap->noteVelocity);
                }
                _runtime.lastSentValue = note;
            }
            break;
        }
    }
}
