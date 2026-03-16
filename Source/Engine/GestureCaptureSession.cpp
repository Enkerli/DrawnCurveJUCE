#include "GestureCaptureSession.hpp"
#include <algorithm>
#include <cmath>

void GestureCaptureSession::begin() {
    rawPoints.clear();
}

void GestureCaptureSession::addPoint(double t, float x, float y, float pressure) {
    rawPoints.push_back({t, x, y, pressure});
}

void GestureCaptureSession::clear() {
    rawPoints.clear();
}

float GestureCaptureSession::interpolateYAtTime(double t) const {
    if (rawPoints.empty()) return 0.5f;
    if (rawPoints.size() == 1) return rawPoints[0].y;

    // Clamp to edges
    if (t <= rawPoints.front().t) return rawPoints.front().y;
    if (t >= rawPoints.back().t)  return rawPoints.back().y;

    // Linear search for surrounding segment
    for (size_t i = 1; i < rawPoints.size(); ++i) {
        if (rawPoints[i].t >= t) {
            double t0 = rawPoints[i - 1].t;
            double t1 = rawPoints[i].t;
            if (t1 <= t0) return rawPoints[i].y;
            float frac = (float)((t - t0) / (t1 - t0));
            return rawPoints[i - 1].y + frac * (rawPoints[i].y - rawPoints[i - 1].y);
        }
    }
    return rawPoints.back().y;
}

LaneSnapshot GestureCaptureSession::finalize(uint8_t ccNumber, uint8_t midiChannel,
                                              float minOut, float maxOut, float smoothing,
                                              MessageType messageType) const {
    LaneSnapshot snap{};

    if (rawPoints.size() < 2) {
        snap.table.fill(0.5f);
        snap.durationSeconds = 1.0f;
        snap.valid = false;
        return snap;
    }

    double t0       = rawPoints.front().t;
    double t1       = rawPoints.back().t;
    double duration = std::max(0.05, t1 - t0);

    snap.durationSeconds = (float)duration;
    snap.ccNumber        = ccNumber;
    snap.midiChannel     = midiChannel;
    snap.minOut          = minOut;
    snap.maxOut          = maxOut;
    snap.smoothing       = smoothing;
    snap.messageType     = messageType;
    snap.valid           = true;

    for (int i = 0; i < 256; ++i) {
        float  phase   = (float)i / 255.0f;
        double targetT = t0 + phase * duration;
        float  y       = interpolateYAtTime(targetT);
        // UIKit y=0 is top → invert so top-of-screen = high CC value
        snap.table[static_cast<size_t>(i)] = std::clamp(1.0f - y, 0.0f, 1.0f);
    }

    return snap;
}
