import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveAppViewportHeight } from "./viewport-height.js";

describe("resolveAppViewportHeight", () => {
  it("falls back to innerHeight when no narrower viewport height exists", () => {
    assert.equal(resolveAppViewportHeight({ innerHeight: 900 }), 900);
  });

  it("prefers the layout viewport when visual viewport values overreport the available height", () => {
    assert.equal(
      resolveAppViewportHeight({
        innerHeight: 932,
        visualViewportHeight: 928,
        documentElementClientHeight: 892,
      }),
      892,
    );
  });

  it("uses the fullscreen element height when it is the tightest visible bound", () => {
    assert.equal(
      resolveAppViewportHeight({
        innerHeight: 932,
        visualViewportHeight: 928,
        documentElementClientHeight: 904,
        fullscreenElementClientHeight: 884,
      }),
      884,
    );
  });

  it("clamps fullscreen height to the screen work area when the taskbar still consumes space", () => {
    assert.equal(
      resolveAppViewportHeight({
        innerHeight: 932,
        visualViewportHeight: 928,
        documentElementClientHeight: 904,
        screenAvailHeight: 892,
      }),
      892,
    );
  });

  it("rounds fractional viewport measurements before storing them", () => {
    assert.equal(
      resolveAppViewportHeight({
        visualViewportHeight: 801.6,
        documentElementClientHeight: 802,
      }),
      802,
    );
  });
});
