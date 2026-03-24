#pragma once

/**
 * @file PCSPreview.h
 *
 * PCSPreview — compact 12-dot horizontal strip showing which pitch classes
 * are active in a scale mask.
 *
 * Rendered left-to-right as intervals 0–11 from root (C C# D D# E F F# G G# A A# B).
 * Active notes are drawn filled; inactive notes are drawn as dim outlines.
 *
 * Intended use: inside subfamily selection chips in the scale family browser,
 * so the user can visually compare scale shapes without selecting each one.
 *
 * Bitmask convention matches ScaleLattice and ScaleData.h:
 *   bit (11 - interval) = 1 → interval is active.
 *
 * Header-only — no .cpp required.
 */

#include <juce_gui_basics/juce_gui_basics.h>
#include "ScaleData.h"   // for dcScale::pcsNoteCount (optional, not strictly needed)

//==============================================================================
class PCSPreview : public juce::Component
{
public:
    PCSPreview()  = default;
    ~PCSPreview() override = default;

    //──────────────────────────────────────────────────────────────────────────
    // API

    /** Update the displayed mask without triggering any callback. */
    void setMask (uint16_t m) { if (_mask != m) { _mask = m; repaint(); } }
    uint16_t getMask() const noexcept { return _mask; }

    //──────────────────────────────────────────────────────────────────────────
    // Colours — set from applyTheme() or left at defaults

    juce::Colour colOn     { 0xffC9D6E3 };  ///< Active note fill
    juce::Colour colOff    { 0xff263240 };  ///< Inactive note fill
    juce::Colour colBorder { 0xff4A6070 };  ///< Inactive note border (stroke)

    //──────────────────────────────────────────────────────────────────────────
    // juce::Component

    void paint (juce::Graphics& g) override
    {
        const float w = static_cast<float> (getWidth());
        const float h = static_cast<float> (getHeight());
        if (w < 1.0f || h < 1.0f) return;

        // Dot radius: fit 12 dots across width with equal gaps, capped by height.
        const float step = w / 12.0f;
        const float r    = juce::jmin (h * 0.42f, step * 0.44f);
        const float cy   = h * 0.5f;

        for (int i = 0; i < 12; ++i)
        {
            // interval i → bit (11 - i)
            const bool active = ((_mask >> (11 - i)) & 1) != 0;
            const float cx = step * 0.5f + static_cast<float> (i) * step;

            if (active)
            {
                g.setColour (colOn);
                g.fillEllipse (cx - r, cy - r, r * 2.0f, r * 2.0f);
            }
            else
            {
                g.setColour (colOff);
                g.fillEllipse (cx - r, cy - r, r * 2.0f, r * 2.0f);
                g.setColour (colBorder);
                g.drawEllipse (cx - r, cy - r, r * 2.0f, r * 2.0f, 0.8f);
            }
        }
    }

    void resized() override {}   // layout is purely proportional — nothing to compute

private:
    uint16_t _mask { 0xAD5 };   // Default: Ionian (Major)

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PCSPreview)
};
