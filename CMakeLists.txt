cmake_minimum_required(VERSION 3.22)
project(DrawnCurve VERSION 1.0.0)
# User-facing name is "DrawnQurve" — the cmake target remains "DrawnCurve"
# to avoid breaking all target_* references.  PRODUCT_NAME and BUNDLE_ID
# control the name visible to users and the App Store.

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED YES)

# ── JUCE ─────────────────────────────────────────────────────────────────────
# Point JUCE_PATH at your local JUCE copy, OR symlink it here:
#   ln -s /path/to/JUCE /Users/alex/Documents/ClaudeCode/DrawnQurve/JUCE
#
# To configure for iOS from the command line:
#   cmake -B build-ios -G Xcode \
#     -DCMAKE_SYSTEM_NAME=iOS \
#     -DCMAKE_OSX_DEPLOYMENT_TARGET=16.0 \
#     -DJUCE_PATH=/path/to/JUCE
#   cmake --open build-ios
#   (then set signing in Xcode → DrawnCurve_Standalone target)
# ─────────────────────────────────────────────────────────────────────────────

find_package(JUCE CONFIG QUIET)
if(NOT JUCE_FOUND)
    set(JUCE_PATH "${CMAKE_SOURCE_DIR}/JUCE" CACHE PATH "Path to JUCE directory")
    # Probe a JUCE_PATH environment variable (one local JUCE for every repo —
    # export it once; on Linux there is no standard location) and the macOS
    # install, before falling back to fetching a private copy.
    if(NOT EXISTS "${JUCE_PATH}/CMakeLists.txt" AND EXISTS "$ENV{JUCE_PATH}/CMakeLists.txt")
        set(JUCE_PATH "$ENV{JUCE_PATH}")
    endif()
    if(NOT EXISTS "${JUCE_PATH}/CMakeLists.txt" AND EXISTS "/Applications/JUCE/CMakeLists.txt")
        set(JUCE_PATH "/Applications/JUCE")
    endif()
    if(EXISTS "${JUCE_PATH}/CMakeLists.txt")
        add_subdirectory("${JUCE_PATH}" JUCE)   # local path/symlink (dev machines)
    else()
        # No local JUCE (e.g. CI) — fetch it, matching the enkerli-juce archetype.
        message(STATUS "JUCE not found locally — fetching juce-framework/JUCE 8.0.13")
        include(FetchContent)
        FetchContent_Declare(JUCE
            GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
            GIT_TAG        8.0.13
            GIT_SHALLOW    TRUE)
        FetchContent_MakeAvailable(JUCE)
    endif()
endif()

# ── Detect platform ──────────────────────────────────────────────────────────
set(IS_IOS FALSE)
set(IS_MACOS FALSE)

if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    set(IS_IOS TRUE)
    message(STATUS "Configuring for iOS")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin" OR APPLE AND NOT IOS)
    set(IS_MACOS TRUE)
    message(STATUS "Configuring for macOS")
endif()

# ── Platform-specific deployment targets ──────────────────────────────────────
if(IS_IOS)
    set(CMAKE_OSX_DEPLOYMENT_TARGET "16.0" CACHE STRING "Minimum iOS deployment version")
elseif(IS_MACOS)
    set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS deployment version")
endif()

# ── Plugin target ─────────────────────────────────────────────────────────────
#
# IS_MIDI_EFFECT TRUE  →  kAudioUnitType_MIDIProcessor ('aumi')
# No audio buses.  MIDI output only via midiOutputEventBlock.
# ─────────────────────────────────────────────────────────────────────────────

# Build base plugin properties (common to all platforms)
# ── Installing built plugins ──────────────────────────────────────────────────
# Mirrors enkerli-juce/cmake/EnkerliPlugin.cmake, which DrawnQurve reimplements
# by hand (see the CLAP note below). This was hardcoded FALSE, so no build here
# ever reached ~/Library/Audio/Plug-Ins — suite-build appeared to succeed while
# the installed DrawnQurve stayed three weeks behind its source (found by a
# sanity check, 2026-07-29). ON by default like the rest of the suite;
# suite-build --no-install turns it off for branch/experiment builds.
option(ENKERLI_INSTALL_PLUGINS "Copy built plugins into the user plug-in folders" ON)

