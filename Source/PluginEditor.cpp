#include "PluginEditor.h"

//==============================================================================
// Colour palette
namespace Colours
{
    static const juce::Colour background  { 0xff12121f };
    static const juce::Colour gridLine    { 0x18ffffff };
    static const juce::Colour curve       { 0xff00e5ff };   // cyan
    static const juce::Colour capture     { 0xffff6b35 };   // orange (live draw)
    static const juce::Colour playhead    { 0xffffffff };
    static const juce::Colour playheadDot { 0xff00e5ff };
    static const juce::Colour hint        { 0x55ffffff };
    static const juce::Colour border      { 0x33ffffff };
    static const juce::Colour panelBg     { 0xff1c1c2e };
}

//==============================================================================
// CurveDisplay

CurveDisplay::CurveDisplay (DrawnCurveProcessor& p)
    : proc (p)
{
    startTimerHz (30);   // repaint at ~30 fps while playing
}

CurveDisplay::~CurveDisplay() { stopTimer(); }

void CurveDisplay::resized() {}

void CurveDisplay::paint (juce::Graphics& g)
{
    auto bounds = getLocalBounds().toFloat();
    const float w = bounds.getWidth();
    const float h = bounds.getHeight();

    // ── Background ────────────────────────────────────────────────────────────
    g.fillAll (Colours::background);

    // ── Subtle grid ───────────────────────────────────────────────────────────
    g.setColour (Colours::gridLine);
    for (int i = 1; i < 4; ++i)
    {
        g.drawVerticalLine   (juce::roundToInt (w * 0.25f * i),  0.0f, h);
        g.drawHorizontalLine (juce::roundToInt (h * 0.25f * i),  0.0f, w);
    }

    // ── Recorded curve ────────────────────────────────────────────────────────
    if (proc.hasCurve())
    {
        const auto table = proc.getCurveTable();
        juce::Path curvePath;
        bool first = true;
        for (int i = 0; i < 256; ++i)
        {
            float x = static_cast<float> (i) / 255.0f * w;
            float y = (1.0f - table[static_cast<size_t> (i)]) * h;  // y=0 top → high CC high
            if (first) { curvePath.startNewSubPath (x, y); first = false; }
            else          curvePath.lineTo (x, y);
        }
        g.setColour (Colours::curve);
        g.strokePath (curvePath, juce::PathStrokeType (2.5f,
                                                       juce::PathStrokeType::curved,
                                                       juce::PathStrokeType::rounded));
    }

    // ── Live capture trail ────────────────────────────────────────────────────
    if (isCapturing && !capturePath.isEmpty())
    {
        g.setColour (Colours::capture);
        g.strokePath (capturePath, juce::PathStrokeType (2.0f,
                                                         juce::PathStrokeType::curved,
                                                         juce::PathStrokeType::rounded));
    }

    // ── Playhead ──────────────────────────────────────────────────────────────
    if (proc.isPlaying() && proc.hasCurve())
    {
        const float  phase = proc.currentPhase();
        const float  px    = phase * w;
        const auto   table = proc.getCurveTable();
        const int    idx   = juce::jlimit (0, 255, static_cast<int> (phase * 255.0f));
        const float  py    = (1.0f - table[static_cast<size_t> (idx)]) * h;

        g.setColour (Colours::playhead.withAlpha (0.75f));
        g.drawVerticalLine (juce::roundToInt (px), 0.0f, h);

        g.setColour (Colours::playheadDot);
        g.fillEllipse (px - 5.0f, py - 5.0f, 10.0f, 10.0f);
    }

    // ── "Draw a curve" hint ────────────────────────────────────────────────────
    if (!proc.hasCurve() && !isCapturing)
    {
        g.setColour (Colours::hint);
        g.setFont (juce::Font (16.0f));
        g.drawText ("Draw a curve here", bounds, juce::Justification::centred, false);
    }

    // ── Border ────────────────────────────────────────────────────────────────
    g.setColour (Colours::border);
    g.drawRect (bounds, 1.0f);
}

//==============================================================================
// Touch / mouse

void CurveDisplay::mouseDown (const juce::MouseEvent& e)
{
    captureStartTime = juce::Time::getMillisecondCounterHiRes();
    isCapturing      = true;
    capturePath.clear();
    capturePath.startNewSubPath (static_cast<float> (e.x),
                                  static_cast<float> (e.y));

    proc.beginCapture();
    proc.addCapturePoint (0.0,
                          juce::jlimit (0.0f, 1.0f, static_cast<float> (e.x) / static_cast<float> (getWidth())),
                          juce::jlimit (0.0f, 1.0f, static_cast<float> (e.y) / static_cast<float> (getHeight())));
    repaint();
}

