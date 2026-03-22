# DrawnCurveJUCE UI Implementation Handoff

## 1. Purpose

This document is a developer-facing implementation handoff for the current DrawnCurveJUCE UI direction.

The target reader is a JUCE developer implementing the editor and its interaction model, not a design reviewer. The goal is to remove ambiguity about layout, state, behavior, component boundaries, and visual tokens before implementation begins.

This document reflects the current design direction represented by the latest mockups, especially the routing-matrix approach and the higher-fidelity light/dark explorations.

---

## 2. Product Summary

DrawnCurveJUCE is a MIDI effect plugin centered on one or more drawn curves in a shared canvas.

Core interaction model:

- The user draws curves in a central performance/editing area.
- The editor supports multiple **lanes** in the same canvas.
- Each lane can be routed independently to a different MIDI target.
- Playback has two related but distinct concerns:
  - **direction mode**: reverse / ping-pong / forward
  - **transport state**: playing / paused
- Timing can operate in two modes:
  - **free rate**, displayed as a multiplier such as `3.75×`
  - **host sync**, displayed as beat length such as `8 beats`
- The Y axis can represent either:
  - numeric value ranges
  - note names depending on the currently relevant lane/target context.
- A routing matrix is the primary control surface for lane-to-target assignment.
- When a lane targets Notes, a note/scale editor is available for that selected lane.

The UI should read as a performance-oriented instrument/editor, not as a generic utility panel.

---

## 3. Current Design Direction

The current preferred direction is based on these decisions:

- Use a **routing matrix** instead of a single global target control.
- Support a future **multi-lane** model where several curves coexist in the same drawing area.
- Keep **lane focus** close to lane-specific controls such as shaping and routing.
- Merge **playback direction** and **transport state** into a single playback control.
- Prefer the **overlay badge** approach for transport state:
  - the segment itself communicates direction
  - an overlay badge communicates play/pause
- Keep the canvas as the primary visual anchor.
- Treat the right side as the area for **lane-specific shaping + routing**.

---

## 4. Implementation Scope

### MVP assumptions

The first implementation does **not** need to ship all future-facing ideas.

The UI may contain placeholders for future features if they degrade gracefully.

### Required now

- Multi-lane canvas rendering and editing scaffold
- Routing matrix UI
- Per-lane target selection
- Per-lane target detail and channel
- Play/pause + direction control
- Sync toggle
- Free/sync timing display
- X/Y grid density controls
- Per-lane shaping controls
- Notes editor for note-target lanes
- Theme support

### Future-facing / optional in first implementation

- Teach/learn behavior beyond a basic CC learn workflow
- MIDI-CI label retrieval / property display
- Rich host/DAW parameter discovery
- Full adaptive axis relabeling for mixed-lane edge cases

Where future-facing features are not implemented, fallback UI behavior must be defined.

---

## 5. Editor Layout

### High-level regions

The editor is divided into four major areas:

1. **Top bar**
2. **Main canvas region**
3. **Right-side lane control region**
4. **Bottom note editor region**

### 5.1 Top bar

Contains:

- Playback control
- Sync toggle
- Rate/Length control
- Session or project display
- Theme toggle
- Help button
- MIDI-CI / capability status badge

Behavior:

- Fixed-height horizontal bar
- Does not contain lane focus
- Does not contain routing rows

### 5.2 Main canvas region

Contains:

- Shared multi-lane curve canvas
- Playhead
- Lane overlays
- Lane legend
- Y-axis density control on left
- X-axis density control below canvas
- Clear action
- Y-axis labels

Behavior:

- Largest region in the UI
- Resizes preferentially compared with side regions
- Curves are always visible here

### 5.3 Right-side lane control region

Contains:

- Shaping panel
  - Lane focus selector
  - Smooth
  - Range
- Routing matrix
- Selected mapping detail section

Behavior:

- Fixed or bounded width relative to canvas
- Lane focus determines which lane shaping controls currently address
- Matrix selection should generally synchronize with lane focus unless explicitly decoupled later

### 5.4 Bottom note editor region

Contains:

- Scale preset display/select affordance
- Pitch-class buttons
- Root indicator
- Scale actions

Behavior:

- Contextual to selected routing row or selected lane
- Most relevant when the selected lane targets Notes
- Can be collapsed/hidden when the selected lane is not in Notes mode, depending on implementation choice

