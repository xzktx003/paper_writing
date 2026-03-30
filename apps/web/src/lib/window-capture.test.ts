import assert from "node:assert/strict";
import test from "node:test";

import { getWindowCaptureAvailability } from "./window-capture";

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