set(PLUGIN_BASE_PROPS
    COMPANY_NAME                "Enkerli"
    COMPANY_WEBSITE             "https://enkerli.com"
    BUNDLE_ID                   "com.enkerli.DrawnQurve"
    PLUGIN_MANUFACTURER_CODE    Enke
    PLUGIN_CODE                 Dqau
    PRODUCT_NAME                "DrawnQurve"
    ICON_BIG                    "${CMAKE_SOURCE_DIR}/Assets/icon_1024.png"
    DESCRIPTION                 "Drawn-qurve MIDI looper"
    IS_SYNTH                    FALSE
    NEEDS_MIDI_INPUT            TRUE
    NEEDS_MIDI_OUTPUT           TRUE
    IS_MIDI_EFFECT              TRUE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD     ${ENKERLI_INSTALL_PLUGINS}
)

# Add platform-specific properties
if(IS_IOS)
    juce_add_plugin(DrawnCurve
        ${PLUGIN_BASE_PROPS}
        FORMATS                     AUv3 Standalone
        MICROPHONE_PERMISSION_ENABLED FALSE
        # JUCE generates UISupportedInterfaceOrientations from these properties;
        # using IPHONE_SCREEN_ORIENTATIONS / IPAD_SCREEN_ORIENTATIONS here takes
        # precedence over the JUCE default (Portrait + Landscape only) and ensures
        # PortraitUpsideDown is included.  PLIST_TO_MERGE for the same key was
        # silently ignored because JUCE writes the key after the merge step.
        IPHONE_SCREEN_ORIENTATIONS
            UIInterfaceOrientationPortrait
            UIInterfaceOrientationPortraitUpsideDown
            UIInterfaceOrientationLandscapeLeft
            UIInterfaceOrientationLandscapeRight
        IPAD_SCREEN_ORIENTATIONS
            UIInterfaceOrientationPortrait
            UIInterfaceOrientationPortraitUpsideDown
            UIInterfaceOrientationLandscapeLeft
            UIInterfaceOrientationLandscapeRight
        BACKGROUND_AUDIO_ENABLED TRUE
        PLIST_TO_MERGE "${CMAKE_SOURCE_DIR}/Assets/Info-Standalone.plist"
    )
elseif(IS_MACOS)
    juce_add_plugin(DrawnCurve
        ${PLUGIN_BASE_PROPS}
        FORMATS                     AU AUv3 VST3 Standalone
        # macOS does not use BACKGROUND_AUDIO_ENABLED or orientation properties
    )
else()
    # Fallback for other platforms (Windows, Linux, etc.)
    juce_add_plugin(DrawnCurve
        ${PLUGIN_BASE_PROPS}
        FORMATS                     VST3 LV2 Standalone
        NEEDS_WEB_BROWSER           TRUE
        NEEDS_CURL                  FALSE
    )
endif()