---

## 6. Component Inventory

## 6.1 Top bar controls

### PlaybackControl

Type: custom segmented control with overlay badge

States:

- Direction:
  - Reverse
  - Ping-Pong
  - Forward
- Transport:
  - Playing
  - Paused

Preferred visual model:

- Base segment icon communicates direction
- Small overlay badge communicates play/pause on the active segment

### SyncToggle

Type: button/toggle

States:

- Off
- On

### RateLengthControl

Type: slider + formatted text

Display modes:

- Free mode: multiplier, e.g. `3.75×`
- Sync mode: beats, e.g. `8 beats`

### SessionDisplay

Type: passive label or badge

### ThemeToggle

Type: toggle/button

States:

- Light
- Dark

### HelpButton

Type: button

### MidiCiStatusBadge

Type: passive indicator / badge

States:

- Hidden or disabled if unsupported
- Visible if available or enabled

---

## 6.2 Main canvas controls

### CurveCanvasComponent

Type: custom-painted interactive component

Responsibilities:

- draw all lanes
- draw playhead
- display grid
- display axis labels
- capture/edit drawn curves
- reflect lane selection/focus

### YDensityControl

Type: vertical stepper-style control

### XDensityControl

Type: horizontal stepper-style control

### ClearButton

Type: button/action

### LaneLegend

Type: passive legend / lane indicator

### AxisLabelRenderer

Type: custom-drawn text labels

---

## 6.3 Right-side controls

### LaneFocusSelector

Type: segmented control

States:

- Lane 1
- Lane 2
- Lane 3
- potentially more later

### SmoothControl

Type: slider

### RangeControl

Type: dual-handle slider

### RoutingMatrixComponent

Type: custom table-like control or composed custom component

Each row contains:

- lane id
- target type
- target detail
- channel
- teach/learn or edit affordance
- enabled state

### MappingDetailPanel

Type: passive/interactive detail display

Displays:

- human-readable parameter name
- raw mapping fallback, such as `CC 74 • Channel 1`
- MIDI-CI/metadata label if available

---

## 6.4 Notes editor controls

### ScalePresetDisplay

Type: label/button or popover trigger

### PitchClassSelector

Type: custom note-button group

Contains 12 pitch classes:

- C
- C#
- D
- D#
- E
- F
- F#
- G
- G#
- A
- A#
- B

### RootIndicator

Type: visual treatment layered onto pitch class button

Current design intent:

- root ring
- root dot/marker

### ScaleActionButtons

Type: buttons

Actions:

- All
- None
- Invert
- Root

---

## 7. State Model

The implementation should separate:

- host-exposed/plugin state
- editor-only UI state
- temporary interaction state

## 7.1 Host-exposed or persistent plugin state

Suggested persistent state fields:

### Playback

- `playbackDirection`
- `isPlaying`
- `syncEnabled`
- `freeRate`
- `beatLength`

### Grid

- `gridDensityX`
- `gridDensityY`

### Per lane

For each lane `i`:

- `laneEnabled`
- `curveData`
- `targetType`
- `targetDetail`
- `channel`
- `shapingSmooth`
- `rangeMin`
- `rangeMax`
- `noteVelocity`
- `noteRoot`
- `noteMask` or equivalent pitch-class activation structure
- `scalePresetId` or custom/manual flag

### Optional metadata / future-facing

- `mappingLabel`
- `midiCiDisplayName`

## 7.2 Editor-only state

Suggested editor-only state:

- selected routing row
- focused lane
- hovered control id
- help overlay visible
- theme
- teach/learn pending row
- temporary note-editor visibility state
- temporary popup/editor state

## 7.3 Temporary interaction state

Suggested transient state:

- currently drawing lane id
- active pointer/touch capture
- playhead animation cache
- hover states
- drag state for sliders or range handles
- temporary teach-mode listening state

---

## 8. Binding Rules

A JUCE implementation should define clear rules for how selection propagates.

### Recommended default behavior

- Selecting a routing matrix row sets the **selected row**.
- Selecting a routing matrix row also sets the **focused lane**.
- The Shaping panel always applies to the **focused lane**.
- The Notes editor shows data for the **focused lane** when that lane targets Notes.

This avoids multiple simultaneous selection models unless a later phase requires them.

---

## 9. Playback Control Behavior

