/**
 * @file PluginEditor.cpp
 *
 * Implementation of CurveDisplay and DrawnCurveEditor.
 */

#include "PluginEditor.h"

//==============================================================================
// Colour palettes
//==============================================================================

struct Theme
{
    juce::Colour background;
    juce::Colour gridLine;
    juce::Colour curve;
    juce::Colour capture;
    juce::Colour playhead;
    juce::Colour playheadDot;
    juce::Colour hint;
    juce::Colour border;
    juce::Colour panelBg;
};

static const Theme kDark
{
    juce::Colour { 0xff12121f },
    juce::Colour { 0x18ffffff },
    juce::Colour { 0xff00e5ff },
    juce::Colour { 0xffff6b35 },
    juce::Colour { 0xffffffff },
    juce::Colour { 0xff00e5ff },
    juce::Colour { 0x66ffffff },
    juce::Colour { 0x33ffffff },
    juce::Colour { 0xff1c1c2e },
};

static const Theme kLight
{
    juce::Colour { 0xffF5F2ED },
    juce::Colour { 0x14000000 },
    juce::Colour { 0xff0B6E4F },
    juce::Colour { 0xffD95C3A },
    juce::Colour { 0xff28261F },
    juce::Colour { 0xff0B6E4F },
    juce::Colour { 0x99000000 },
    juce::Colour { 0x1E000000 },
    juce::Colour { 0xffFDFCFA },
};

//==============================================================================
// Layout constants
//==============================================================================

namespace Layout
{
    static constexpr int editorW  = 640;
    static constexpr int editorH  = 700;
    static constexpr int pad      = 6;
    static constexpr int colGap   = 8;
    static constexpr int rightColW = 244;
    static constexpr int utilityRowH = 28;

    // Right column sections
    static constexpr int transportH   = 94;    // direction(38)+pad(4)+syncRow(44)+margins(8)
    static constexpr int shapingH     = 180;   // laneFocus(28)+gap(4)+smooth(44)+gap(4)+range(44)+gap(4)+phase(44)+margins(8)
    static constexpr int routingMatH  = 148;   // header(16)+3×row(28)+gaps(2×3=6)+gap(4)+detail(28)+margins(8) = 148

    // Left column
    static constexpr int yStepperW  = 28;
    static constexpr int xStepperH  = 28;
    // Note editor — family browser strip heights
    static constexpr int kFamilyBarH    = 30;   // family tab row
    static constexpr int kSubfamilyRowH = 68;   // mode-chip row (name + dot preview)
    static constexpr int kActionRowH    = 28;   // ↻ ● ○ ◑ ◆ + status labels

    static constexpr int paramLabelH  = 14;
    static constexpr int paramSliderH = 30;
    static constexpr int paramRowH    = paramLabelH + paramSliderH;  // 44

    // Routing matrix row geometry (fits 244 px column)
    // dot(12)+gap(4)+target(72)+gap(4)+detail(36)+gap(4)+chan(26)+gap(4)+teach(36)+gap(4)+mute(24) = 226 + margins(8) = 234 < 244
    static constexpr int matRowH     = 28;
    static constexpr int matDotW     = 12;
    static constexpr int matTargetW  = 72;
    static constexpr int matDetailW  = 36;  // was 28 (+8)
    static constexpr int matChanW    = 26;  // was 22 (+4)
    static constexpr int matTeachW   = 36;  // was 32 (+4)
    static constexpr int matMuteW    = 24;  // was 20 (+4)
    static constexpr int matInnerGap = 4;
}

// ---------------------------------------------------------------------------
// Helper: absolute pitch-class mask for lattice display
// ---------------------------------------------------------------------------

static uint16_t calcAbsLatticeMask (DrawnCurveProcessor& proc, int /*lane*/)
{
    // Scale is now global — lane argument kept for call-site compatibility.
    const int mode = static_cast<int> (proc.apvts.getRawParameterValue ("scaleMode")->load());
    const int root = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());

    if (mode == 7)
        return static_cast<uint16_t> (proc.apvts.getRawParameterValue ("scaleMask")->load());

    const auto sc = proc.getScaleConfig (0);   // global; lane irrelevant
    // Engine mask: bit (11 - interval) = interval present.
    // Lattice mask: bit (11 - abs_pc) = absolute pitch class present.
    uint16_t abs  = 0;
    for (int i = 0; i < 12; ++i)
        if ((sc.mask >> (11 - i)) & 1)
            abs |= static_cast<uint16_t> (1u << (11 - (i + root) % 12));
    return abs;
}

//==============================================================================
// HelpOverlay
//==============================================================================

HelpOverlay::HelpOverlay()
{
    setInterceptsMouseClicks (true, false);
    setVisible (false);
}

void HelpOverlay::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xd0000000));

    const auto bounds = getLocalBounds().toFloat().reduced (24.0f, 20.0f);
    g.setColour (juce::Colours::white);
    g.setFont (juce::Font (juce::FontOptions{}.withHeight (15.0f).withStyle ("Bold")));
    g.drawText ("DrawnCurve  Quick Reference",
                bounds.withHeight (22.0f).toNearestInt(),
                juce::Justification::centred, false);

    struct Entry { const char* label; const char* desc; };
    static const Entry kEntries[] =
    {
        { "CURVE AREA",  "Draw a curve with your finger or Pencil. Time flows left to right; MIDI value top to bottom. Each lane has its own curve." },
        { "Lane 1/2/3",  "Select the active lane. Each lane routes independently to its own MIDI target. Coloured dots show each lane's playhead position." },
        { "Direction",   "Forward, Reverse, or Ping-Pong playback. Tap the active segment to pause; tap again to resume. In SYNC mode, pause persists across host transport changes." },
        { "Clear",       "Erase ALL lane curves and stop playback." },
        { "!  (Panic)",  "Sends All Notes Off on every active channel. Use if notes get stuck." },
        { "Target",      "CC / Channel Pressure / Pitch Bend / Note — set per lane in the routing matrix below the canvas." },
        { "Teach",       "Tap Teach on a lane to solo its output. Other lanes mute so a synth can MIDI-Learn. On CC lanes, the next incoming CC message sets that lane's CC number." },
        { "Mute",        "Silence one lane without erasing its curve." },
        { "Scale",       "In Note mode: choose a scale preset and root note. Use the 12 circles (C to B, left to right) to build a custom scale. Only active pitch classes are played." },
        { "FREE / SYNC", "Toggle host-tempo sync. FREE = manual speed; SYNC = follows host BPM and transport; speed becomes loop length in Beats." },
        { "Smooth",      "Output smoothing (0 = instant). Applied per focused lane. Affects CC and Pitch Bend; bypassed for note-change detection in Note mode." },
        { "Range",       "Output range min/max per lane. In Note mode, shows the note name boundaries." },
        { "Y- / Y+",     "Decrease or increase horizontal grid lines." },
        { "X- / X+",     "Decrease or increase vertical grid lines." },
    };

    const float lineH  = 14.0f;
    const float labelW = 112.0f;
    const float gap    = 6.0f;
    float y = bounds.getY() + 28.0f;

    for (const auto& e : kEntries)
    {
        g.setFont (juce::Font (juce::FontOptions{}.withHeight (11.5f).withStyle ("Bold")));
        g.setColour (juce::Colour (0xff80d8ff));
        g.drawText (e.label,
                    juce::roundToInt (bounds.getX()), juce::roundToInt (y),
                    juce::roundToInt (labelW), juce::roundToInt (lineH * 2),
                    juce::Justification::topRight, false);

        g.setFont (juce::Font (juce::FontOptions{}.withHeight (11.5f)));
        g.setColour (juce::Colours::white);
        g.drawMultiLineText (e.desc,
                             juce::roundToInt (bounds.getX() + labelW + gap),
                             juce::roundToInt (y + 11.5f),
                             juce::roundToInt (bounds.getWidth() - labelW - gap));
        y += lineH * 2 + 2.0f;
        if (y + lineH * 2 > bounds.getBottom() - 18.0f) break;
    }

    g.setFont (juce::Font (juce::FontOptions{}.withHeight (11.0f).withStyle ("Italic")));
    g.setColour (juce::Colours::white.withAlpha (0.6f));
    g.drawText ("Tap anywhere to close", getLocalBounds().withTop (getHeight() - 22),
                juce::Justification::centred, false);
}

void HelpOverlay::mouseDown (const juce::MouseEvent&) { setVisible (false); }

//==============================================================================
// CurveDisplay
//==============================================================================

static constexpr float kAxisMarginL = 36.0f;
static constexpr float kAxisMarginB = 16.0f;

CurveDisplay::CurveDisplay (DrawnCurveProcessor& p) : proc (p) { startTimerHz (30); }
CurveDisplay::~CurveDisplay() { stopTimer(); }
void CurveDisplay::resized() {}
void CurveDisplay::setLightMode (bool light) { _lightMode = light; repaint(); }