# ── CLAP (macOS / Linux / Windows — not an iOS format) ────────────────────────
# DrawnQurve is off the shared enkerli-juce archetype (inline CMake), so this
# mirrors enkerli_resolve_clap()/clap_juce_extensions_plugin() from
# enkerli-juce/cmake/EnkerliPlugin.cmake by hand rather than calling it.
if(NOT IS_IOS)
    set(CLAP_JUCE_PATH "${CMAKE_SOURCE_DIR}/clap-juce-extensions" CACHE PATH "Path to clap-juce-extensions")
    # One shared clap-juce-extensions for every repo: probe $CLAP_JUCE_PATH
    # before FetchContent, exactly as JUCE_PATH is probed above. It pulls the
    # CLAP SDK as submodules, so a private copy per repo is the slowest
    # dependency in the tree (2026-07-27).
    if(NOT EXISTS "${CLAP_JUCE_PATH}/CMakeLists.txt" AND EXISTS "$ENV{CLAP_JUCE_PATH}/CMakeLists.txt")
        set(CLAP_JUCE_PATH "$ENV{CLAP_JUCE_PATH}")
    endif()
    if(EXISTS "${CLAP_JUCE_PATH}/CMakeLists.txt")
        add_subdirectory("${CLAP_JUCE_PATH}" "${CMAKE_BINARY_DIR}/clap-juce-extensions")
    else()
        include(FetchContent)
        FetchContent_Declare(clap-juce-extensions
            GIT_REPOSITORY https://github.com/free-audio/clap-juce-extensions.git
            GIT_TAG main)   # not GIT_SHALLOW: it carries the CLAP SDK as submodules
        FetchContent_MakeAvailable(clap-juce-extensions)
    endif()
    clap_juce_extensions_plugin(TARGET DrawnCurve
        CLAP_ID       "com.enkerli.DrawnQurve"
        CLAP_FEATURES "note-effect")
endif()