This is a critical ambiguity point and must be implemented intentionally.

### Recommended interaction model

The playback control combines:

- direction selection
- play/pause state

### Semantics

Each segment means:

- Reverse direction
- Ping-Pong direction
- Forward direction

The overlay badge on the active segment means:

- play badge = currently playing in that direction
- pause badge = currently paused in that direction

### Recommended click behavior

#### When paused

- click Reverse → set direction Reverse and start playback
- click Ping-Pong → set direction Ping-Pong and start playback
- click Forward → set direction Forward and start playback

#### When playing

- click a different direction → switch direction immediately and continue playing
- click the active direction → pause playback while keeping the same direction selected

#### When paused on a given direction

- click the same active direction again → resume playback in that direction

This yields a clear mental model and avoids an additional dedicated play/pause button.

---

## 10. Sync and Rate/Length Behavior

### SyncToggle

When `syncEnabled = false`:

- rate/length control expresses free rate
- display format: multiplier, e.g. `3.75×`

When `syncEnabled = true`:

- rate/length control expresses host-synced duration
- display format: beat count, e.g. `8 beats`

### Implementation note

The same control may be reused visually, but formatter logic must be mode-dependent.

The coder should not expose both values simultaneously unless explicitly desired.

---

## 11. Axis Label Rules

The vertical axis can represent different semantics.

### Required behavior

The UI must support two main label modes:

- numeric values
- note names

### Recommended current rule

Axis labels should follow the **focused lane**.

Reason:

- the user needs one coherent reading for the current editing context
- mixed-lane semantics are otherwise visually noisy

### Example

If focused lane targets:

- CC / pressure / pitch bend → numeric labels
- Notes → note labels or combined note/value labels depending on implementation choice

### Current mockup direction

A combined display like `127 / C6` is acceptable as a transitional or dual-context display.

### Future option

A later version may allow:

- purely numeric axis
- purely note-name axis
- mixed display toggle

---

## 12. Routing Matrix Behavior

The routing matrix is the core of the multi-lane model.

## 12.1 Row structure

Each row maps one lane to one destination.

Recommended columns:

- Lane
- Target
- Detail
- Channel
- Teach/Edit
- State

## 12.2 Target types

Current target types:

- CC
- Pitch Bend
- Notes
- optionally Pressure/Aftertouch if reintroduced in the current matrix version

## 12.3 Detail semantics

Detail is target-dependent.

Examples:

- CC → CC number
- Notes → velocity
- Pitch Bend → none or em dash
- Pressure → none or em dash

This must be explicit in code and formatting.

## 12.4 Row selection behavior

Clicking a row should:

- select the row
- focus the corresponding lane
- update shaping controls to that lane
- update mapping detail panel to that row
- reveal note editor if the row targets Notes

## 12.5 Teach/Learn behavior

### MVP

Teach/Learn can be implemented initially as a basic mapping-learn workflow.

At minimum, define:

- entering learn mode for a row
- exiting learn mode
- what happens when a MIDI message is received
- which target types support learn now

### Suggested MVP rule

For CC targets:

- Teach can listen for a CC and populate `targetDetail`

For other targets:

- Teach may be disabled, hidden, or replaced with a different action such as `Edit`

### Future-facing

A later version may use Teach to:

- bind a DAW/plugin parameter
- populate user-readable display names
- integrate MIDI-CI metadata

---

## 13. Mapping Detail Panel Behavior

This panel should display richer identity than the matrix row itself.

### Current intent

Show:

- human-readable parameter name
- raw fallback target representation
- MIDI-CI or metadata-derived label when available

### Fallback hierarchy

Recommended priority:

1. explicit user label
2. discovered DAW/plugin parameter label
3. MIDI-CI metadata label
4. raw fallback string such as `CC 74 • Channel 1`

If no rich label is available, the panel must still remain meaningful.

---

## 14. Shaping Panel Behavior

The shaping panel applies to the focused lane.

### SmoothControl

Adjusts smoothing of the selected lane output.

### RangeControl

Adjusts lane output min/max.

### LaneFocusSelector

Controls which lane is being edited in shaping and, by default, in related contextual controls.

### Recommended sync behavior

By default:

- selecting a lane in the matrix updates lane focus
- selecting lane focus updates which lane is edited in shaping

A future version may separate these, but not in MVP.

---

## 15. Notes Editor Behavior

