import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCaptureFrameSignature,
  getWindowCaptureAvailability,
} from "./window-capture";

test("remote http access reports that window capture requires HTTPS or localhost", () => {
  const result = getWindowCaptureAvailability({
    isSecureContext: false,
    protocol: "http:",
    hostname: "10.30.0.15",
    hasMediaDevices: false,
    hasGetDisplayMedia: false,
  });

  assert.equal(result.supported, false);
  assert.match(result.reason ?? "", /HTTPS/);
  assert.match(result.reason ?? "", /localhost/);
});

test("secure chromium environment reports window capture as supported", () => {
  const result = getWindowCaptureAvailability({
    isSecureContext: true,
    protocol: "https:",
    hostname: "example.com",
    hasMediaDevices: true,
    hasGetDisplayMedia: true,
  });

  assert.deepEqual(result, { supported: true });
});

test("secure browser without getDisplayMedia reports unsupported", () => {
  const result = getWindowCaptureAvailability({
    isSecureContext: true,
    protocol: "https:",
    hostname: "example.com",
    hasMediaDevices: true,
    hasGetDisplayMedia: false,
  });

  assert.equal(result.supported, false);
  assert.match(result.reason ?? "", /Chromium|窗口共享/);
});

test("buildCaptureFrameSignature returns the same signature for identical frames", () => {
  const frame = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
  ]);

  assert.equal(
    buildCaptureFrameSignature(frame),
    buildCaptureFrameSignature(frame),
  );
});

test("buildCaptureFrameSignature changes when frame pixels change", () => {
  const darkFrame = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255]);
  const brightFrame = new Uint8ClampedArray([
    240, 240, 240, 255, 240, 240, 240, 255,
  ]);

  assert.notEqual(
    buildCaptureFrameSignature(darkFrame),
    buildCaptureFrameSignature(brightFrame),
  );
});