void CurveDisplay::paint (juce::Graphics& g)
{
    const Theme& T = _lightMode ? kLight : kDark;

    const float w = static_cast<float> (getWidth());
    const float h = static_cast<float> (getHeight());
    const float plotX = kAxisMarginL, plotY = 0.0f;
    const float plotW = w - kAxisMarginL;
    const float plotH = h - kAxisMarginB;
    const auto  plot  = juce::Rectangle<float> (plotX, plotY, plotW, plotH);

    g.fillAll (T.background);

    // ── Grid ─────────────────────────────────────────────────────────────────
    g.setColour (T.gridLine);
    for (int i = 1; i < _xDivisions; ++i)
        g.drawVerticalLine (juce::roundToInt (plotX + plotW * (float)i / (float)_xDivisions),
                            plotY, plotY + plotH);
    for (int i = 1; i < _yDivisions; ++i)
        g.drawHorizontalLine (juce::roundToInt (plotY + plotH * (float)i / (float)_yDivisions),
                              plotX, plotX + plotW);

    // ── Lane curves ──────────────────────────────────────────────────────────
    // Stroke types per lane: solid / dashed / dot-dash.
    // Draw unfocused lanes first (at 40 % opacity), focused lane on top.
    static const float kDashLen[kMaxLanes][4] = {
        { 0, 0, 0, 0 },          // lane 0: solid (ignored)
        { 10.0f, 5.0f, 0, 0 },   // lane 1: dashed
        { 2.0f, 4.0f, 10.0f, 4.0f }, // lane 2: dot-dash
    };
    static const int kDashCount[kMaxLanes] = { 0, 2, 4 };

    for (int pass = 0; pass < 2; ++pass)
    {
        // pass 0 = unfocused, pass 1 = focused
        for (int lane = 0; lane < kMaxLanes; ++lane)
        {
            const bool isFocused = (lane == _focusedLane);
            if ((pass == 0) == isFocused) continue;  // skip wrong pass

            if (! proc.hasCurve (lane)) continue;

            const auto col = (_lightMode ? kLaneColourLight : kLaneColourDark)[lane];
            const auto drawCol = isFocused ? col : col.withAlpha (0.40f);
            const float strokeW = isFocused ? 2.5f : 1.8f;

            const auto table = proc.getCurveTable (lane);
            juce::Path curvePath;
            for (int i = 0; i < 256; ++i)
            {
                const float cx = plotX + static_cast<float> (i) / 255.0f * plotW;
                const float cy = plotY + (1.0f - table[static_cast<size_t> (i)]) * plotH;
                if (i == 0) curvePath.startNewSubPath (cx, cy);
                else        curvePath.lineTo (cx, cy);
            }

            g.setColour (drawCol);
            if (lane == 0 || kDashCount[lane] == 0)
            {
                g.strokePath (curvePath, juce::PathStrokeType (strokeW,
                    juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
            }
            else
            {
                juce::Path dashed;
                juce::PathStrokeType stroke (strokeW, juce::PathStrokeType::curved,
                                              juce::PathStrokeType::butt);
                stroke.createDashedStroke (dashed, curvePath,
                                            kDashLen[lane], kDashCount[lane]);
                g.fillPath (dashed);
            }
        }
    }

    // ── Live capture trail ────────────────────────────────────────────────────
    if (isCapturing && ! capturePath.isEmpty())
    {
        g.saveState();
        g.reduceClipRegion (plot.toNearestInt());
        g.setColour (T.capture);
        g.strokePath (capturePath, juce::PathStrokeType (2.0f,
            juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        g.restoreState();
    }

    // ── Playheads — one per lane that has a curve and is enabled ─────────────
    // Each lane draws its own coloured dot on its curve.  The focused lane
    // also draws a thin vertical line so the time position is clear.
    // All lanes share the same speed ratio / direction, so their playheads
    // may be at different X positions if their curves have different durations.
    if (proc.isPlaying() && proc.anyLaneHasCurve())
    {
        const auto* colPalette = _lightMode ? kLaneColourLight : kLaneColourDark;

        for (int L = 0; L < kMaxLanes; ++L)
        {
            if (! proc.hasCurve (L)) continue;

            const float phase = proc.currentPhaseForLane (L);
            const float headX = plotX + phase * plotW;
            const auto  col   = colPalette[L];
            const float alpha = (L == _focusedLane) ? 1.0f : 0.55f;

            // Vertical line: only for the focused lane (cleaner when multiple lanes play)
            if (L == _focusedLane)
            {
                g.setColour (T.playhead.withAlpha (0.65f));
                g.drawVerticalLine (juce::roundToInt (headX), plotY, plotY + plotH);
            }

            // Dot at the curve's current value
            const auto table = proc.getCurveTable (L);
            const int  idx   = juce::jlimit (0, 255, static_cast<int> (phase * 255.0f));
            const float headY = plotY + (1.0f - table[static_cast<size_t> (idx)]) * plotH;
            const float r = (L == _focusedLane) ? 5.0f : 3.5f;
            g.setColour (col.withAlpha (alpha));
            g.fillEllipse (headX - r, headY - r, r * 2.0f, r * 2.0f);

            // Small lane-coloured tick on the left Y-axis so it's clear which
            // lane is at which Y value even when curves overlap.
            g.setColour (col.withAlpha (alpha * 0.8f));
            g.fillRect (plotX - 5.0f, headY - 2.0f, 5.0f, 4.0f);
        }
    }

    // ── "Draw a curve" hint ───────────────────────────────────────────────────
    if (! proc.hasCurve (_focusedLane) && ! isCapturing)
    {
        const auto col = (_lightMode ? kLaneColourLight : kLaneColourDark)[_focusedLane];
        g.setColour (col.withAlpha (0.40f));
        g.setFont (juce::Font (juce::FontOptions{}.withHeight (14.0f)));
        const juce::String hint = "Draw Lane " + juce::String (_focusedLane + 1) + " here";
        g.drawText (hint, plot, juce::Justification::centred, false);
    }

    // ── Axis labels ───────────────────────────────────────────────────────────
    {
        const auto msgParamID = laneParam (_focusedLane, "msgType");
        const auto msgType = static_cast<MessageType> (
            static_cast<int> (proc.apvts.getRawParameterValue (msgParamID)->load()));
        const float minOut = proc.apvts.getRawParameterValue (laneParam (_focusedLane, "minOutput"))->load();
        const float maxOut = proc.apvts.getRawParameterValue (laneParam (_focusedLane, "maxOutput"))->load();

        const float recDur = proc.curveDuration (_focusedLane);
        const float speed  = proc.getEffectiveSpeedRatio();
        const float dur    = (recDur > 0.0f) ? recDur / std::max (speed, 0.001f) : 0.0f;

        static const char* kNoteNamesSharp[] = { "C","C\u266f","D","D\u266f","E","F","F\u266f","G","G\u266f","A","A\u266f","B" };
        static const char* kNoteNamesFlat [] = { "C","D\u266d","D","E\u266d","E","F","G\u266d","G","A\u266d","A","B\u266d","B" };
        auto midiNoteName = [&] (int note) -> juce::String {
            const auto* names = _useFlats ? kNoteNamesFlat : kNoteNamesSharp;
            return juce::String::fromUTF8 (names[note % 12]) + juce::String (note / 12 - 1);
        };

        const bool isNote = (msgType == MessageType::Note);
        const ScaleConfig sc = isNote ? proc.getScaleConfig (_focusedLane) : ScaleConfig{};
        const bool hasScale  = isNote && (sc.mask != 0xFFF);

        auto normToY    = [&] (float norm) { return plotY + (1.0f - norm) * plotH; };
        auto noteToNorm = [&] (int n) {
            return (static_cast<float> (n) / 127.0f - minOut)
                   / std::max (maxOut - minOut, 0.001f);
        };

        if (hasScale)
        {
            const int loNote = std::max (0,   juce::roundToInt (minOut * 127.0f) - 1);
            const int hiNote = std::min (127, juce::roundToInt (maxOut * 127.0f) + 1);
            struct BandNote { int note; float y; };
            std::vector<BandNote> visible;
            visible.reserve (24);
            for (int n = hiNote; n >= loNote; --n)
            {
                const int interval = ((n % 12) - (int)sc.root + 12) % 12;
                if ((sc.mask >> (11 - interval)) & 1)
                {
                    const float norm = noteToNorm (n);
                    if (norm >= -0.05f && norm <= 1.05f)
                        visible.push_back ({ n, normToY (norm) });
                }
            }
            if (visible.size() >= 2)
            {
                for (size_t i = 0; i < visible.size(); ++i)
                {
                    const float noteY  = visible[i].y;
                    const float halfUp = (i == 0) ? (noteY - plotY) * 0.5f
                                                  : (visible[i-1].y - noteY) * 0.5f;
                    const float halfDn = (i+1 < visible.size()) ? (noteY - visible[i+1].y) * 0.5f
                                                                 : (plotY + plotH - noteY) * 0.5f;
                    g.setColour ((i & 1) ? T.gridLine.withAlpha (0.08f)
                                         : T.gridLine.withAlpha (0.18f));
                    g.fillRect (plotX, noteY - halfUp, plotW, halfUp + halfDn);
                }
            }
            g.setFont (juce::Font (juce::FontOptions{}.withHeight (9.5f)));
            g.setColour (T.hint);
            const int lblW = juce::roundToInt (kAxisMarginL) - 2, lblH = 11;
            int lastLabelY = -100;   // tracks the bottom edge of the last drawn label
            for (const auto& bn : visible)
            {
                const int labelY = juce::jlimit (1, juce::roundToInt (plotH) - lblH - 1,
                                                 juce::roundToInt (bn.y) - lblH / 2);
                if (labelY < lastLabelY + lblH + 1)
                    continue;   // would overlap with the label above — skip
                g.drawText (midiNoteName (bn.note), 0, labelY, lblW, lblH,
                            juce::Justification::centredRight, false);
                lastLabelY = labelY;
            }
        }
        else
        {
            auto yLabel = [&] (float norm) -> juce::String {
                const float ranged = minOut + norm * (maxOut - minOut);
                switch (msgType) {
                    case MessageType::CC:
                    case MessageType::ChannelPressure:
                        return juce::String (juce::roundToInt (ranged * 127.0f));
                    case MessageType::PitchBend: {
                        const int pb = juce::roundToInt (ranged * 16383.0f) - 8192;
                        return (pb >= 0 ? "+" : "") + juce::String (pb);
                    }
                    case MessageType::Note:
                        return midiNoteName (juce::roundToInt (ranged * 127.0f));
                }
                return {};
            };
            g.setFont (juce::Font (juce::FontOptions{}.withHeight (10.0f)));
            g.setColour (T.hint);
            const int lblW = juce::roundToInt (kAxisMarginL) - 2, lblH = 12;
            int lastGridLabelY = -100;
            for (int i = 0; i <= _yDivisions; ++i)
            {
                const float norm  = (float)i / (float)_yDivisions;
                const int   yPx   = juce::roundToInt ((1.0f - norm) * plotH);
                const int labelY  = juce::jlimit (1, juce::roundToInt (plotH) - lblH - 1, yPx - lblH/2);
                if (labelY < lastGridLabelY + lblH + 1)
                    continue;   // skip overlapping label
                g.drawText (yLabel (norm), 0, labelY, lblW, lblH,
                            juce::Justification::centredRight, false);
                lastGridLabelY = labelY;
            }
        }

        // ── X axis ────────────────────────────────────────────────────────────
        g.setFont (juce::Font (juce::FontOptions{}.withHeight (10.0f)));
        g.setColour (T.hint);
        const int xLblY = juce::roundToInt (h - kAxisMarginB + 2);
        const int xLblH = juce::roundToInt (kAxisMarginB - 3);
        for (int i = 0; i <= _xDivisions; ++i)
        {
            const float frac = (float)i / (float)_xDivisions;
            const float xPx  = plotX + frac * plotW;
            g.drawText (juce::String (juce::roundToInt (frac * 100.0f)) + "%",
                        juce::roundToInt (xPx - 18), xLblY, 36, xLblH,
                        juce::Justification::centred, false);
        }

        // ── Duration overlay ──────────────────────────────────────────────────
        if (dur > 0.0f)
        {
            g.setFont (juce::Font (juce::FontOptions{}.withHeight (10.0f)));
            g.setColour (T.hint);
            g.drawText (juce::String (dur, 2) + "s",
                        juce::roundToInt (plotX + plotW - 46), 2, 46, 12,
                        juce::Justification::centredRight, false);
        }
    }

    // ── Lane legend (bottom-left of plot) ────────────────────────────────────
    {
        const int dotSz = 8, legH = 14, legW = 60;
        int lx = juce::roundToInt (plotX) + 4;
        const int ly = juce::roundToInt (plotY + plotH) - legH - 2;
        for (int lane = 0; lane < kMaxLanes; ++lane)
        {
            if (! proc.hasCurve (lane)) continue;
            const auto col = (_lightMode ? kLaneColourLight : kLaneColourDark)[lane];
            g.setColour (lane == _focusedLane ? col : col.withAlpha (0.50f));
            g.fillEllipse (static_cast<float> (lx), static_cast<float> (ly + (legH - dotSz) / 2),
                           static_cast<float> (dotSz), static_cast<float> (dotSz));
            g.setFont (juce::Font (juce::FontOptions{}.withHeight (9.5f)));
            g.drawText ("L" + juce::String (lane + 1),
                        lx + dotSz + 2, ly, legW, legH,
                        juce::Justification::centredLeft, false);
            lx += dotSz + 20;
        }
    }

    // ── Pause overlay ─────────────────────────────────────────────────────────
    // Shown when a curve exists but playback is stopped.
    // Draws two ▐▌ pause bars that blink at ~1.5 Hz (timer fires at 30 Hz;
    // _blinkOn toggles each tick, so one on/off cycle = 2 ticks ≈ 60 ms; we slow
    // it with a counter-free approach by only showing at even repaint ticks when
    // _blinkOn = true, giving a ~15 Hz visual rate which reads as a clear blink).
    if (proc.anyLaneHasCurve() && ! proc.isPlaying())
    {
        const auto laneCol = (_lightMode ? kLaneColourLight : kLaneColourDark)[_focusedLane];

        // Faint tint to darken the plot while paused
        g.setColour (laneCol.withAlpha (0.08f));
        g.fillRect (plot);

        // Blinking pause bars drawn as two filled rounded rectangles
        if (_blinkOn)
        {
            const float cx   = plot.getCentreX();
            const float cy   = plot.getCentreY();
            const float barH = 22.0f;
            const float barW =  7.0f;
            const float gap  =  5.0f;   // gap between the two bars

            g.setColour (laneCol.withAlpha (0.55f));
            g.fillRoundedRectangle (cx - gap * 0.5f - barW, cy - barH * 0.5f, barW, barH, 2.5f);
            g.fillRoundedRectangle (cx + gap * 0.5f,        cy - barH * 0.5f, barW, barH, 2.5f);
        }
    }

    // ── Border ────────────────────────────────────────────────────────────────
    g.setColour (T.border);
    g.drawRect (getLocalBounds().toFloat(), 1.0f);
}

// ── Touch / mouse ─────────────────────────────────────────────────────────────

static float normX (float rawX, float w) noexcept
{
    return juce::jlimit (0.0f, 1.0f, (rawX - kAxisMarginL) / (w - kAxisMarginL));
}
static float normY (float rawY, float h) noexcept
{
    return juce::jlimit (0.0f, 1.0f, rawY / (h - kAxisMarginB));
}

void CurveDisplay::mouseDown (const juce::MouseEvent& e)
{
    captureStartTime = juce::Time::getMillisecondCounterHiRes();
    isCapturing = true;
    capturePath.clear();
    capturePath.startNewSubPath (static_cast<float> (e.x), static_cast<float> (e.y));
    proc.beginCapture (_focusedLane);
    proc.addCapturePoint (0.0,
        normX (static_cast<float> (e.x), static_cast<float> (getWidth())),
        normY (static_cast<float> (e.y), static_cast<float> (getHeight())));
    repaint();
}

void CurveDisplay::mouseDrag (const juce::MouseEvent& e)
{
    if (! isCapturing) return;
    capturePath.lineTo (static_cast<float> (e.x), static_cast<float> (e.y));
    const double t = (juce::Time::getMillisecondCounterHiRes() - captureStartTime) / 1000.0;
    proc.addCapturePoint (t,
        normX (static_cast<float> (e.x), static_cast<float> (getWidth())),
        normY (static_cast<float> (e.y), static_cast<float> (getHeight())));
    repaint();
}

void CurveDisplay::mouseUp (const juce::MouseEvent& e)
{
    if (! isCapturing) return;
    const double t = (juce::Time::getMillisecondCounterHiRes() - captureStartTime) / 1000.0;
    proc.addCapturePoint (t,
        normX (static_cast<float> (e.x), static_cast<float> (getWidth())),
        normY (static_cast<float> (e.y), static_cast<float> (getHeight())));
    proc.finalizeCapture (_focusedLane);
    isCapturing = false;
    capturePath.clear();
    repaint();
}

void CurveDisplay::timerCallback()
{
    if (++_blinkCounter >= kBlinkPeriod)
    {
        _blinkCounter = 0;
        _blinkOn = ! _blinkOn;
    }
    repaint();
}

//==============================================================================
// DrawnCurveEditor — constructor
//==============================================================================

DrawnCurveEditor::DrawnCurveEditor (DrawnCurveProcessor& p)
    : AudioProcessorEditor (&p),
      proc (p),
      curveDisplay (p)
{
    // Set _appLF as BOTH the component LookAndFeel and the global default.
    //
    // Why both?
    //   • setLookAndFeel(&_appLF)  → widgets that call LookAndFeel virtual methods
    //     (drawButtonText, getLabelFont, …) use _appLF.
    //   • setDefaultLookAndFeel(&_appLF) → direct g.setFont() calls inside custom
    //     paint/drawButtonText overrides resolve the typeface through
    //     juce_getTypefaceForFont, which is wired to
    //     LookAndFeel::getDefaultLookAndFeel().getTypefaceForFont().  Without this
    //     second line, those calls go through JUCE's stock LookAndFeel_V4 which maps
    //     the default sans-serif to "Helvetica" on iOS — a font that lacks ♭ ♯ ♮.
    juce::LookAndFeel::setDefaultLookAndFeel (&_appLF);
    setLookAndFeel (&_appLF);

    setSize (Layout::editorW, Layout::editorH);
    setWantsKeyboardFocus (true);

    // ── Play (hidden) / Clear ─────────────────────────────────────────────────
    addChildComponent (playButton);
    playButton.onClick = [this]
    {
        const bool nowPlaying = ! proc.isPlaying();
        proc.setPlaying (nowPlaying);
        playButton.setButtonText (nowPlaying ? "Pause" : "Play");
        dirControl.repaint();
        curveDisplay.repaint();
    };

    addAndMakeVisible (clearButton);
    clearButton.onClick = [this]
    {
        proc.setPlaying (false);
        proc.clearAllSnapshots();
        playButton.setButtonText ("Play");
        dirControl.repaint();
        curveDisplay.repaint();
    };

    addAndMakeVisible (panicButton);
    panicButton.onClick = [this] { proc.sendPanic(); };

    addAndMakeVisible (themeButton);
    // ☾ = go to dark mode  ☀ = go to light mode (symbol shows destination)
    //
    // SF Pro (installed as primary typeface via DrawnCurveLookAndFeel) carries
    // text-form glyphs for both U+263E ☾ and U+2600 ☀ in its Miscellaneous
    // Symbols block coverage.  With SF Pro as the primary typeface, CoreText
    // uses SF Pro's glyph directly without falling back to Apple Color Emoji.
    // U+FE0E (VARIATION SELECTOR-15) is NOT appended here: JUCE renders it as
    // a visible [?] box rather than skipping it as a zero-width modifier.
    const juce::String kMoon = juce::String::charToString (0x263E);   // ☾
    const juce::String kSun  = juce::String::charToString (0x263C);   // ☼ (WHITE SUN WITH RAYS — text glyph in SF Pro, unlike U+2600 which routes to emoji)
    themeButton.setButtonText (kMoon);   // start in light mode → offer dark
    themeButton.onClick = [this, kMoon, kSun]
    {
        _lightMode = ! _lightMode;
        themeButton.setButtonText (_lightMode ? kMoon : kSun);
        curveDisplay.setLightMode (_lightMode);
        helpOverlay.setLightMode (_lightMode);
        applyTheme();
    };

    addAndMakeVisible (syncButton);
    syncButton.setClickingTogglesState (true);
    {
        const bool isSyncing = proc.apvts.getRawParameterValue (ParamID::syncEnabled)->load() > 0.5f;
        syncButton.setToggleState (isSyncing, juce::dontSendNotification);
    }
    syncButton.onClick = [this]
    {
        const bool nowSyncing = syncButton.getToggleState();  // already toggled
        if (auto* pSync = dynamic_cast<juce::AudioParameterBool*> (
                              proc.apvts.getParameter (ParamID::syncEnabled)))
            *pSync = nowSyncing;
        onSyncToggled (nowSyncing);
    };

    addAndMakeVisible (helpButton);
    helpButton.onClick = [this]
    {
        helpOverlay.setLightMode (_lightMode);
        helpOverlay.setVisible (! helpOverlay.isVisible());
        if (helpOverlay.isVisible()) helpOverlay.toFront (false);
    };

    // ── Speed slider (shared, transport section) ──────────────────────────────
    setupSlider (speedSlider, speedLabel, "Speed");
    speedSlider.setTextValueSuffix ("x");
    speedSlider.setNumDecimalPlacesToDisplay (2);
    speedAttach = std::make_unique<Attach> (proc.apvts, ParamID::playbackSpeed, speedSlider);

    // ── Direction control ─────────────────────────────────────────────────────
    dirControl.setSegments ({
        { "rev", "", "Reverse" },
        { "pp",  "", "Ping-Pong" },
        { "fwd", "", "Forward" }
    });
    dirControl.setSelectedIndex (
        kDirParamToVis[static_cast<int> (
            proc.apvts.getRawParameterValue (ParamID::playbackDirection)->load())],
        juce::dontSendNotification);
    dirControl.onChange = [this] (int vis)
    {
        // Direction (Forward / PingPong / Reverse) is always user-controlled.
        // Sync mode only affects speed/timing from the host BPM; it does not
        // lock the looping direction.
        if (auto* pDir = dynamic_cast<juce::AudioParameterChoice*> (
                          proc.apvts.getParameter (ParamID::playbackDirection)))
            *pDir = kDirVisToParam[vis];
    };
    dirControl.onTap = [this] (int, bool wasAlready)
    {
        if (wasAlready)
        {
            const bool nowPlaying = ! proc.isPlaying();
            proc.setPlaying (nowPlaying);
            playButton.setButtonText (nowPlaying ? "Pause" : "Play");
        }
        else
        {
            proc.setPlaying (true);
            playButton.setButtonText ("Pause");
        }
        dirControl.repaint();
        curveDisplay.repaint();
    };
    dirControl.setSegmentPainter ([this] (juce::Graphics& g,
                                          juce::Rectangle<float> bounds,
                                          int index, bool active)
    {
        const float cx = bounds.getCentreX(), cy = bounds.getCentreY();
        const float aw = bounds.getHeight() * 0.35f;
        const float tw = aw * 0.82f;

        // Semantic states
        const bool enginePlaying = proc.isPlaying();
        const bool hasCurve      = proc.anyLaneHasCurve();
        // "paused" = this direction is selected, a curve exists, but we're not playing
        const bool paused        = active && hasCurve && ! enginePlaying;
        // "live"   = this direction is selected and actively playing
        const bool live          = active && enginePlaying;

        // Direction arrow opacity:
        //   live  → full (shows which direction is running)
        //   paused→ 30% (ghost; pause bars overlay it)
        //   other  → normal active/inactive colour
        const juce::Colour baseCol = active ? dirControl.activeLabel : dirControl.labelColour;
        const float arrowAlpha = live ? 1.0f : (paused ? 0.28f : 1.0f);
        g.setColour (baseCol.withAlpha (arrowAlpha));

        auto fillTri = [&] (bool pointRight) {
            juce::Path triPath;
            if (pointRight) triPath.addTriangle (cx+tw, cy, cx-tw, cy-aw, cx-tw, cy+aw);
            else            triPath.addTriangle (cx-tw, cy, cx+tw, cy-aw, cx+tw, cy+aw);
            g.fillPath (triPath);
        };

        if (index == 0)      fillTri (false);
        else if (index == 2) fillTri (true);
        else { fillTri (false); fillTri (true); }

        // Pause bars: shown when paused (not when playing).
        // This lets the user know playback is suspended; tap to resume.
        if (paused)
        {
            const float ps = bounds.getHeight() * 0.52f;
            const float px = cx - ps * 0.5f, py = cy - ps * 0.5f;
            const float bw = ps * 0.24f, gap = ps * 0.20f;
            g.setColour (dirControl.activeLabel.withAlpha (0.80f));
            g.fillRoundedRectangle (px,        py, bw, ps, 2.0f);
            g.fillRoundedRectangle (px+bw+gap, py, bw, ps, 2.0f);
        }
    });
    _muteDrawLF.iconType  = dcui::IconType::mute;
    _teachDrawLF.iconType = dcui::IconType::teach;
    addAndMakeVisible (dirControl);

    // ── Grid density buttons ──────────────────────────────────────────────────
    for (auto* b : { &tickYMinusBtn, &tickYPlusBtn, &tickXMinusBtn, &tickXPlusBtn })
        b->setLookAndFeel (&_densityLF);
    addAndMakeVisible (tickYMinusBtn);
    addAndMakeVisible (tickYPlusBtn);
    addAndMakeVisible (tickXMinusBtn);
    addAndMakeVisible (tickXPlusBtn);
    tickYMinusBtn.onClick = [this] { curveDisplay.setYDivisions (curveDisplay.getYDivisions() - 1); };
    tickYPlusBtn .onClick = [this] { curveDisplay.setYDivisions (curveDisplay.getYDivisions() + 1); };
    tickXMinusBtn.onClick = [this] { curveDisplay.setXDivisions (curveDisplay.getXDivisions() - 1); };
    tickXPlusBtn .onClick = [this] { curveDisplay.setXDivisions (curveDisplay.getXDivisions() + 1); };

    // ── Lane focus selector ───────────────────────────────────────────────────
    laneFocusCtrl.setSegments ({
        { "l1", "1", "Lane 1" },
        { "l2", "2", "Lane 2" },
        { "l3", "3", "Lane 3" }
    });
    laneFocusCtrl.setSelectedIndex (0, juce::dontSendNotification);
    laneFocusCtrl.onChange = [this] (int idx) { setFocusedLane (idx); };
    addAndMakeVisible (laneFocusCtrl);

    // ── Shaping sliders ───────────────────────────────────────────────────────
    setupSlider (smoothingSlider, smoothingLabel, "Smooth");
    rangeSlider.setSliderStyle (juce::Slider::TwoValueHorizontal);
    rangeSlider.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    rangeSlider.setRange (0.0, 1.0, 0.001);
    addAndMakeVisible (rangeSlider);
    rangeLabel.setFont (juce::Font (juce::FontOptions{}.withHeight (11.0f)));
    addAndMakeVisible (rangeLabel);

    rangeSlider.onValueChange = [this]
    {
        const int L = _focusedLane;
        if (auto* pMin = dynamic_cast<juce::AudioParameterFloat*> (
                             proc.apvts.getParameter (laneParam (L, "minOutput"))))
            *pMin = static_cast<float> (rangeSlider.getMinValue());
        if (auto* pMax = dynamic_cast<juce::AudioParameterFloat*> (
                             proc.apvts.getParameter (laneParam (L, "maxOutput"))))
            *pMax = static_cast<float> (rangeSlider.getMaxValue());
        updateRangeLabel();
    };

    // Phase offset slider (per focused lane, like smoothingSlider)
    setupSlider (phaseOffsetSlider, phaseOffsetLabel,
                 juce::String::charToString (juce::juce_wchar (0x03C6)) + " Phase");  // φ Phase
    phaseOffsetSlider.setTextValueSuffix ("%");
    phaseOffsetSlider.setNumDecimalPlacesToDisplay (0);

    // One-shot toggle (inline with lane focus selector in shaping panel)
    addAndMakeVisible (oneShotBtn);
    oneShotBtn.setClickingTogglesState (false);   // we manage state manually via bindShapingToLane
    // Use charToString to build the infinity glyph from its codepoint — avoids
    // any source-file encoding ambiguity with u8 string literals.
    oneShotBtn.setButtonText (juce::String::charToString (juce::juce_wchar (0x221E)));  // ∞ = loop

    // Bind shaping to lane 0 at startup.
    bindShapingToLane (0);

    // ── Routing matrix rows ───────────────────────────────────────────────────
    // Message-type button symbols (param values: CC=0, ChannelPressure=1, PitchBend=2, Note=3)

    for (int L = 0; L < kMaxLanes; ++L)
    {
        // Message-type button — shows current mode as a symbol
        const int curType = static_cast<int> (
            proc.apvts.getRawParameterValue (laneParam (L, "msgType"))->load());
        // initial text set via updateLaneRow below; just pre-populate here
        { const juce::String kNote = juce::String::charToString (juce::juce_wchar (0x2669));  // ♩
          auto s = [&kNote] (int t) -> juce::String { switch(t){case 0:return "CC";case 1:return "AT";case 2:return "PB";case 3:return kNote;}return "?"; };
          laneTypeBtn[static_cast<size_t>(L)].setButtonText (s (curType)); }
        laneTypeBtn[static_cast<size_t>(L)].setLookAndFeel (&_symbolLF);
        laneTypeBtn[static_cast<size_t>(L)].onClick = [this, L]
        {
            static const int kCycleNext[4] = { 2, 0, 3, 1 };
            const int cur = static_cast<int> (
                proc.apvts.getRawParameterValue (laneParam (L, "msgType"))->load());
            const int next = kCycleNext[std::clamp (cur, 0, 3)];
            if (auto* pType = dynamic_cast<juce::AudioParameterChoice*> (
                              proc.apvts.getParameter (laneParam (L, "msgType"))))
                *pType = next;
            updateLaneRow (L);
            if (L == _focusedLane)
                updateScaleVisibility();
        };
        laneTypeBtn[static_cast<size_t>(L)].onStateChange = [this, L] {
            // Right-click → popup menu
            if (laneTypeBtn[static_cast<size_t>(L)].getState() == juce::Button::ButtonState::buttonDown
                && juce::ModifierKeys::currentModifiers.isRightButtonDown())
            {
                const int cur = static_cast<int> (
                    proc.apvts.getRawParameterValue (laneParam (L, "msgType"))->load());
                juce::PopupMenu m;
                m.addItem (1, "CC  (Control Change)",    true, cur == 0);
                m.addItem (2, "PB  (Pitch Bend)",        true, cur == 2);
                m.addItem (3, "N   (Note)",               true, cur == 3);
                m.addItem (4, "At  (Channel Pressure)",   true, cur == 1);
                m.addSeparator();
                m.addItem (10, "Copy type to all lanes");
                m.addItem (11, "Copy channel to all lanes");
                m.addItem (12, "Copy all settings to all lanes");
                m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&laneTypeBtn[static_cast<size_t>(L)]),
                    [this, L] (int result) {
                        if (result == 0) return;
                        if (result <= 4)
                        {
                            static const int kMenuToParam[5] = { 0, 0, 2, 3, 1 };
                            const int newType = kMenuToParam[result];
                            if (auto* pNewType = dynamic_cast<juce::AudioParameterChoice*> (
                                              proc.apvts.getParameter (laneParam (L, "msgType"))))
                                *pNewType = newType;
                            updateLaneRow (L);
                            if (L == _focusedLane) updateScaleVisibility();
                            return;
                        }
                        // Copy-to-all operations
                        for (int T = 0; T < kMaxLanes; ++T)
                        {
                            if (T == L) continue;
                            if (result == 10 || result == 12)   // type
                            {
                                const int srcType = static_cast<int> (
                                    proc.apvts.getRawParameterValue (laneParam (L, "msgType"))->load());
                                if (auto* pType = dynamic_cast<juce::AudioParameterChoice*> (
                                                  proc.apvts.getParameter (laneParam (T, "msgType"))))
                                    *pType = srcType;
                            }
                            if (result == 11 || result == 12)   // channel
                            {
                                const int srcCh = static_cast<int> (
                                    proc.apvts.getRawParameterValue (laneParam (L, "midiChannel"))->load());
                                if (auto* pCh = dynamic_cast<juce::AudioParameterInt*> (
                                                  proc.apvts.getParameter (laneParam (T, "midiChannel"))))
                                    *pCh = srcCh;
                            }
                            if (result == 12)   // all settings: also CC# and velocity
                            {
                                const int srcCC = static_cast<int> (
                                    proc.apvts.getRawParameterValue (laneParam (L, "ccNumber"))->load());
                                const int srcVel = static_cast<int> (
                                    proc.apvts.getRawParameterValue (laneParam (L, "noteVelocity"))->load());
                                if (auto* pCC = dynamic_cast<juce::AudioParameterInt*> (
                                                  proc.apvts.getParameter (laneParam (T, "ccNumber"))))
                                    *pCC = srcCC;
                                if (auto* pVel = dynamic_cast<juce::AudioParameterInt*> (
                                                  proc.apvts.getParameter (laneParam (T, "noteVelocity"))))
                                    *pVel = srcVel;
                            }
                        }
                        updateAllLaneRows();
                        updateScaleVisibility();
                    });
            }
        };
        addAndMakeVisible (laneTypeBtn[static_cast<size_t>(L)]);

        // Detail label (CC# or velocity)
        laneDetailLabel[static_cast<size_t>(L)].setFont (juce::Font (juce::FontOptions{}.withHeight (10.0f)));
        laneDetailLabel[static_cast<size_t>(L)].setJustificationType (juce::Justification::centred);
        laneDetailLabel[static_cast<size_t>(L)].setEditable (false, true, false);
        laneDetailLabel[static_cast<size_t>(L)].onEditorHide = [this, L]
        {
            const int val = juce::jlimit (0, 127, laneDetailLabel[static_cast<size_t>(L)].getText().getIntValue());
            const int type = static_cast<int> (
                proc.apvts.getRawParameterValue (laneParam (L, "msgType"))->load());
            if (type == 3)   // Note — edit velocity
            {
                if (auto* pVel = dynamic_cast<juce::AudioParameterInt*> (
                                  proc.apvts.getParameter (laneParam (L, "noteVelocity"))))
                    *pVel = juce::jlimit (1, 127, val);
            }
            else             // CC — edit cc number
            {
                if (auto* pCC = dynamic_cast<juce::AudioParameterInt*> (
                                  proc.apvts.getParameter (laneParam (L, "ccNumber"))))
                    *pCC = val;
            }
            updateLaneRow (L);
        };
        addAndMakeVisible (laneDetailLabel[static_cast<size_t>(L)]);

        // Channel label
        laneChannelLabel[static_cast<size_t>(L)].setFont (juce::Font (juce::FontOptions{}.withHeight (10.0f)));
        laneChannelLabel[static_cast<size_t>(L)].setJustificationType (juce::Justification::centred);
        laneChannelLabel[static_cast<size_t>(L)].setEditable (false, true, false);
        laneChannelLabel[static_cast<size_t>(L)].onEditorHide = [this, L]
        {
            const int val = juce::jlimit (1, 16, laneChannelLabel[static_cast<size_t>(L)].getText().getIntValue());
            if (auto* pChan = dynamic_cast<juce::AudioParameterInt*> (
                              proc.apvts.getParameter (laneParam (L, "midiChannel"))))
                *pChan = val;
            updateLaneRow (L);
        };
        addAndMakeVisible (laneChannelLabel[static_cast<size_t>(L)]);

        // Teach button
        laneTeachBtn[static_cast<size_t>(L)].setLookAndFeel (&_teachDrawLF);
        addAndMakeVisible (laneTeachBtn[static_cast<size_t>(L)]);
        laneTeachBtn[static_cast<size_t>(L)].onClick = [this, L]
        {
            if (proc.isTeachPending (L))
            {
                proc.cancelTeach();
                applyTheme();   // recolour
            }
            else
            {
                proc.cancelTeach();   // cancel any previous lane
                proc.beginTeach (L);   // all message types: isolates lane output
                applyTheme();
            }
        };

        // Mute button
        laneMuteBtn[static_cast<size_t>(L)].setLookAndFeel (&_muteDrawLF);
        addAndMakeVisible (laneMuteBtn[static_cast<size_t>(L)]);
        laneMuteBtn[static_cast<size_t>(L)].onClick = [this, L]
        {
            if (auto* pEnabled = dynamic_cast<juce::AudioParameterBool*> (
                              proc.apvts.getParameter (laneParam (L, "enabled"))))
                *pEnabled = ! (pEnabled->get());
            applyTheme();
        };

        // Register listeners for per-lane params
        proc.apvts.addParameterListener (laneParam (L, "msgType"),      this);
        proc.apvts.addParameterListener (laneParam (L, "ccNumber"),     this);
        proc.apvts.addParameterListener (laneParam (L, "midiChannel"),  this);
        proc.apvts.addParameterListener (laneParam (L, "noteVelocity"), this);
        proc.apvts.addParameterListener (laneParam (L, "enabled"),      this);
        proc.apvts.addParameterListener (laneParam (L, "loopMode"),    this);
        proc.apvts.addParameterListener (laneParam (L, "phaseOffset"), this);
        proc.apvts.addParameterListener (laneParam (L, "minOutput"),    this);
        proc.apvts.addParameterListener (laneParam (L, "maxOutput"),    this);
        proc.apvts.addParameterListener (laneParam (L, "smoothing"),    this);
    }
    // Global scale params (outside per-lane loop — shared by all Note-mode lanes)
    proc.apvts.addParameterListener ("scaleMode", this);
    proc.apvts.addParameterListener ("scaleRoot", this);
    proc.apvts.addParameterListener ("scaleMask", this);

    // Mapping detail label
    mappingDetailLabel.setFont (juce::Font (juce::FontOptions{}.withHeight (10.0f)));
    mappingDetailLabel.setJustificationType (juce::Justification::centredLeft);
    addAndMakeVisible (mappingDetailLabel);

    updateAllLaneRows();

    // ── Scale quantization controls — family browser ──────────────────────────

    addAndMakeVisible (scaleLabel);
    scaleLabel.setFont (DrawnCurveLookAndFeel::makeFont (11.0f));
    scaleLabel.setJustificationType (juce::Justification::centred);

    // Family tab buttons
    for (int f = 0; f < dcScale::kNumFamilies; ++f)
    {
        auto& btn = familyBtns[static_cast<size_t>(f)];
        btn.setButtonText (juce::String::fromUTF8 (dcScale::kFamilies[f].name));
        btn.setLookAndFeel (&_symbolLF);
        addAndMakeVisible (btn);
        btn.onClick = [this, f]
        {
            setActiveFamily (f);

            // Auto-select: if the current scale does not already belong to this
            // family, apply the last mode the user picked in it (or mode 0 if
            // this family has never been visited).  This prevents two families
            // appearing simultaneously highlighted (active tab ≠ recognised family).
            if (_recognisedFamily != f)
            {
                const auto& fam = dcScale::kFamilies[f];
                const int modeIdx = juce::jlimit (0, fam.count - 1,
                                                  _lastModePerFamily[static_cast<size_t>(f)]);
                const uint16_t relMask = fam.modes[static_cast<size_t>(modeIdx)].mask;
                const int root = static_cast<int> (
                    proc.apvts.getRawParameterValue ("scaleRoot")->load());
                const uint16_t absMask = dcScale::pcsRotate (relMask, 12 - root);
                if (auto* pMask = dynamic_cast<juce::AudioParameterInt*> (
                        proc.apvts.getParameter ("scaleMask")))
                    *pMask = static_cast<int> (absMask);
                if (auto* pMode = dynamic_cast<juce::AudioParameterInt*> (
                        proc.apvts.getParameter ("scaleMode")))
                    *pMode = 7;
                proc.updateAllLaneScales();
                scaleLattice.setMask (absMask);
                addRecentMask (relMask);
                updateScaleStatus();
                curveDisplay.repaint();
            }

            updateScalePresetButtons();   // repaint chip/tab colours
        };
    }

    // Recent-history tab button
    recentFamilyBtn.setButtonText (juce::String::charToString (juce::juce_wchar (0x2605))
                                   + " Recent");   // ★ Recent
    recentFamilyBtn.setLookAndFeel (&_symbolLF);
    addChildComponent (recentFamilyBtn);   // hidden until Note mode (like family tabs)
    recentFamilyBtn.onClick = [this]
    {
        setActiveFamily (kRecentFamilyIdx);
        updateScalePresetButtons();
    };

    // Subfamily chip buttons — populated by setActiveFamily(); hidden until Note mode.
    for (int i = 0; i < kMaxModes; ++i)
    {
        auto& btn = subfamilyBtns[static_cast<size_t>(i)];
        btn.setLookAndFeel (&_subfamilyLF[static_cast<size_t>(i)]);
        addChildComponent (btn);   // invisible until setActiveFamily() shows them
        btn.onClick = [this, i]
        {
            // Determine the relative mask (root-relative interval set).
            uint16_t relMask;
            if (_activeFamilyIdx == kRecentFamilyIdx)
            {
                if (i >= static_cast<int> (_recentMasks.size())) return;
                relMask = _recentMasks[static_cast<size_t>(i)];
            }
            else
            {
                const auto& fam = dcScale::kFamilies[_activeFamilyIdx];
                if (i >= fam.count) return;
                relMask = fam.modes[static_cast<size_t>(i)].mask;
            }
            const int root = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());
            // Root-relative → absolute: rotate left by (12 - root).
            const uint16_t absMask = dcScale::pcsRotate (relMask, 12 - root);
            if (auto* pMask = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMask")))
                *pMask = static_cast<int> (absMask);
            if (auto* pMode = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMode")))
                *pMode = 7;
            proc.updateAllLaneScales();
            scaleLattice.setMask (absMask);
            addRecentMask (relMask);   // record in history (idempotent for Recent tab re-clicks)
            // Remember which mode was last used in this family so switching back restores it.
            if (_activeFamilyIdx != kRecentFamilyIdx)
                _lastModePerFamily[static_cast<size_t> (_activeFamilyIdx)] = i;
            updateScaleStatus();
            curveDisplay.repaint();
        };
    }

    addAndMakeVisible (scaleLattice);

    scaleLattice.onMaskChanged = [this] (uint16_t mask)
    {
        if (auto* pMask = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMask")))
            *pMask = static_cast<int> (mask);
        if (auto* pMode = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMode")))
            *pMode = 7;
        proc.updateAllLaneScales();
        // Convert abs mask → relative before storing in recent history.
        const int root = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());
        addRecentMask (dcScale::pcsRotate (mask, root));
        updateScaleStatus();
        curveDisplay.repaint();
    };

    scaleLattice.setMask (calcAbsLatticeMask (proc, 0));
    scaleLattice.setRoot (static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load()));

    // Scale action buttons
    auto applyMask = [this] (uint16_t mask)
    {
        if (auto* pMask = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMask")))
            *pMask = static_cast<int> (mask);
        if (auto* pMode = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMode")))
            *pMode = 7;
        proc.updateAllLaneScales();
        scaleLattice.setMask (mask);
        updateScaleStatus();
        curveDisplay.repaint();
    };

    // Scale action buttons — Unicode glyphs, no custom LF needed.
    // ● all  ○ none  ◑ invert  ◆ root
    scaleAllBtn .setButtonText (juce::String::charToString (juce::juce_wchar (0x25CF)));  // ●
    scaleNoneBtn.setButtonText (juce::String::charToString (juce::juce_wchar (0x25CB)));  // ○
    scaleInvBtn .setButtonText (juce::String::charToString (juce::juce_wchar (0x25D1)));  // ◑
    scaleRootBtn.setButtonText (juce::String::charToString (juce::juce_wchar (0x25C6)));  // ◆

    addAndMakeVisible (scaleAllBtn);
    scaleAllBtn.onClick = [applyMask] { applyMask (0x0FFF); };

    addAndMakeVisible (scaleNoneBtn);
    scaleNoneBtn.onClick = [this, applyMask]
    {
        const int root = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());
        // Lattice convention: bit (11 - pc) = pitch class pc active.
        applyMask (static_cast<uint16_t> (1u << (11 - root)));
    };

    addAndMakeVisible (scaleInvBtn);
    scaleInvBtn.onClick = [this, applyMask]
    {
        applyMask ((~calcAbsLatticeMask (proc, 0)) & 0x0FFF);
    };

    addAndMakeVisible (scaleRootBtn);

    const auto resetRootBtn = [this]
    {
        scaleLattice.setRootSelectMode (false);
        const auto btnBg   = _lightMode ? juce::Colour (0xffF0EFE7) : juce::Colour (0xff333355);
        const auto btnText = _lightMode ? juce::Colour (0xff28261F) : juce::Colours::white;
        scaleRootBtn.setColour (juce::TextButton::buttonColourId,  btnBg);
        scaleRootBtn.setColour (juce::TextButton::textColourOffId, btnText);
    };

    scaleRootBtn.onClick = [this]
    {
        const bool entering = ! scaleLattice.isRootSelectMode();
        scaleLattice.setRootSelectMode (entering);
        const auto accent  = _lightMode ? juce::Colour (0xffF59E0B) : juce::Colour (0xffFBBF24);
        const auto btnBg   = _lightMode ? juce::Colour (0xffF0EFE7) : juce::Colour (0xff333355);
        const auto btnText = _lightMode ? juce::Colour (0xff28261F) : juce::Colours::white;
        scaleRootBtn.setColour (juce::TextButton::buttonColourId,
                                entering ? accent : btnBg);
        scaleRootBtn.setColour (juce::TextButton::textColourOffId,
                                entering ? juce::Colours::white : btnText);
    };

    scaleLattice.onRootChanged = [this, resetRootBtn] (int newRoot)
    {
        // Semantic: changing root TRANSPOSES the scale to the new root —
        // the root-relative interval pattern stays the same.
        //
        // For presets (mode 0–6) the APVTS already models this: the processor
        // stores mode + root separately, so simply updating scaleRoot gives the
        // correct preset transposition automatically.
        //
        // For custom masks (mode = 7) the absolute pitch-class mask is stored
        // directly, so we must re-derive it from the current relative pattern.
        const int mode    = static_cast<int> (proc.apvts.getRawParameterValue ("scaleMode")->load());
        const int oldRoot = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());

        if (mode == 7 && newRoot != oldRoot)
        {
            const uint16_t absMask  = calcAbsLatticeMask (proc, 0);
            const uint16_t relMask  = dcScale::pcsRotate (absMask, oldRoot);
            const uint16_t newAbs   = dcScale::pcsRotate (relMask, (12 - newRoot) % 12);
            if (auto* pMask = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMask")))
                *pMask = static_cast<int> (newAbs);
            scaleLattice.setMask (newAbs);  // immediate visual update; async also fires
        }

        if (auto* pRoot = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleRoot")))
            *pRoot = newRoot;
        proc.updateAllLaneScales();
        scaleLattice.setRoot (newRoot);
        curveDisplay.repaint();
        resetRootBtn();
        updateScaleStatus();
    };

    // Notation toggle — switches chromatic labels between ♯ (sharps) and ♭ (flats).
    scaleNotationBtn.setButtonText (juce::String::charToString (juce::juce_wchar (0x266F)));  // ♯
    addAndMakeVisible (scaleNotationBtn);
    scaleNotationBtn.onClick = [this]
    {
        _useFlats = !_useFlats;
        scaleLattice.setUseFlats (_useFlats);
        curveDisplay.setUseFlats (_useFlats);
        scaleNotationBtn.setButtonText (
            juce::String::charToString (juce::juce_wchar (_useFlats ? 0x266D : 0x266F)));
        updateRangeLabel();   // refreshes note-name range text if in Note mode
    };

    // Rotate button — ↻ cycle to the next mode in the current family (same root).
    scaleRotateBtn.setButtonText (juce::String::charToString (juce::juce_wchar (0x21BB)));  // ↻
    addAndMakeVisible (scaleRotateBtn);
    scaleRotateBtn.onClick = [this]
    {
        // Require a recognised family; if none, do nothing (button becomes a no-op
        // for fully custom scales, which have no ordered mode sequence to cycle).
        if (_recognisedFamily < 0)
            return;

        const int root = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());
        const auto& fam     = dcScale::kFamilies[_recognisedFamily];
        const int   nextMode = (_recognisedMode + 1) % fam.count;
        const uint16_t relMask  = fam.modes[nextMode].mask;

        // Keep root fixed; only the interval pattern (mode) changes.
        const uint16_t absMask = dcScale::pcsRotate (relMask, (12 - root) % 12);

        if (auto* pM = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMask")))
            *pM = static_cast<int> (absMask);
        if (auto* pMo = dynamic_cast<juce::AudioParameterInt*> (proc.apvts.getParameter ("scaleMode")))
            *pMo = 7;   // Custom — mode-specific preset slots not used for mode cycling
        proc.updateAllLaneScales();
        scaleLattice.setMask (absMask);
        addRecentMask (relMask);

        updateScaleStatus();
        if (_recognisedFamily >= 0 && _recognisedFamily != _activeFamilyIdx)
            setActiveFamily (_recognisedFamily);
        updateScalePresetButtons();
        curveDisplay.repaint();
    };

    // Initialise the family browser to match the current scale (or Diatonic if unrecognised).
    {
        const int mode = static_cast<int> (proc.apvts.getRawParameterValue ("scaleMode")->load());
        const int root = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());
        const uint16_t relMask = (mode < 7)
            ? proc.getScaleConfig (0).mask
            : dcScale::pcsRotate (static_cast<uint16_t> (
                  proc.apvts.getRawParameterValue ("scaleMask")->load()), root);
        const auto id = dcScale::pcsRecognise (relMask);
        setActiveFamily (id.exact ? id.family : 0);
    }

    // Mask label — display only (no text editor, avoids UIKit tracking element warning).
    // The lattice is the primary editing surface for the scale mask.
    maskLabel.setFont (DrawnCurveLookAndFeel::makeFont (11.0f));
    maskLabel.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (maskLabel);
    updateScaleStatus();

    // ── Curve display + help overlay ──────────────────────────────────────────
    addAndMakeVisible (curveDisplay);
    addChildComponent (helpOverlay);

    // Register global param listeners
    proc.apvts.addParameterListener (ParamID::playbackDirection, this);
    proc.apvts.addParameterListener (ParamID::syncEnabled,       this);

    applyTheme();
    onSyncToggled (proc.apvts.getRawParameterValue (ParamID::syncEnabled)->load() > 0.5f);
    updateScaleVisibility();
}

DrawnCurveEditor::~DrawnCurveEditor()
{
    // Restore defaults before _appLF is destroyed.
    juce::LookAndFeel::setDefaultLookAndFeel (nullptr);
    setLookAndFeel (nullptr);

    // Reset all widget-specific L&Fs before structs are destroyed.
    for (auto& b : laneTypeBtn)   b.setLookAndFeel (nullptr);
    for (auto& b : laneTeachBtn)  b.setLookAndFeel (nullptr);
    for (auto& b : laneMuteBtn)   b.setLookAndFeel (nullptr);
    for (auto& b : familyBtns)   b.setLookAndFeel (nullptr);
    recentFamilyBtn.setLookAndFeel (nullptr);
    for (auto& b : subfamilyBtns) b.setLookAndFeel (nullptr);
    for (auto* b : { &tickYMinusBtn, &tickYPlusBtn, &tickXMinusBtn, &tickXPlusBtn })
        b->setLookAndFeel (nullptr);
    // scaleAllBtn / None / Inv / Root use no custom LF; nothing to reset here.

    // Remove all APVTS listeners.
    proc.apvts.removeParameterListener (ParamID::playbackDirection, this);
    proc.apvts.removeParameterListener (ParamID::syncEnabled,       this);
    for (int L = 0; L < kMaxLanes; ++L)
    {
        for (const auto& base : { "msgType", "ccNumber", "midiChannel", "noteVelocity",
                                   "enabled", "loopMode", "phaseOffset", "minOutput", "maxOutput", "smoothing" })
            proc.apvts.removeParameterListener (laneParam (L, base), this);
    }
    // Global scale params
    for (const auto& id : { "scaleMode", "scaleRoot", "scaleMask" })
        proc.apvts.removeParameterListener (id, this);
}

//==============================================================================
// Setup helpers
//==============================================================================

void DrawnCurveEditor::setupSlider (juce::Slider& s, juce::Label& l,
                                     const juce::String& labelText,
                                     juce::Slider::SliderStyle style)
{
    s.setSliderStyle (style);
    s.setTextBoxStyle (juce::Slider::TextBoxRight, false, 52, 18);
    addAndMakeVisible (s);
    l.setText (labelText, juce::dontSendNotification);
    l.setFont (juce::Font (juce::FontOptions{}.withHeight (11.0f)));
    addAndMakeVisible (l);
}

bool DrawnCurveEditor::keyPressed (const juce::KeyPress& key)
{
    if (key == juce::KeyPress::spaceKey)
    {
        playButton.triggerClick();
        return true;
    }
    return false;
}

//==============================================================================
// Lane focus
//==============================================================================

void DrawnCurveEditor::setFocusedLane (int lane)
{
    _focusedLane = juce::jlimit (0, kMaxLanes - 1, lane);
    curveDisplay.setFocusedLane (_focusedLane);
    laneFocusCtrl.setSelectedIndex (_focusedLane, juce::dontSendNotification);
    bindShapingToLane (_focusedLane);
    updateScaleVisibility();
    updateLaneRow (_focusedLane);   // refresh mapping detail
    repaint();
}

void DrawnCurveEditor::bindShapingToLane (int lane)
{
    // Smoothing attachment
    smoothingAttach.reset();
    smoothingAttach = std::make_unique<Attach> (proc.apvts, laneParam (lane, "smoothing"), smoothingSlider);

    // Phase offset attachment
    phaseOffsetAttach.reset();
    phaseOffsetAttach = std::make_unique<Attach> (proc.apvts, laneParam (lane, "phaseOffset"), phaseOffsetSlider);

    // Range slider — no APVTS attachment for two-value sliders; set directly.
    rangeSlider.setMinValue (proc.apvts.getRawParameterValue (laneParam (lane, "minOutput"))->load(),
                             juce::dontSendNotification);
    rangeSlider.setMaxValue (proc.apvts.getRawParameterValue (laneParam (lane, "maxOutput"))->load(),
                             juce::dontSendNotification);
    updateRangeLabel();

    // One-shot toggle
    const bool isOneShot = proc.apvts.getRawParameterValue (laneParam (lane, "loopMode"))->load() > 0.5f;
    static const juce::String kLoopSym = juce::String::charToString (juce::juce_wchar (0x221E)); // ∞
    oneShotBtn.setButtonText (isOneShot ? "1" : kLoopSym);
    oneShotBtn.onClick = [this, lane] {
        if (auto* pLoop = dynamic_cast<juce::AudioParameterBool*>(
                              proc.apvts.getParameter (laneParam (lane, "loopMode")))) {
            static const juce::String kLoop = juce::String::charToString (juce::juce_wchar (0x221E));
            const bool nowOneShot = ! pLoop->get();
            *pLoop = nowOneShot;
            oneShotBtn.setButtonText (nowOneShot ? "1" : kLoop);
            proc.updateLaneSnapshot (lane);
        }
    };
}

//==============================================================================
// Lane row update
//==============================================================================

void DrawnCurveEditor::updateLaneRow (int lane)
{
    const int type = static_cast<int> (
        proc.apvts.getRawParameterValue (laneParam (lane, "msgType"))->load());
    const int ccNum = static_cast<int> (
        proc.apvts.getRawParameterValue (laneParam (lane, "ccNumber"))->load());
    const int vel   = static_cast<int> (
        proc.apvts.getRawParameterValue (laneParam (lane, "noteVelocity"))->load());
    const int ch    = static_cast<int> (
        proc.apvts.getRawParameterValue (laneParam (lane, "midiChannel"))->load());
    const bool enabled = proc.apvts.getRawParameterValue (laneParam (lane, "enabled"))->load() > 0.5f;

    // Detail: CC# for CC, velocity for Note, "—" for PB/Aft
    juce::String detailText;
    if (type == 0)       detailText = juce::String (ccNum);
    else if (type == 3)  detailText = juce::String (vel);
    else                 detailText = "-";
    laneDetailLabel[static_cast<size_t>(lane)].setText (detailText, juce::dontSendNotification);

    // Type button symbol
    const juce::String kNoteSymbol = juce::String::charToString (juce::juce_wchar (0x2669));  // ♩
    auto sym = [&kNoteSymbol] (int t) -> juce::String {
        switch (t) { case 0: return "CC"; case 1: return "AT"; case 2: return "PB"; case 3: return kNoteSymbol; } return "?";
    };
    laneTypeBtn[static_cast<size_t>(lane)].setButtonText (sym (type));

    laneChannelLabel[static_cast<size_t>(lane)].setText (juce::String (ch), juce::dontSendNotification);

    // Teach button: works for all message types (solos lane output so a receiving
    // synth can MIDI-Learn; CC lanes also capture incoming CC#)
    laneTeachBtn[static_cast<size_t>(lane)].setButtonText (proc.isTeachPending (lane) ? "..." : "Teach");
    laneTeachBtn[static_cast<size_t>(lane)].setEnabled (true);
    laneTeachBtn[static_cast<size_t>(lane)].setAlpha (1.0f);

    // Mute button
    laneMuteBtn[static_cast<size_t>(lane)].setButtonText (enabled ? "ON" : "mute");

    // Mapping detail panel (for focused lane only)
    if (lane == _focusedLane)
    {
        static const char* kTypeNames[] = { "CC", "Aft", "PB", "Note" };
        juce::String detail = juce::String (kTypeNames[type]);
        if (type == 0)       detail += " " + juce::String (ccNum);
        else if (type == 3)  detail += "  Vel " + juce::String (vel);
        detail += "  |  Ch " + juce::String (ch);
        if (! enabled) detail += "  [muted]";
        mappingDetailLabel.setText (detail, juce::dontSendNotification);

        // Message type affects how the range slider values are labelled (CC 0-127,
        // PB ±8192, note names).  Refresh the label whenever the focused row changes.
        updateRangeLabel();
    }
}

void DrawnCurveEditor::updateAllLaneRows()
{
    for (int L = 0; L < kMaxLanes; ++L)
        updateLaneRow (L);
}

void DrawnCurveEditor::updateMsgTypeButtons()
{
    // Kept for compatibility; delegates to the focused lane's row.
    updateLaneRow (_focusedLane);
}

//==============================================================================
// APVTS listener
//==============================================================================

namespace ParamID
{
    extern const juce::String playbackDirection;
    extern const juce::String syncEnabled;
}

void DrawnCurveEditor::parameterChanged (const juce::String& paramID, float)
{
    if (paramID == ParamID::playbackDirection)
    {
        juce::MessageManager::callAsync ([this] {
            dirControl.setSelectedIndex (
                kDirParamToVis[static_cast<int> (
                    proc.apvts.getRawParameterValue (ParamID::playbackDirection)->load())],
                juce::dontSendNotification);
        });
        return;
    }

    if (paramID == ParamID::syncEnabled)
    {
        juce::MessageManager::callAsync ([this] {
            const bool isSyncing = proc.apvts.getRawParameterValue (ParamID::syncEnabled)->load() > 0.5f;
            syncButton.setToggleState (isSyncing, juce::dontSendNotification);
            onSyncToggled (isSyncing);
        });
        return;
    }

    // Check per-lane params.
    for (int L = 0; L < kMaxLanes; ++L)
    {
        if (paramID == laneParam (L, "msgType")
            || paramID == laneParam (L, "ccNumber")
            || paramID == laneParam (L, "midiChannel")
            || paramID == laneParam (L, "noteVelocity"))
        {
            // Re-bake the snapshot so changes take effect immediately (no redraw needed).
            proc.updateLaneSnapshot (L);
            juce::MessageManager::callAsync ([this, L] {
                updateLaneRow (L);
                updateScaleVisibility();
                resized();   // recompute canvas height (anyNote may have changed)
                applyTheme();
            });
            return;
        }

        if (paramID == laneParam (L, "enabled"))
        {
            juce::MessageManager::callAsync ([this, L] { updateLaneRow (L); });
            return;
        }

        if (paramID == laneParam (L, "loopMode"))
        {
            proc.updateLaneSnapshot (L);
            if (L == _focusedLane)
            {
                juce::MessageManager::callAsync ([this] {
                    const bool isOneShot = proc.apvts.getRawParameterValue (
                        laneParam (_focusedLane, "loopMode"))->load() > 0.5f;
                    static const juce::String kLoop = juce::String::charToString (juce::juce_wchar (0x221E));
                    oneShotBtn.setButtonText (isOneShot ? "1" : kLoop);
                    applyTheme();
                });
            }
            return;
        }

        if (paramID == laneParam (L, "minOutput") || paramID == laneParam (L, "maxOutput"))
        {
            // Re-bake range into snapshot immediately; also update the slider display.
            proc.updateLaneSnapshot (L);
            if (L == _focusedLane)
                juce::MessageManager::callAsync ([this] { updateRangeSlider(); });
            return;
        }

        if (paramID == laneParam (L, "smoothing"))
        {
            // Re-bake smoothing into snapshot immediately (attachment fires this).
            proc.updateLaneSnapshot (L);
            return;
        }

        if (paramID == laneParam (L, "phaseOffset"))
        {
            // Re-bake phase offset into snapshot immediately (attachment fires this).
            proc.updateLaneSnapshot (L);
            return;
        }

    }

    // Global scale params — update scale panel regardless of which lane is focused
    if (paramID == "scaleMode" || paramID == "scaleRoot" || paramID == "scaleMask")
    {
        proc.updateAllLaneScales();
        juce::MessageManager::callAsync ([this] {
            scaleLattice.setMask (calcAbsLatticeMask (proc, 0));
            scaleLattice.setRoot (static_cast<int> (
                proc.apvts.getRawParameterValue ("scaleRoot")->load()));
            updateScaleStatus();
            curveDisplay.repaint();
        });
    }
}

//==============================================================================
// Sync toggle
//==============================================================================

void DrawnCurveEditor::onSyncToggled (bool isSync)
{
    speedAttach.reset();
    if (isSync)
    {
        speedAttach = std::make_unique<Attach> (proc.apvts, ParamID::syncBeats, speedSlider);
        // Invert the slider so right = fewer bars = faster (matches FREE direction).
        // JUCE's NormalisableRange requires start < end, so use custom convert lambdas.
        // The APVTS attachment maps slider.getValue() → param via param.convertTo0to1(),
        // which still receives the real bar count (1–32); the inversion only affects
        // the visual position on screen.
        juce::NormalisableRange<double> inv (1.0, 32.0,
            // from01: t=1 → 1 beat (right=fast), t=0 → 32 beats (left=slow)
            [](double, double, double t) { return 32.0 - juce::jlimit (0.0, 1.0, t) * 31.0; },
            // to01:   v=1 → 1.0 (right), v=32 → 0.0 (left)
            [](double, double, double v) { return juce::jlimit (0.0, 1.0, (32.0 - v) / 31.0); },
            [](double, double, double v) { return (double) juce::roundToInt (v); });
        speedSlider.setNormalisableRange (inv);
        speedSlider.setValue (proc.apvts.getRawParameterValue (ParamID::syncBeats)->load(),
                              juce::dontSendNotification);
        speedLabel.setText ("SYNC", juce::dontSendNotification);
        speedSlider.setTextValueSuffix (" beats");
        speedSlider.setNumDecimalPlacesToDisplay (0);
    }
    else
    {
        speedAttach = std::make_unique<Attach> (proc.apvts, ParamID::playbackSpeed, speedSlider);
        speedSlider.setNormalisableRange (juce::NormalisableRange<double> (0.25, 4.0));
        speedSlider.setValue (proc.apvts.getRawParameterValue (ParamID::playbackSpeed)->load(),
                              juce::dontSendNotification);
        speedLabel.setText ("FREE", juce::dontSendNotification);
        speedSlider.setTextValueSuffix ("x");
        speedSlider.setNumDecimalPlacesToDisplay (2);
    }

    // Direction is always user-controlled; sync only affects speed/timing.
    dirControl.setAlpha (1.0f);
    dirControl.repaint();
    applyTheme();
}

//==============================================================================
// Scale helpers
//==============================================================================

void DrawnCurveEditor::updateScaleVisibility()
{
    // Show the scale panel whenever ANY lane uses Note mode — scale is now
    // global so it applies to all Note-mode lanes simultaneously.
    bool anyNote = false;
    for (int L = 0; L < kMaxLanes; ++L)
        if (static_cast<int> (proc.apvts.getRawParameterValue (laneParam (L, "msgType"))->load()) == 3)
            { anyNote = true; break; }

    scaleLabel    .setVisible (anyNote);
    maskLabel     .setVisible (anyNote);
    scaleLattice  .setVisible (anyNote);
    scaleNotationBtn.setVisible (anyNote);
    scaleRotateBtn  .setVisible (anyNote);
    scaleAllBtn     .setVisible (anyNote);
    scaleNoneBtn  .setVisible (anyNote);
    scaleInvBtn   .setVisible (anyNote);
    scaleRootBtn  .setVisible (anyNote);
    for (auto& b : familyBtns) b.setVisible (anyNote);
    recentFamilyBtn.setVisible (anyNote);
    // Subfamily chips are individually shown/hidden by setActiveFamily().

    if (anyNote)
    {
        scaleLattice.setMask (calcAbsLatticeMask (proc, 0));
        scaleLattice.setRoot (static_cast<int> (
            proc.apvts.getRawParameterValue ("scaleRoot")->load()));
        updateScaleStatus();
    }

    resized();
}

void DrawnCurveEditor::setActiveFamily (int familyIdx)
{
    // kRecentFamilyIdx (= kNumFamilies) is a valid virtual index for the Recent tab.
    _activeFamilyIdx = juce::jlimit (0, kRecentFamilyIdx, familyIdx);

    if (_activeFamilyIdx == kRecentFamilyIdx)
    {
        // ── Recent history tab ────────────────────────────────────────────────
        _numSubfamilyChips = static_cast<int> (_recentMasks.size());
        for (int i = 0; i < kMaxModes; ++i)
        {
            const bool vis = (i < _numSubfamilyChips);
            if (vis)
            {
                const uint16_t m  = _recentMasks[static_cast<size_t>(i)];
                // Use recognised name if available, otherwise "Custom"
                const auto    id  = dcScale::pcsRecognise (m);
                const juce::String name = id.exact
                    ? juce::String::fromUTF8 (dcScale::kFamilies[id.family].modes[id.mode].name)
                    : juce::String ("Custom");
                subfamilyBtns[static_cast<size_t>(i)].setButtonText (name);
                _subfamilyLF  [static_cast<size_t>(i)].mask = m;
            }
            subfamilyBtns[static_cast<size_t>(i)].setVisible (vis);
        }
    }
    else
    {
        // ── Named family tab ─────────────────────────────────────────────────
        const auto& fam    = dcScale::kFamilies[_activeFamilyIdx];
        _numSubfamilyChips = fam.count;
        for (int i = 0; i < kMaxModes; ++i)
        {
            const bool vis = (i < _numSubfamilyChips);
            if (vis)
            {
                subfamilyBtns[static_cast<size_t>(i)].setButtonText (juce::String::fromUTF8 (fam.modes[i].name));
                _subfamilyLF  [static_cast<size_t>(i)].mask = fam.modes[i].mask;
            }
            subfamilyBtns[static_cast<size_t>(i)].setVisible (vis);
        }
    }

    resized();
}

void DrawnCurveEditor::addRecentMask (uint16_t relMask)
{
    // De-duplicate: remove if already present, then prepend.
    _recentMasks.erase (std::remove (_recentMasks.begin(), _recentMasks.end(), relMask),
                        _recentMasks.end());
    _recentMasks.insert (_recentMasks.begin(), relMask);
    if (static_cast<int> (_recentMasks.size()) > kMaxRecentMasks)
        _recentMasks.resize (static_cast<size_t> (kMaxRecentMasks));

    // If the Recent tab is currently open, refresh it immediately.
    if (_activeFamilyIdx == kRecentFamilyIdx)
        setActiveFamily (kRecentFamilyIdx);
}

void DrawnCurveEditor::updateScalePresetButtons()
{
    // ── Family tab colours ────────────────────────────────────────────────────
    // Visual priority: the tab the user is LOOKING AT (active/browsed) always
    // carries the strong highlight.  The recognised tab (the family the current
    // scale actually belongs to, if different) carries a secondary dim highlight
    // so orientation is still preserved without stealing focus.
    //
    //   Active (browsed)           → famActive  (strong)
    //   Recognised, not active     → famBrowsed (dim "scale lives here" cue)
    //   All others                 → famInactive
    const juce::Colour famActive    = _lightMode ? juce::Colour (0xff0B6E4F) : juce::Colour (0xff2979ff);
    const juce::Colour famBrowsed   = _lightMode ? juce::Colour (0xffA7C4A0) : juce::Colour (0xff33557A);
    const juce::Colour famInactive  = _lightMode ? juce::Colour (0xffF0EFE7) : juce::Colour (0xff333355);
    const juce::Colour famTextAct   = juce::Colours::white;
    const juce::Colour famTextOff   = _lightMode ? juce::Colour (0xff706D64) : juce::Colours::lightgrey;

    for (int f = 0; f < dcScale::kNumFamilies; ++f)
    {
        const bool isActive     = (f == _activeFamilyIdx);              // user is viewing this tab
        const bool isRecognised = (f == _recognisedFamily) && !isActive; // scale lives here (secondary)
        const auto bg   = isActive     ? famActive
                        : isRecognised ? famBrowsed
                                       : famInactive;
        const auto text = (isActive || isRecognised) ? famTextAct : famTextOff;
        familyBtns[static_cast<size_t>(f)].setColour (juce::TextButton::buttonColourId,   bg);
        familyBtns[static_cast<size_t>(f)].setColour (juce::TextButton::buttonOnColourId,  famActive);
        familyBtns[static_cast<size_t>(f)].setColour (juce::TextButton::textColourOffId,   text);
    }
    // Recent tab: strong highlight when active (it has no recognised-family counterpart).
    {
        const bool isActive = (_activeFamilyIdx == kRecentFamilyIdx);
        recentFamilyBtn.setColour (juce::TextButton::buttonColourId,  isActive ? famActive   : famInactive);
        recentFamilyBtn.setColour (juce::TextButton::buttonOnColourId, famActive);
        recentFamilyBtn.setColour (juce::TextButton::textColourOffId,  isActive ? famTextAct : famTextOff);
    }

    // ── Subfamily chip colours ────────────────────────────────────────────────
    // Highlight the chip whose mode matches the current scale within the active family.
    const juce::Colour chipOn   = _lightMode ? juce::Colour (0xff1D4ED8) : juce::Colour (0xff60A5FA);
    const juce::Colour chipOff  = _lightMode ? juce::Colour (0xffE5E7EB) : juce::Colour (0xff374151);
    const juce::Colour dotOn    = _lightMode ? juce::Colour (0xff1E40AF) : juce::Colour (0xff93C5FD);
    const juce::Colour dotOff   = _lightMode ? juce::Colour (0xffBFDBFE) : juce::Colour (0xff1E3A5F);

    for (int i = 0; i < _numSubfamilyChips; ++i)
    {
        const bool match = (_recognisedFamily == _activeFamilyIdx) && (_recognisedMode == i);
        subfamilyBtns[static_cast<size_t>(i)].setColour (juce::TextButton::buttonColourId,   match ? chipOn : chipOff);
        subfamilyBtns[static_cast<size_t>(i)].setColour (juce::TextButton::textColourOffId,   match ? juce::Colours::white
                                                         : (_lightMode ? juce::Colour (0xff374151) : juce::Colour (0xffD1D5DB)));
        _subfamilyLF[static_cast<size_t>(i)].colOn  = dotOn;
        _subfamilyLF[static_cast<size_t>(i)].colOff = dotOff;
        subfamilyBtns[static_cast<size_t>(i)].repaint();
    }
}

void DrawnCurveEditor::updateRangeSlider()
{
    const int L = _focusedLane;
    rangeSlider.setMinValue (proc.apvts.getRawParameterValue (laneParam (L, "minOutput"))->load(),
                             juce::dontSendNotification);
    rangeSlider.setMaxValue (proc.apvts.getRawParameterValue (laneParam (L, "maxOutput"))->load(),
                             juce::dontSendNotification);
    updateRangeLabel();
}

void DrawnCurveEditor::updateRangeLabel()
{
    const float mn = static_cast<float> (rangeSlider.getMinValue());
    const float mx = static_cast<float> (rangeSlider.getMaxValue());

    const auto msgType = static_cast<MessageType> (
        static_cast<int> (proc.apvts.getRawParameterValue (
            laneParam (_focusedLane, "msgType"))->load()));

    if (msgType == MessageType::Note)
    {
        // Show MIDI note names (e.g. "C2 – G5"), honouring the ♯/♭ notation toggle.
        static const char* kSharpNames[] = { "C","C\u266f","D","D\u266f","E","F","F\u266f","G","G\u266f","A","A\u266f","B" };
        static const char* kFlatNames [] = { "C","D\u266d","D","E\u266d","E","F","G\u266d","G","A\u266d","A","B\u266d","B" };
        auto noteName = [&] (float norm) -> juce::String {
            const int midi = juce::jlimit (0, 127, juce::roundToInt (norm * 127.0f));
            const char* nm = _useFlats ? kFlatNames[midi % 12] : kSharpNames[midi % 12];
            return juce::String::fromUTF8 (nm) + juce::String (midi / 12 - 1);
        };
        rangeLabel.setText (noteName (mn) + " - " + noteName (mx),
                            juce::dontSendNotification);
    }
    else if (msgType == MessageType::PitchBend)
    {
        // Show signed pitch-bend values (-8192 – +8191)
        const int lo = juce::jlimit (-8192, 8191, juce::roundToInt (mn * 16383.0f) - 8192);
        const int hi = juce::jlimit (-8192, 8191, juce::roundToInt (mx * 16383.0f) - 8192);
        rangeLabel.setText (juce::String (lo) + " - " + juce::String (hi),
                            juce::dontSendNotification);
    }
    else
    {
        // CC (0-127) and Channel Pressure (0-127)
        const int lo = juce::jlimit (0, 127, juce::roundToInt (mn * 127.0f));
        const int hi = juce::jlimit (0, 127, juce::roundToInt (mx * 127.0f));
        rangeLabel.setText (juce::String (lo) + " - " + juce::String (hi),
                            juce::dontSendNotification);
    }
}

void DrawnCurveEditor::updateScaleStatus()
{
    // ── 1. Root-relative mask → recognition ──────────────────────────────────
    const int mode = static_cast<int> (proc.apvts.getRawParameterValue ("scaleMode")->load());
    const int root = static_cast<int> (proc.apvts.getRawParameterValue ("scaleRoot")->load());

    const uint16_t relMask = (mode < 7)
        ? proc.getScaleConfig (0).mask
        : dcScale::pcsRotate (
              static_cast<uint16_t> (proc.apvts.getRawParameterValue ("scaleMask")->load()),
              root);

    const auto id = dcScale::pcsRecognise (relMask);
    _recognisedFamily = id.exact ? id.family : -1;
    _recognisedMode   = id.exact ? id.mode   : -1;

    // Do NOT auto-switch the active family here.  The family tab is a browser:
    // the user navigates it manually; recognition just highlights which chip
    // matches (if any) and updates the name label.  Auto-switching would revert
    // a manual tab browse every time a parameterChanged callAsync fires.

    // ── 2. Decimal bitmask display ───────────────────────────────────────────
    const uint16_t absMask = calcAbsLatticeMask (proc, _focusedLane);
    maskLabel.setText (juce::String (static_cast<int> (absMask)).paddedLeft ('0', 4),
                       juce::dontSendNotification);

    // ── 3. Mode-name label ───────────────────────────────────────────────────
    if (id.exact)
        scaleLabel.setText (juce::String::fromUTF8 (dcScale::kFamilies[id.family].modes[id.mode].name),
                            juce::dontSendNotification);
    else
        scaleLabel.setText ((relMask == 0x0FFF) ? "Chrom." : "Custom",
                            juce::dontSendNotification);

    // ── 4. Colour highlight for tabs + chips ─────────────────────────────────
    updateScalePresetButtons();
}

//==============================================================================
// applyTheme
//==============================================================================

void DrawnCurveEditor::applyTheme()
{
    const bool light = _lightMode;

    const juce::Colour textCol  = light ? juce::Colour (0xff28261F) : juce::Colours::white;
    const juce::Colour dimText  = light ? juce::Colour (0xff706D64) : juce::Colours::lightgrey;
    const juce::Colour tbBg     = light ? juce::Colour (0xffFDFCFA) : juce::Colour (0xff252538);
    const juce::Colour tbLine   = light ? juce::Colour (0x1EC9C5B5) : juce::Colour (0x33ffffff);
    const juce::Colour accent   = light ? juce::Colour (0xff0B6E4F) : juce::Colour (0xff00e5ff);
    const juce::Colour btnBg    = light ? juce::Colour (0xffF0EFE7) : juce::Colour (0xff333355);
    const juce::Colour btnText  = light ? juce::Colour (0xff28261F) : juce::Colours::white;

    // Sliders
    for (auto* s : { &smoothingSlider, &speedSlider, &phaseOffsetSlider })
    {
        s->setColour (juce::Slider::textBoxTextColourId,       textCol);
        s->setColour (juce::Slider::textBoxBackgroundColourId, tbBg);
        s->setColour (juce::Slider::textBoxOutlineColourId,    tbLine);
        s->setColour (juce::Slider::thumbColourId,             accent);
        s->setColour (juce::Slider::trackColourId,             accent.withAlpha (0.45f));
        s->setColour (juce::Slider::backgroundColourId,        tbBg);
    }
    rangeSlider.setColour (juce::Slider::thumbColourId,      accent);
    rangeSlider.setColour (juce::Slider::trackColourId,      accent.withAlpha (0.45f));
    rangeSlider.setColour (juce::Slider::backgroundColourId, tbBg);

    for (auto* l : { &smoothingLabel, &rangeLabel, &speedLabel, &phaseOffsetLabel })
        l->setColour (juce::Label::textColourId, dimText);

    // clearButton is a dcui::IconButton
    clearButton.setBaseColour (light ? juce::Colour (0xff706D64) : juce::Colours::lightgrey);

    // Utility buttons
    for (auto* b : { &playButton, &panicButton, &themeButton, &helpButton,
                     &tickYMinusBtn, &tickYPlusBtn, &tickXMinusBtn, &tickXPlusBtn,
                     &oneShotBtn })
    {
        b->setColour (juce::TextButton::buttonColourId,  btnBg);
        b->setColour (juce::TextButton::textColourOffId, btnText);
    }

    // Panic button — red accent to signal danger
    panicButton.setColour (juce::TextButton::buttonColourId,
                           light ? juce::Colour (0xffFFE4E1) : juce::Colour (0xff5C1010));
    panicButton.setColour (juce::TextButton::textColourOffId,
                           light ? juce::Colour (0xffC0392B) : juce::Colour (0xffFF6B6B));

    // Direction control — violet accent
    dirControl.bgColour     = light ? juce::Colour (0xffEDE8FF) : btnBg;
    dirControl.activeColour = light ? juce::Colour (0xff8B5CF6) : juce::Colour (0xff2979ff);
    dirControl.labelColour  = light ? juce::Colour (0xff6D28D9) : juce::Colours::lightgrey;
    dirControl.activeLabel  = juce::Colours::white;
    dirControl.borderColour = light ? juce::Colour (0x28000000) : juce::Colour (0x33ffffff);
    dirControl.repaint();

    // Lane focus control — use lane 0 colour for emphasis
    {
        const auto activeLaneCol = light ? kLaneColourLight[_focusedLane]
                                         : kLaneColourDark[_focusedLane];
        // Choose white or near-black label depending on the lane colour's brightness.
        const auto activeLabelCol = (activeLaneCol.getBrightness() > 0.55f)
                                    ? juce::Colour (0xdd1a1a1a)   // near-black for bright lanes
                                    : juce::Colours::white;
        laneFocusCtrl.bgColour     = light ? juce::Colour (0xffF0EFE7) : btnBg;
        laneFocusCtrl.activeColour = activeLaneCol;
        laneFocusCtrl.labelColour  = dimText;
        laneFocusCtrl.activeLabel  = activeLabelCol;
        laneFocusCtrl.borderColour = light ? juce::Colour (0x28000000) : juce::Colour (0x33ffffff);
        laneFocusCtrl.repaint();
    }

    // Density buttons
    for (auto* b : { &tickYMinusBtn, &tickYPlusBtn, &tickXMinusBtn, &tickXPlusBtn })
    {
        b->setColour (juce::TextButton::buttonColourId,
                      light ? juce::Colour (0xffF0EFE7) : btnBg);
        b->setColour (juce::TextButton::textColourOffId,
                      light ? juce::Colour (0xff5B6985) : juce::Colours::lightgrey);
    }

    // Routing matrix rows
    for (int L = 0; L < kMaxLanes; ++L)
    {
        const bool enabled = proc.apvts.getRawParameterValue (laneParam (L, "enabled"))->load() > 0.5f;
        const bool isFocused = (L == _focusedLane);
        const auto laneCol = light ? kLaneColourLight[L] : kLaneColourDark[L];
        const float rowAlpha = enabled ? 1.0f : 0.45f;

        laneTypeBtn[static_cast<size_t>(L)].setColour (juce::TextButton::buttonColourId,  laneCol.withAlpha (0.18f * rowAlpha));
        laneTypeBtn[static_cast<size_t>(L)].setColour (juce::TextButton::textColourOffId, laneCol);

        for (auto* lbl : { &laneDetailLabel[static_cast<size_t>(L)], &laneChannelLabel[static_cast<size_t>(L)] })
        {
            lbl->setColour (juce::Label::textColourId,       enabled ? textCol : dimText);
            lbl->setColour (juce::Label::backgroundColourId, tbBg.withAlpha (rowAlpha));
            lbl->setColour (juce::Label::outlineColourId,    tbLine);
            lbl->setColour (juce::Label::textWhenEditingColourId, textCol);
            lbl->setAlpha (rowAlpha);
        }

        // Teach button: glows amber while pending
        const bool teaching = proc.isTeachPending (L);
        const auto teachAccent = light ? juce::Colour (0xffF59E0B) : juce::Colour (0xffFBBF24);
        laneTeachBtn[static_cast<size_t>(L)].setColour (juce::TextButton::buttonColourId,
                                   teaching ? teachAccent : btnBg);
        laneTeachBtn[static_cast<size_t>(L)].setColour (juce::TextButton::textColourOffId,
                                   teaching ? juce::Colours::white : btnText);

        // Mute button: uses lane colour when active
        laneMuteBtn[static_cast<size_t>(L)].setColour (juce::TextButton::buttonColourId,
                                  enabled ? laneCol.withAlpha (0.85f) : btnBg);
        laneMuteBtn[static_cast<size_t>(L)].setColour (juce::TextButton::textColourOffId,
                                  enabled ? juce::Colours::white : dimText);

        // Selected row indicator: slightly different background
        if (isFocused)
        {
            // The selected row highlight is drawn in paint() via the _secRouting panel.
            // Here we just ensure the controls have full opacity.
        }
    }

    // Mapping detail label
    mappingDetailLabel.setColour (juce::Label::textColourId, dimText);

    // Scale controls
    scaleLabel.setColour (juce::Label::textColourId, dimText);

    scaleLattice.colBg           = light ? juce::Colours::white          : juce::Colour (0xff252538);
    scaleLattice.colBorder       = light ? juce::Colour (0xffA9BAD5)     : juce::Colour (0x55ffffff);
    scaleLattice.colTextOff      = light ? juce::Colour (0xff8898AA)     : juce::Colour (0x88ffffff);
    scaleLattice.colActive       = light ? juce::Colour (0xffDCFCE7)     : juce::Colour (0xff22C55E);
    scaleLattice.colActiveBorder = light ? juce::Colour (0xff22C55E)     : juce::Colour (0xff4ADE80);
    scaleLattice.colTextOn       = light ? juce::Colour (0xff166534)     : juce::Colours::black;
    scaleLattice.colRoot         = light ? juce::Colour (0xffFEF3C7)     : juce::Colour (0xffF59E0B);
    scaleLattice.colRootBorder   = light ? juce::Colour (0xffF59E0B)     : juce::Colour (0xffFBBF24);
    scaleLattice.colRootRing     = light ? juce::Colour (0xffFBBF24)     : juce::Colour (0xffFDE68A);
    scaleLattice.colRootText     = light ? juce::Colour (0xff92400E)     : juce::Colours::black;
    scaleLattice.repaint();

    for (auto* b : { &scaleNotationBtn, &scaleRotateBtn, &scaleAllBtn, &scaleNoneBtn, &scaleInvBtn, &scaleRootBtn })
    {
        b->setColour (juce::TextButton::buttonColourId,  btnBg);
        b->setColour (juce::TextButton::textColourOffId, btnText);
    }
    updateScalePresetButtons();   // re-colour family tabs + chips for new theme

    maskLabel.setColour (juce::Label::textColourId,            textCol);
    maskLabel.setColour (juce::Label::backgroundColourId,      btnBg);
    maskLabel.setColour (juce::Label::outlineColourId,         dimText);
    maskLabel.setColour (juce::Label::textWhenEditingColourId, textCol);

    // syncButton is a dcui::IconButton — use setBaseColour
    syncButton.setBaseColour (light ? juce::Colour (0xff6D28D9) : juce::Colour (0xff2979ff));
    syncButton.repaint();

    repaint();
}

//==============================================================================
// paint
//==============================================================================

void DrawnCurveEditor::paint (juce::Graphics& g)
{
    const Theme& T = _lightMode ? kLight : kDark;
    g.fillAll (T.panelBg);

    if (_lightMode)
    {
        auto drawPanel = [&] (juce::Rectangle<int> r, juce::Colour fill, juce::Colour border)
        {
            if (r.isEmpty()) return;
            g.setColour (fill);
            g.fillRoundedRectangle (r.toFloat(), 8.0f);
            g.setColour (border);
            g.drawRoundedRectangle (r.toFloat().reduced (0.5f), 8.0f, 1.0f);
        };

        drawPanel (_secTransport, juce::Colour (0xffFBF7FF), juce::Colour (0xffE6D7FF));  // violet
        drawPanel (_secShaping,   juce::Colour (0xffFFFCF2), juce::Colour (0xffF8E7A8));  // amber
        drawPanel (_secRouting,   juce::Colour (0xffF6FFF8), juce::Colour (0xffD3F2DD));  // green
        drawPanel (_secNotes,     juce::Colour (0xffFFF7FB), juce::Colour (0xffF8D6EC));  // pink

        // Routing matrix: header labels + focused-row highlight + lane-colour dots
        if (! _secRouting.isEmpty())
        {
            using namespace Layout;
            const int headerH = 16;
            const int rs_x    = _secRouting.getX() + 4;
            const int rs_top  = _secRouting.getY() + 4;

            // ── Header labels ─────────────────────────────────────────────────
            {
                g.setColour (juce::Colour (0xff706D64));
                g.setFont (juce::Font (juce::FontOptions{}.withHeight (9.0f)));
                int hx = rs_x + matDotW + matInnerGap;
                const int hy = rs_top, hh = headerH;
                g.drawFittedText ("Type", hx, hy, matTargetW, hh,
                                  juce::Justification::centredLeft, 1);
                hx += matTargetW + matInnerGap;
                g.drawFittedText ("Det", hx, hy, matDetailW, hh,
                                  juce::Justification::centredLeft, 1);
                hx += matDetailW + matInnerGap;
                g.drawFittedText ("Ch", hx, hy, matChanW, hh,
                                  juce::Justification::centredLeft, 1);
                hx += matChanW + matInnerGap;
                g.drawFittedText ("Teach", hx, hy, matTeachW, hh,
                                  juce::Justification::centredLeft, 1);
                hx += matTeachW + matInnerGap;
                g.drawFittedText ("On", hx, hy, matMuteW, hh,
                                  juce::Justification::centredLeft, 1);
            }

            // ── Focused-row highlight ─────────────────────────────────────────
            const int rowY = rs_top + headerH + _focusedLane * (matRowH + 2);
            const auto rowR = juce::Rectangle<int> (
                _secRouting.getX() + 3, rowY,
                _secRouting.getWidth() - 6, matRowH);
            g.setColour (juce::Colour (0xff0B6E4F).withAlpha (0.08f));
            g.fillRoundedRectangle (rowR.toFloat(), 4.0f);

            // ── Lane-colour dots ──────────────────────────────────────────────
            const auto* laneColours = _lightMode ? kLaneColourLight : kLaneColourDark;
            for (int L = 0; L < kMaxLanes; ++L)
            {
                const int dotY    = rs_top + headerH + L * (matRowH + 2);
                const float cx    = static_cast<float> (rs_x + matDotW / 2);
                const float cy    = static_cast<float> (dotY + matRowH / 2);
                const float r     = 4.0f;
                g.setColour (laneColours[L]);
                g.fillEllipse (cx - r, cy - r, r * 2.0f, r * 2.0f);
            }
        }
    }
}

//==============================================================================
// resized
//==============================================================================

void DrawnCurveEditor::resized()
{
    using namespace Layout;

    auto area = getLocalBounds().reduced (pad);

    // ── Utility bar ───────────────────────────────────────────────────────────
    {
        auto row = area.removeFromTop (utilityRowH);
        themeButton.setBounds (row.removeFromRight (28));   // single glyph ☾/☀
        row.removeFromRight (pad);
        helpButton .setBounds (row.removeFromRight (28));
        row.removeFromRight (pad);
        panicButton.setBounds (row.removeFromRight (22));
    }
    area.removeFromTop (pad);

    // ── Two-column split ──────────────────────────────────────────────────────
    auto rightCol = area.removeFromRight (rightColW);
    area.removeFromRight (colGap);
    auto leftCol  = area;

    // ══════════════════════════════════════════════════════════════════════════
    // RIGHT COLUMN
    // ══════════════════════════════════════════════════════════════════════════

    // ── Transport section (violet) ────────────────────────────────────────────
    _secTransport = rightCol.removeFromTop (transportH);
    {
        auto ts = _secTransport.reduced (4);

        dirControl.setBounds (ts.removeFromTop (38));
        ts.removeFromTop (4);

        auto row = ts.removeFromTop (paramRowH);
        syncButton .setBounds (row.removeFromLeft (52).withSizeKeepingCentre (52, 32));
        row.removeFromLeft (4);
        speedLabel .setBounds (row.removeFromTop (paramLabelH));
        speedSlider.setBounds (row);
    }
    rightCol.removeFromTop (pad);

    // ── Shaping section (amber) ───────────────────────────────────────────────
    _secShaping = rightCol.removeFromTop (shapingH);
    {
        auto ss = _secShaping.reduced (4);

        // Lane focus selector + one-shot toggle (inline in same row)
        {
            auto focusRow = ss.removeFromTop (28);
            oneShotBtn.setBounds (focusRow.removeFromRight (28));
            focusRow.removeFromRight (4);
            laneFocusCtrl.setBounds (focusRow);
        }
        ss.removeFromTop (4);

        // Smooth
        {
            auto row = ss.removeFromTop (paramRowH);
            smoothingLabel .setBounds (row.removeFromTop (paramLabelH));
            smoothingSlider.setBounds (row);
        }
        ss.removeFromTop (4);

        // Range
        {
            auto row = ss.removeFromTop (paramRowH);
            rangeLabel .setBounds (row.removeFromTop (paramLabelH));
            rangeSlider.setBounds (row);
        }
        ss.removeFromTop (4);

        // Phase offset
        {
            auto row = ss.removeFromTop (paramRowH);
            phaseOffsetLabel .setBounds (row.removeFromTop (paramLabelH));
            phaseOffsetSlider.setBounds (row);
        }
    }
    rightCol.removeFromTop (pad);

    // ── Routing matrix section (green) ───────────────────────────────────────
    _secRouting = rightCol.removeFromTop (routingMatH);
    {
        auto rs = _secRouting.reduced (4);
        rs.removeFromTop (4);   // top margin inside panel

        // Header row (label text painted; no JUCE component)
        rs.removeFromTop (16);

        // Three lane rows
        for (int L = 0; L < kMaxLanes; ++L)
        {
            auto row = rs.removeFromTop (matRowH);
            rs.removeFromTop (2);   // gap between rows

            // Lane dot is drawn in paint() — skip its space
            row.removeFromLeft (matDotW + matInnerGap);

            // Target type
            laneTypeBtn[static_cast<size_t>(L)].setBounds (row.removeFromLeft (matTargetW));
            row.removeFromLeft (matInnerGap);

            // Detail
            laneDetailLabel[static_cast<size_t>(L)].setBounds (row.removeFromLeft (matDetailW));
            row.removeFromLeft (matInnerGap);

            // Channel
            laneChannelLabel[static_cast<size_t>(L)].setBounds (row.removeFromLeft (matChanW));
            row.removeFromLeft (matInnerGap);

            // Teach
            laneTeachBtn[static_cast<size_t>(L)].setBounds (row.removeFromLeft (matTeachW));
            row.removeFromLeft (matInnerGap);

            // Mute
            laneMuteBtn[static_cast<size_t>(L)].setBounds (row.removeFromLeft (matMuteW));
        }

        rs.removeFromTop (4);
        // Mapping detail panel
        mappingDetailLabel.setBounds (rs.removeFromTop (28));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LEFT COLUMN
    // ══════════════════════════════════════════════════════════════════════════

    // Reserve space for the note editor whenever ANY lane is in Note mode,
    // not just the focused lane.  This prevents the canvas from expanding
    // over a visible scale lattice when the user focuses a CC lane while
    // another lane is in Note mode.
    bool anyNoteMode = false;
    for (int L = 0; L < kMaxLanes; ++L)
        anyNoteMode |= (static_cast<int> (
            proc.apvts.getRawParameterValue (laneParam (L, "msgType"))->load()) == 3);
    const bool isNote = anyNoteMode;

    // ── Note editor strip (pink, bottom of left col) ──────────────────────────
    static constexpr int kNoteEditorH = 4 + kFamilyBarH + 4 + kSubfamilyRowH + 4
                                          + kActionRowH + 4 + kScaleLatticeH + 2;  // = 244

    if (isNote)
    {
        leftCol.removeFromBottom (pad);
        _secNotes = leftCol.removeFromBottom (kNoteEditorH);
        leftCol.removeFromBottom (pad);

        auto ne = _secNotes;
        ne.removeFromTop (4);

        // ── Family tab bar (8 named families + 1 "Recent" tab = 9 total) ────────
        {
            auto fRow = ne.removeFromTop (kFamilyBarH);
            const int N    = dcScale::kNumFamilies + 1;   // +1 for Recent
            const int btnW = (fRow.getWidth() - (N - 1)) / N;
            for (int f = 0; f < dcScale::kNumFamilies; ++f)
            {
                familyBtns[static_cast<size_t>(f)].setBounds (fRow.removeFromLeft (btnW));
                fRow.removeFromLeft (1);
            }
            recentFamilyBtn.setBounds (fRow.removeFromLeft (btnW));
        }
        ne.removeFromTop (4);

        // ── Subfamily chip row ────────────────────────────────────────────────
        {
            auto sRow = ne.removeFromTop (kSubfamilyRowH);
            const int N = _numSubfamilyChips;
            if (N > 0)
            {
                const int chipW = (sRow.getWidth() - (N - 1) * 2) / N;
                for (int i = 0; i < kMaxModes; ++i)
                {
                    if (i < N)
                    {
                        subfamilyBtns[static_cast<size_t>(i)].setBounds (sRow.removeFromLeft (chipW));
                        if (i < N - 1) sRow.removeFromLeft (2);
                    }
                    else
                    {
                        subfamilyBtns[static_cast<size_t>(i)].setBounds ({});
                    }
                }
            }
        }
        ne.removeFromTop (4);

        // ── Action row: ↻ ● ○ ◑ ◆  [spacer]  [mode-name] [decimal] ──────────
        {
            auto aRow = ne.removeFromTop (kActionRowH);
            // Right side first (labels)
            maskLabel .setBounds (aRow.removeFromRight (52).withSizeKeepingCentre (52, 20));
            aRow.removeFromRight (3);
            scaleLabel.setBounds (aRow.removeFromRight (84).withSizeKeepingCentre (84, 14));
            aRow.removeFromRight (8);
            // Left side (action buttons)
            scaleNotationBtn.setBounds (aRow.removeFromLeft (28)); aRow.removeFromLeft (4);
            scaleRotateBtn  .setBounds (aRow.removeFromLeft (28)); aRow.removeFromLeft (6);
            scaleAllBtn     .setBounds (aRow.removeFromLeft (28)); aRow.removeFromLeft (2);
            scaleNoneBtn    .setBounds (aRow.removeFromLeft (28)); aRow.removeFromLeft (2);
            scaleInvBtn     .setBounds (aRow.removeFromLeft (28)); aRow.removeFromLeft (2);
            scaleRootBtn    .setBounds (aRow.removeFromLeft (28));
        }
        ne.removeFromTop (4);

        // ── Scale lattice: full width ─────────────────────────────────────────
        scaleLattice.setBounds (ne.removeFromTop (kScaleLatticeH));
    }
    else
    {
        _secNotes = {};
    }

    // ── Y-density stepper ─────────────────────────────────────────────────────
    auto yStepCol = leftCol.removeFromLeft (yStepperW);
    leftCol.removeFromLeft (3);
    {
        const int btnH = 28, yMid = yStepCol.getCentreY();
        tickYPlusBtn .setBounds (yStepCol.getX(), yMid - btnH - 2, yStepperW, btnH);
        tickYMinusBtn.setBounds (yStepCol.getX(), yMid + 2,        yStepperW, btnH);
    }

    // ── X-density stepper + Clear ─────────────────────────────────────────────
    leftCol.removeFromBottom (3);
    {
        auto row = leftCol.removeFromBottom (xStepperH);
        tickXMinusBtn.setBounds (row.removeFromLeft (28));
        row.removeFromLeft (4);
        tickXPlusBtn .setBounds (row.removeFromLeft (28));
        row.removeFromLeft (8);
        clearButton.setBounds (row.removeFromLeft (52));
    }

    // ── Curve display ─────────────────────────────────────────────────────────
    curveDisplay.setBounds (leftCol);

    // ── Help overlay ──────────────────────────────────────────────────────────
    helpOverlay.setBounds (getLocalBounds());
}