void CurveDisplay::mouseDrag (const juce::MouseEvent& e)
{
    if (!isCapturing) return;

    capturePath.lineTo (static_cast<float> (e.x),
                         static_cast<float> (e.y));

    const double t = (juce::Time::getMillisecondCounterHiRes() - captureStartTime) / 1000.0;
    proc.addCapturePoint (t,
                          juce::jlimit (0.0f, 1.0f, static_cast<float> (e.x) / static_cast<float> (getWidth())),
                          juce::jlimit (0.0f, 1.0f, static_cast<float> (e.y) / static_cast<float> (getHeight())));
    repaint();
}

void CurveDisplay::mouseUp (const juce::MouseEvent& e)
{
    if (!isCapturing) return;

    const double t = (juce::Time::getMillisecondCounterHiRes() - captureStartTime) / 1000.0;
    proc.addCapturePoint (t,
                          juce::jlimit (0.0f, 1.0f, static_cast<float> (e.x) / static_cast<float> (getWidth())),
                          juce::jlimit (0.0f, 1.0f, static_cast<float> (e.y) / static_cast<float> (getHeight())));
    proc.finalizeCapture();

    isCapturing = false;
    capturePath.clear();
    repaint();
}

void CurveDisplay::timerCallback()
{
    if (proc.isPlaying())
        repaint();
}

//==============================================================================
// DrawnCurveEditor

namespace Layout
{
    static constexpr int editorW       = 640;
    static constexpr int editorH       = 420;
    static constexpr int curveH        = 240;
    static constexpr int pad           = 6;
    static constexpr int buttonRowH    = 44;
    static constexpr int paramLabelH   = 16;
    static constexpr int paramSliderH  = 36;
    static constexpr int paramRowH     = paramLabelH + paramSliderH;  // 52
}

DrawnCurveEditor::DrawnCurveEditor (DrawnCurveProcessor& p)
    : AudioProcessorEditor (&p),
      proc (p),
      curveDisplay (p)
{
    setSize (Layout::editorW, Layout::editorH);

    // ── Curve display ─────────────────────────────────────────────────────────
    addAndMakeVisible (curveDisplay);

    // ── Buttons ───────────────────────────────────────────────────────────────
    addAndMakeVisible (playButton);
    playButton.onClick = [this]
    {
        const bool nowPlaying = !proc.isPlaying();
        proc.setPlaying (nowPlaying);
        playButton.setButtonText (nowPlaying ? "Stop" : "Play");
        curveDisplay.repaint();
    };

    addAndMakeVisible (clearButton);
    clearButton.onClick = [this]
    {
        proc.setPlaying (false);
        proc.clearSnapshot();
        playButton.setButtonText ("Play");
        curveDisplay.repaint();
    };

    // ── Sliders ───────────────────────────────────────────────────────────────
    setupSlider (ccSlider,        ccLabel,        "CC#");
    setupSlider (channelSlider,   channelLabel,   "Channel");
    setupSlider (smoothingSlider, smoothingLabel, "Smooth");
    setupSlider (minOutSlider,    minOutLabel,    "Min Out");
    setupSlider (maxOutSlider,    maxOutLabel,    "Max Out");

    // ── APVTS attachments ─────────────────────────────────────────────────────
    auto& apvts = proc.apvts;
    ccAttach        = std::make_unique<Attach> (apvts, "ccNumber",    ccSlider);
    channelAttach   = std::make_unique<Attach> (apvts, "midiChannel", channelSlider);
    smoothingAttach = std::make_unique<Attach> (apvts, "smoothing",   smoothingSlider);
    minAttach       = std::make_unique<Attach> (apvts, "minOutput",   minOutSlider);
    maxAttach       = std::make_unique<Attach> (apvts, "maxOutput",   maxOutSlider);

    // ── Message type combo ────────────────────────────────────────────────────
    msgTypeLabel.setText ("Msg Type:", juce::dontSendNotification);
    msgTypeLabel.setFont (juce::Font (12.0f));
    msgTypeLabel.setColour (juce::Label::textColourId, juce::Colours::lightgrey);
    msgTypeLabel.setJustificationType (juce::Justification::centredRight);
    addAndMakeVisible (msgTypeLabel);

    msgTypeCombo.addItem ("CC",               1);
    msgTypeCombo.addItem ("Channel Pressure", 2);
    msgTypeCombo.addItem ("Pitch Bend",       3);
    addAndMakeVisible (msgTypeCombo);

    // Attachment sets the initial selection from the saved parameter value.
    msgTypeAttach = std::make_unique<ComboAttach> (apvts, "messageType", msgTypeCombo);

    msgTypeCombo.onChange = [this] { updateCCVisibility(); };
    updateCCVisibility();   // apply initial enabled state
}