The Notes editor is lane-specific.

## 15.1 Visibility

Recommended behavior:

- visible when selected/focused lane targets Notes
- hidden or collapsed otherwise

## 15.2 Pitch-class toggling

All pitch-class buttons should use the same toggle logic.

### Recommended rule

- click inactive pitch class → activate it
- click active pitch class → deactivate it
- root can be a separate state overlay

## 15.3 Root behavior

Root must be indicated independently from note activation.

### Recommended rule

- root is always one of the 12 pitch classes
- root can be assigned even if pitch classes are otherwise manually edited
- root button or alternate gesture selects root

### Design implication

Root indication should not require special sizing or layout differences.

## 15.4 Preset behavior

Selecting a preset may:

- update note mask
- update root
- update preset label

After manual edits, the preset may be considered:

- still linked
- or changed to custom

This should be specified in the implementation.

## 15.5 Scale action buttons

Recommended semantics:

- `All` → enable all pitch classes
- `None` → disable all non-root pitch classes, or disable all, depending on product decision
- `Invert` → invert active pitch classes
- `Root` → enter root-select mode or set selected note as root

This needs final product clarification if not already decided.

---

## 16. Curve Canvas Behavior

The canvas is not just a display; it is an editing surface.

The coder needs explicit rules for:

- whether drawing edits only the focused lane
- whether lanes can be individually selected directly from the canvas
- whether inactive lanes are dimmed
- whether selected lane gets stronger stroke or glow
- whether touch and mouse gestures are identical
- whether snapping/quantization exists now or later

### Recommended current implementation

- draw/edit only the focused lane
- show other lanes as secondary overlays
- selected lane gets highest visual contrast
- inactive lanes remain visible but secondary

---

## 17. Component Architecture in JUCE Terms

Suggested component breakdown:

### `PluginEditor`

Owns layout and top-level editor state.

Contains:

- `TopBarComponent`
- `CurveCanvasComponent`
- `YDensityControl`
- `XDensityControl`
- `ClearButton`
- `ShapingPanelComponent`
- `RoutingMatrixComponent`
- `MappingDetailComponent`
- `NoteEditorComponent`
- `HelpOverlayComponent`

### `TopBarComponent`

Contains:

- `PlaybackControl`
- `SyncToggle`
- `RateLengthControl`
- `SessionDisplay`
- `ThemeToggle`
- `HelpButton`
- `MidiCiStatusBadge`

### `ShapingPanelComponent`

Contains:

- `LaneFocusSelector`
- `SmoothControl`
- `RangeControl`

### `RoutingMatrixComponent`

Could be:

- fully custom painted
- or composed from row subcomponents

A custom approach is likely cleaner visually.

### `NoteEditorComponent`

Likely custom-drawn or a tightly controlled custom button grid.

### `CurveCanvasComponent`

Definitely custom-drawn.

---

## 18. Rendering Notes

### Custom-painted areas

The following should be considered custom-drawn rather than assembled from stock JUCE widgets:

- Playback control
- Curve canvas
- Axis labels
- Playhead
- Lane overlays/legend
- Routing matrix body
- Notes editor pitch-class grid

### Standard-styled areas

The following may still use standard JUCE controls with custom LookAndFeel if desired:

- Sync button
- Theme toggle
- Help button
- sliders and dual-value range controls
- simple action buttons

### Visual emphasis rules

- focused lane should be visually strongest
- inactive lanes should remain legible but secondary
- active matrix row should be visually distinct
- playhead should always remain visible above lane curves

---

## 19. Visual Tokens

The coder should implement design tokens rather than hardcoding colours.

## 19.1 Typography

Suggested token groups:

- `font.section`
- `font.body`
- `font.small`
- `font.tiny`
- `font.label`

Suggested current hierarchy:

- Section headers: bold, \~18 px
- Primary title: bold, \~30 px
- Small labels: 12 px
- Tiny captions: 11 px

## 19.2 Radius

Suggested token groups:

- outer panel radius
- inner panel radius
- button radius
- pill radius
- canvas radius

## 19.3 Spacing

Suggested token groups:

- outer margin
- section padding
- control gap
- row gap
- micro gap

## 19.4 Colour tokens

The implementation should define all colours as theme tokens.

### Shared semantic tokens

