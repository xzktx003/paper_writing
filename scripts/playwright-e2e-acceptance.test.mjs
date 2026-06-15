import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildPlaywrightE2eState,
  writePlaywrightE2eState,
} from "./playwright-e2e-acceptance.mjs";

test("writes reusable full browser E2E acceptance state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paper-agent-e2e-"));
  try {
    const statePath = join(dir, "playwright-e2e.json");
    const state = buildPlaywrightE2eState({
      status: "passed",
      exitCode: 0,
      message: "Playwright E2E acceptance passed.",
    });
    await writePlaywrightE2eState(state, statePath);

    const saved = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(saved.status, "passed");
    assert.equal(saved.command, "pnpm e2e");
    assert.equal(saved.preflightCommand, "node scripts/playwright-preflight.mjs");
    assert.equal(saved.testCommand, "playwright test");
    assert.equal(saved.exitCode, 0);
    assert.match(saved.message, /acceptance passed/);
    assert.ok(saved.checkedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
