import assert from "node:assert/strict";
import test from "node:test";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildPlaywrightPreflightState,
  formatPlaywrightPreflightError,
  writePlaywrightPreflightState,
} from "./playwright-preflight.mjs";

test("formats missing Chromium shared library failures as actionable preflight errors", () => {
  const message = formatPlaywrightPreflightError(
    new Error(
      "/chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory",
    ),
  );

  assert.match(message, /libatk-1\.0\.so\.0/);
  assert.match(message, /npx playwright install/);
  assert.match(message, /sudo npx playwright install-deps/);
});

test("keeps non-library launch failures visible", () => {
  const message = formatPlaywrightPreflightError(new Error("sandbox denied"));

  assert.match(message, /preflight failed/i);
  assert.match(message, /sandbox denied/);
});

test("writes reusable preflight state for workbench readiness", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paper-agent-preflight-"));
  try {
    const statePath = join(dir, "playwright-preflight.json");
    const state = buildPlaywrightPreflightState({ error: new Error("sandbox denied") });
    await writePlaywrightPreflightState(state, statePath);

    const saved = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(saved.status, "failed");
    assert.equal(saved.command, "node scripts/playwright-preflight.mjs");
    assert.match(saved.message, /sandbox denied/);
    assert.ok(saved.checkedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