- background
- panel background
- panel border
- subpanel background
- canvas background
- grid line
- primary text
- secondary text
- tertiary text
- active stroke
- inactive stroke
- control background
- control selected background
- track background
- thumb background

### Section accent tokens

Current light-theme direction:

- transport accent = violet
- curves accent = sky blue
- shaping accent = amber
- routing accent = green
- notes accent = pink

### Lane colours

Current lane colours:

- lane 1 = dark neutral
- lane 2 = violet
- lane 3 = teal/green

These should be tokenized independently from section accents.

---

## 20. Theme Support

### Requirement

Theme must be runtime-switchable.

### Minimum themes

- Light
- Dark

### Implementation guidance

- use token sets, not branching paint code full of literal colours
- icon strokes/fills should derive from semantic tokens
- selection/focus treatment should remain legible in both themes

---

## 21. Platform Notes

The UI must work across JUCE-supported plugin contexts, including touch-oriented environments if applicable.

### Important considerations

- minimum touch target sizes
- no reliance on hover-only affordances for critical functions
- avoid menu patterns that fail in AUv3/iOS contexts if that still applies
- ensure labels degrade gracefully when width is constrained

### Open question to resolve before implementation

- fixed-size UI vs resizable UI

If resizable, define:

- minimum editor size
- whether right-side panel width is fixed or proportional
- when note editor wraps/collapses

---

## 22. Open Decisions Requiring Final Confirmation

These are the remaining points most likely to cause implementation drift if not decided.

1. **Exact playback control interaction**
   - active-segment click pauses/resumes? currently recommended yes
2. **Does lane focus always follow selected matrix row?**
   - currently recommended yes
3. **Exact teach/learn MVP behavior**
   - CC-only first? or broader?
4. **Axis label mode when multiple lanes have different semantics**
   - currently recommended: follow focused lane
5. **Notes editor visibility**
   - collapse when not in note-target mode? currently recommended yes
6. **Preset/custom behavior in note editor**
   - how to represent edited presets
7. **Resizable vs fixed editor**
8. **MIDI-CI in MVP vs placeholder only**

---

## 23. Recommended Implementation Order

1. Define state model and APVTS layout
2. Build static layout containers
3. Implement playback control behavior
4. Implement curve canvas rendering and interaction
5. Implement routing matrix selection and row data model
6. Implement lane focus + shaping binding
7. Implement notes editor
8. Implement theme tokens
9. Implement teach/learn workflow
10. Add MIDI-CI/metadata display hooks

---

## 24. Deliverables Expected Alongside This Document

The coder should receive:

- latest SVG mockups
- icon exports or vector references
- this markdown handoff
- parameter schema if available
- any existing repo constraints, especially AUv3/platform constraints

---

## 25. Recommended Default Interpretation Summary

If no additional clarification is given, the coder should proceed with these defaults:

- routing matrix is the primary routing model
- selected matrix row sets focused lane
- shaping applies to focused lane
- notes editor is lane-specific and visible for note-target lanes
- playback control uses stable direction icons with an overlaid play/pause badge
- rate/length formatting depends on sync state
- axis labels follow focused lane semantics
- teach/learn is minimally implemented for MVP with clear fallback behavior

---

## 26. Appendix: Suggested Data Shapes

These are illustrative, not prescriptive.

### Lane state

```cpp
struct LaneState
{
    bool enabled = true;
    CurveData curve;

    TargetType targetType;
    int targetDetail = 0;     // CC number, velocity, etc.
    int midiChannel = 1;
    bool targetEnabled = true;

    float smooth = 0.0f;
    float rangeMin = 0.0f;
    float rangeMax = 1.0f;

    int rootPitchClass = 0;
    std::bitset<12> activePitchClasses;
    String scalePresetId;

    String mappingLabel;
    String midiCiDisplayName;
};
```

### Editor state

```cpp
struct EditorUiState
{
    int selectedLane = 0;
    int selectedMatrixRow = 0;
    bool helpVisible = false;
    bool themeIsLight = true;

    std::optional<int> teachModeRow;
};
```

### Playback state

```cpp
struct PlaybackState
{
    PlaybackDirection direction = PlaybackDirection::forward;
    bool isPlaying = false;
    bool syncEnabled = false;
    float freeRate = 1.0f;
    int beatLength = 4;
};
```

These structures can be adapted to APVTS-backed parameters and editor-only state as needed.