DrawnCurveEditor::~DrawnCurveEditor() {}

void DrawnCurveEditor::setupSlider (juce::Slider&       s,
                                     juce::Label&         l,
                                     const juce::String&  labelText,
                                     juce::Slider::SliderStyle style)
{
    s.setSliderStyle (style);
    s.setTextBoxStyle (juce::Slider::TextBoxRight, false, 48, 20);
    addAndMakeVisible (s);

    l.setText (labelText, juce::dontSendNotification);
    l.setFont (juce::Font (12.0f));
    l.setColour (juce::Label::textColourId, juce::Colours::lightgrey);
    addAndMakeVisible (l);
}

void DrawnCurveEditor::updateCCVisibility()
{
    // CC# slider is only meaningful for CC messages; dim it for other types.
    const bool isCC = (msgTypeCombo.getSelectedItemIndex() == 0);
    ccSlider.setEnabled (isCC);
    ccLabel .setEnabled (isCC);
    ccSlider.setAlpha   (isCC ? 1.0f : 0.4f);
    ccLabel .setAlpha   (isCC ? 1.0f : 0.4f);
}

//==============================================================================
void DrawnCurveEditor::paint (juce::Graphics& g)
{
    g.fillAll (Colours::panelBg);
}

void DrawnCurveEditor::resized()
{
    using namespace Layout;
    auto area = getLocalBounds().reduced (pad);

    // ── Curve display ─────────────────────────────────────────────────────────
    curveDisplay.setBounds (area.removeFromTop (curveH));
    area.removeFromTop (pad);

    // ── Button row (Play · Clear ················ Msg Type: [combo]) ──────────
    {
        auto row = area.removeFromTop (buttonRowH);
        playButton .setBounds (row.removeFromLeft (160));
        row.removeFromLeft (pad);
        clearButton.setBounds (row.removeFromLeft (120));

        // Message-type combo sits on the right of the same row.
        row.removeFromLeft (pad * 4);
        auto labelSlot = row.removeFromLeft (80);
        row.removeFromLeft (pad);
        auto comboSlot = row.removeFromLeft (juce::jmin (180, row.getWidth()));
        msgTypeLabel.setBounds (labelSlot.withSizeKeepingCentre (80, 20));
        msgTypeCombo.setBounds (comboSlot.withSizeKeepingCentre (comboSlot.getWidth(), 28));
    }
    area.removeFromTop (pad);

    // ── Param row 1: CC#, Channel, Smooth ─────────────────────────────────────
    {
        auto row = area.removeFromTop (paramRowH);
        const int slotW = (area.getWidth() + pad * 2) / 3;  // three equal slots

        auto placeParam = [&] (juce::Label& lbl, juce::Slider& sl)
        {
            auto slot = row.removeFromLeft (slotW - pad);
            row.removeFromLeft (pad);
            lbl.setBounds (slot.removeFromTop (paramLabelH));
            sl .setBounds (slot);
        };

        placeParam (ccLabel,      ccSlider);
        placeParam (channelLabel, channelSlider);
        // Remaining width goes to smoothing
        smoothingLabel.setBounds (row.removeFromTop (paramLabelH));
        smoothingSlider.setBounds (row);
    }
    area.removeFromTop (pad);

    // ── Param row 2: Min Out, Max Out ─────────────────────────────────────────
    {
        auto row  = area.removeFromTop (paramRowH);
        int  half = (area.getWidth() + pad) / 2;

        auto minSlot = row.removeFromLeft (half - pad);
        row.removeFromLeft (pad);

        minOutLabel .setBounds (minSlot.removeFromTop (paramLabelH));
        minOutSlider.setBounds (minSlot);

        maxOutLabel .setBounds (row.removeFromTop (paramLabelH));
        maxOutSlider.setBounds (row);
    }
}