# Windows: the WebView needs the Edge/WebView2 backend + its SDK headers, which
# JUCE doesn't vendor. Enable the backend and fetch the NuGet (a zip).
if(WIN32)
    target_compile_definitions(DrawnCurve PUBLIC JUCE_USE_WIN_WEBVIEW2=1)
    include(FetchContent)
    FetchContent_Declare(webview2
        URL https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2792.45
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
    FetchContent_MakeAvailable(webview2)
    include_directories("${webview2_SOURCE_DIR}/build/native/include")
endif()

# Ensure all source files are interpreted as UTF-8 (for Unicode symbols)
add_compile_options($<$<CXX_COMPILER_ID:GNU,Clang>:-finput-charset=UTF-8>)

# For MSVC, ensure /source-charset:utf-8 is used (uncomment if needed):
# add_compile_options($<$<CXX_COMPILER_ID:MSVC>:/source-charset:utf-8>)

# ── Bundled fonts (v2 Studio typography) ──────────────────────────────────────
#
# JUCE compiles each .ttf into a C++ static array via juce_add_binary_data.
# Generated symbols: '.' is replaced with '_' but '-' is *stripped* outright.
# So the filenames below resolve to:
#   BinaryData::Domine_ttf           BinaryData::Domine_ttfSize
#   BinaryData::InterTight_ttf       BinaryData::InterTight_ttfSize
#   BinaryData::InterTightItalic_ttf BinaryData::InterTightItalic_ttfSize  (no underscore!)
#   BinaryData::Caveat_ttf           BinaryData::Caveat_ttfSize
#
# All four are variable fonts (wght axis). Domine has no italic master; the
# editor synthesises italic via juce::Font::italic where needed (matches the
# webapp, which also lacks a true Domine italic).
#
# Sandboxed access — safe inside the AUv3 XPC extension on iOS.
# ─────────────────────────────────────────────────────────────────────────────
juce_add_binary_data(DrawnCurveFonts SOURCES
    Assets/Fonts/Domine.ttf
    Assets/Fonts/InterTight.ttf
    Assets/Fonts/InterTight-Italic.ttf
    Assets/Fonts/Caveat.ttf
)
target_link_libraries(DrawnCurve PRIVATE DrawnCurveFonts)

# ── WebUI bundle (esbuild → BinaryData) ──────────────────────────────────────
# The WebUI *source* lives in the music-suite monorepo (apps/drawnqurve) — single
# source shared with the standalone webapp; only the C++ editor (WebCurveEditor.*)
# stays here. Default to the maintainer's sibling checkout; override per machine
# in webui.local.cmake (gitignored). esbuild/react resolve from the monorepo's
# hoisted node_modules, so the monorepo must be checked out and `npm install`ed.
set(DRAWNQURVE_WEBUI_DIR "${CMAKE_SOURCE_DIR}/../music-suite/apps/drawnqurve"
    CACHE PATH "Path to the DrawnQurve WebUI source (music-suite/apps/drawnqurve)")
include("${CMAKE_CURRENT_SOURCE_DIR}/webui.local.cmake" OPTIONAL)
# The default above assumes music-suite is a SIBLING checkout. Before failing,
# probe the other supported layouts: this repo nested INSIDE the monorepo
# (…/music-suite/DrawnQurve), and a MUSIC_SUITE environment variable pointing at
# the monorepo checkout. webui.local.cmake still wins when present.
if(NOT EXISTS "${DRAWNQURVE_WEBUI_DIR}/main.jsx")
    foreach(_webui_cand "${CMAKE_SOURCE_DIR}/../apps/drawnqurve" "$ENV{MUSIC_SUITE}/apps/drawnqurve")
        if(EXISTS "${_webui_cand}/main.jsx")
            set(DRAWNQURVE_WEBUI_DIR "${_webui_cand}" CACHE PATH
                "Path to the DrawnQurve WebUI source (music-suite/apps/drawnqurve)" FORCE)
            message(STATUS "DrawnQurve WebUI: found at ${_webui_cand}")
            break()
        endif()
    endforeach()
endif()
set(WEBUI_DIR "${DRAWNQURVE_WEBUI_DIR}")
set(WEBUI_DIST "${CMAKE_CURRENT_BINARY_DIR}/webui")

if(NOT EXISTS "${WEBUI_DIR}/main.jsx")
    message(FATAL_ERROR
        "DrawnQurve WebUI source not found at ${WEBUI_DIR}. It now lives in the "
        "music-suite monorepo (apps/drawnqurve). Check out music-suite next to this "
        "repo, or set DRAWNQURVE_WEBUI_DIR in webui.local.cmake, or export MUSIC_SUITE=/path/to/music-suite. Layouts probed automatically: sibling checkout (../music-suite) and this repo nested inside the monorepo (../apps/drawnqurve).")
endif()

find_program(NPXCMD npx)
if(NPXCMD)
    # The monorepo packages this app imports are ALSO inputs: esbuild runs with
    # --conditions=source, so @enkerli/* resolves to packages/*/src rather than a
    # built dist. Listing only ${WEBUI_DIR} let Serpe ship a stale bundle on
    # 2026-07-29 — its UI rejected a string its own C++ engine parsed fine.
    # CONFIGURE_DEPENDS so a newly added package file counts too.
    get_filename_component(_suite_root "${WEBUI_DIR}/../.." ABSOLUTE)
    if(EXISTS "${_suite_root}/packages")
        file(GLOB_RECURSE WEBUI_PKG_SRC CONFIGURE_DEPENDS "${_suite_root}/packages/*/src/*.js")
    else()
        set(WEBUI_PKG_SRC "")
        message(WARNING "no packages/ at ${_suite_root} — this WebUI bundle will not rebuild when @enkerli/* sources change")
    endif()

    add_custom_command(
        OUTPUT  "${WEBUI_DIST}/bundle.js"
        # Build tag, written now so it reflects THIS bundle (see the script).
        COMMAND "${CMAKE_COMMAND}" -DOUT=${WEBUI_DIST}/build-tag.js
                    -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/write-build-tag.cmake"
        COMMAND "${NPXCMD}" esbuild "${WEBUI_DIR}/main.jsx"
                    --bundle
                    "--inject:${WEBUI_DIR}/react-globals.js"
                    "--inject:${WEBUI_DIST}/build-tag.js"
                    "--define:process.env.NODE_ENV=\"production\""
                    --minify
                    "--outfile=${WEBUI_DIST}/bundle.js"
        DEPENDS
            "${CMAKE_CURRENT_SOURCE_DIR}/cmake/write-build-tag.cmake" "${WEBUI_DIR}/main.jsx"
                "${WEBUI_DIR}/juce-bridge.js"
                "${WEBUI_DIR}/react-globals.js"
                "${WEBUI_DIR}/index.html"
                "${WEBUI_DIR}/design/tokens.jsx"
                "${WEBUI_DIR}/design/engine.jsx"
                "${WEBUI_DIR}/design/ui-primitives.jsx"
                "${WEBUI_DIR}/design/curve-canvas.jsx"
                "${WEBUI_DIR}/design/scale-editor.jsx"
                "${WEBUI_DIR}/design/juce-ipad.jsx"
                ${WEBUI_PKG_SRC}
        WORKING_DIRECTORY "${WEBUI_DIR}"
        COMMENT "Bundling WebUI with esbuild"
        VERBATIM
    )
    add_custom_target(DrawnCurveWebUIBundle DEPENDS "${WEBUI_DIST}/bundle.js")
endif()

set_source_files_properties("${WEBUI_DIST}/bundle.js" PROPERTIES GENERATED TRUE)
juce_add_binary_data(DrawnCurveWebUI
    HEADER_NAME BinaryDataWebUI.h
    NAMESPACE   BinaryData
    SOURCES
        "${WEBUI_DIR}/index.html"
        "${WEBUI_DIST}/bundle.js"
)
if(NPXCMD)
    add_dependencies(DrawnCurveWebUI DrawnCurveWebUIBundle)
endif()
target_link_libraries(DrawnCurve PRIVATE DrawnCurveWebUI)

# ── Sources ───────────────────────────────────────────────────────────────────
target_sources(DrawnCurve PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/WebUI/WebCurveEditor.cpp
    Source/Engine/GestureEngine.cpp
    Source/Engine/GestureCaptureSession.cpp
    Source/StandaloneApp.cpp
    # Header-only — listed so Xcode shows them in the project navigator
    Source/ScaleData.h
    Source/UI/PCSPreview.h
    Source/UI/IconFactory.h
    Source/UI/ChromaticWheel.h
    Source/ScaleLattice.h
)

target_include_directories(DrawnCurve PRIVATE Source/Engine Source Source/UI Source/WebUI)

# ── iOS code signing ──────────────────────────────────────────────────────────
# Embed signing identity so cmake regeneration preserves it.
# These settings match the provisioning profiles on the build machine.
#
# ⚠ MANUAL STEP REQUIRED AFTER EVERY `cmake -B build-ios -G Xcode` ⚠
# -----------------------------------------------------------------------------
# Even with the XCODE_ATTRIBUTE_* properties below, Xcode still needs the
# provisioning profile selected by hand after every regeneration of the
# .xcodeproj.  After every iOS cmake run you MUST open Xcode and, for BOTH
# targets (DrawnCurve_Standalone and DrawnCurve_AUv3):
#
#   1. Open build-ios/DrawnCurve.xcodeproj
#   2. Select the target → Signing & Capabilities tab
#   3. Confirm YOUR team is selected (pin one via signing.local.cmake)
#   4. Confirm "Automatically manage signing" is checked
#   5. If Xcode shows "Failed to register bundle identifier" or a stale
#      provisioning-profile warning, click "Try Again" / let Xcode refresh
#   6. Repeat for the *other* target (Standalone embeds the AUv3 .appex,
#      so both must sign cleanly before installation works on a device)
#
# This is a known Xcode + CMake interaction — the generator writes signing
# attributes into the pbxproj but the IDE re-evaluates provisioning lazily
# the first time a target is selected after generation.  Building from the
# command line with CODE_SIGNING_ALLOWED=YES will also fail until step 1–5
# is performed once per regeneration.  Running with CODE_SIGNING_ALLOWED=NO
# (used in CI/build-only checks) sidesteps it but produces an unsigned
# binary that cannot be installed.
# -----------------------------------------------------------------------------
if(IS_MACOS)
    # Custom entitlements for the AUv3 extension: adds network.client on top of
    # the mandatory app-sandbox so WKWebView's internal XPC round-trips work in
    # Logic Pro's out-of-process AUv3 host (RemoteViewService / ViewBridge).
    # Without network.client the WebContent process cannot fetch the juce://
    # resource provider URL, and the plugin shows a blank window in Logic Pro.
    if(TARGET DrawnCurve_AUv3)
        set_target_properties (DrawnCurve_AUv3 PROPERTIES
            XCODE_ATTRIBUTE_CODE_SIGN_ENTITLEMENTS
                "${CMAKE_SOURCE_DIR}/Assets/DrawnQurve_AUv3.entitlements")
    endif()
endif()

if(IS_IOS)
    # Apple team: default is EMPTY so Xcode picks the machine's own default
    # account (a hardcoded team broke everyone else's builds — and lapsed
    # accounts broke the maintainer's too). Pin a specific 10-char team id in
    # a gitignored signing.local.cmake (see signing.local.cmake.example),
    # same pattern as Serpe.
    set(DRAWNQURVE_TEAM_ID "" CACHE STRING "Apple Developer team id (empty = Xcode default account)")
    include("${CMAKE_CURRENT_SOURCE_DIR}/signing.local.cmake" OPTIONAL)
    if(TARGET DrawnCurve_AUv3)
        set_target_properties (DrawnCurve_AUv3 PROPERTIES
            XCODE_ATTRIBUTE_CODE_SIGN_STYLE         "Automatic"
            XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY      "Apple Development")
        if(DRAWNQURVE_TEAM_ID)
            set_target_properties (DrawnCurve_AUv3 PROPERTIES
                XCODE_ATTRIBUTE_DEVELOPMENT_TEAM "${DRAWNQURVE_TEAM_ID}")
        endif()
    endif()
    if(TARGET DrawnCurve_Standalone)
        set_target_properties (DrawnCurve_Standalone PROPERTIES
            XCODE_ATTRIBUTE_CODE_SIGN_STYLE         "Automatic"
            XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY      "Apple Development")
        if(DRAWNQURVE_TEAM_ID)
            set_target_properties (DrawnCurve_Standalone PROPERTIES
                XCODE_ATTRIBUTE_DEVELOPMENT_TEAM "${DRAWNQURVE_TEAM_ID}")
        endif()
    endif()
endif()

target_compile_definitions(DrawnCurve
    PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
        # Enable per-lane playback parameters (speed multiplier, direction, sync group).
        # Remove to compile without per-lane playback support.
        DC_HAVE_PER_LANE_PLAYBACK_PARAMS=1
        # Tell JUCE standalone not to open audio devices for MIDI-only plugins
        # This prevents the RemoteIO/CoreAudio errors on macOS
        JUCE_STANDALONE_FILTER_WINDOW_USE_KIOSK_MODE=0
)

# Platform-specific definitions
if(IS_IOS)
    target_compile_definitions(DrawnCurve PUBLIC
        # Known JUCE 8.x issue: the Standalone wrapper tries to open RemoteIO
        # with 2 audio channels even for IS_MIDI_EFFECT plugins (0 audio buses).
        # AURemoteIO returns error 561015905 and logs to console; plugin audio
        # is never used, so the error is harmless.  The AUv3 extension loads
        # correctly in real hosts (AUM, Cubasis, etc.) without this error.
        # CA Event launch-measurement failures in the same log are also benign
        # sandbox artefacts and cannot be suppressed from our code.
    )
elseif(IS_MACOS)
    target_compile_definitions(DrawnCurve PUBLIC
        # Use a custom standalone app (StandaloneApp.cpp) instead of JUCE's default
        # StandaloneFilterApp.  The custom app closes the dummy CoreAudio output that
        # JUCE opens for MIDI-effect plugins, preventing HALC_ProxyIOContext overload
        # messages and the mutex crash on quit.
        JUCE_USE_CUSTOM_PLUGIN_STANDALONE_APP=1
    )
endif()

target_link_libraries(DrawnCurve
    PRIVATE
        juce::juce_audio_utils
        juce::juce_audio_plugin_client
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

