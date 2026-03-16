#pragma once
#include <vector>
#include <cstdint>
#include "LaneSnapshot.hpp"

struct CapturePoint {
    double t;        // seconds since gesture start
    float  x;        // 0..1 (left to right)
    float  y;        // 0..1 (top to bottom, UIKit coords)
    float  pressure; // 0..1 (default 1.0 if unavailable)
};

class GestureCaptureSession {
public:
    void begin();
    void addPoint(double t, float x, float y, float pressure = 1.0f);
    bool hasPoints() const { return rawPoints.size() >= 2; }
    void clear();

    // Converts raw capture to an immutable LaneSnapshot.
    // value = 1.0 - y  (top of screen = high CC / pressure / pitchbend value)
    LaneSnapshot finalize(uint8_t ccNumber, uint8_t midiChannel,
                          float minOut, float maxOut, float smoothing,
                          MessageType messageType = MessageType::CC) const;

private:
    std::vector<CapturePoint> rawPoints;
    float interpolateYAtTime(double t) const;
};
