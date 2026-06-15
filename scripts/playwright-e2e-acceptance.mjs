import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildPlaywrightPreflightState,
  runPlaywrightPreflight,
  writePlaywrightPreflightState,
} from "./playwright-preflight.mjs";

export function getPlaywrightE2eStatePath() {
  if (process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH) {
    return resolve(process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH);
  }
  return resolve(process.cwd(), ".paper-agent-runtime/playwright-e2e.json");
}

export function buildPlaywrightE2eState({ status, exitCode = null, message = "" } = {}) {
  return {
    status,
    checkedAt: new Date().toISOString(),
    command: "pnpm e2e",
    preflightCommand: "node scripts/playwright-preflight.mjs",
    testCommand: "playwright test",
    exitCode,
    message,
  };
}

export async function writePlaywrightE2eState(state, statePath = getPlaywrightE2eStatePath()) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return statePath;
}

export function runPlaywrightTests(command = "playwright", args = ["test"]) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", (error) => {
      resolvePromise({ exitCode: 1, error });
    });
    child.on("close", (exitCode) => {
      resolvePromise({ exitCode });
    });
  });
}

async function main() {
  try {
    await runPlaywrightPreflight();
    await writePlaywrightPreflightState(buildPlaywrightPreflightState());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writePlaywrightPreflightState(buildPlaywrightPreflightState({ error })).catch(() => {});
    await writePlaywrightE2eState(buildPlaywrightE2eState({
      status: "failed-preflight",
      exitCode: 1,
      message,
    })).catch(() => {});
    throw error;
  }

  const result = await runPlaywrightTests();
  if (result.exitCode === 0) {
    await writePlaywrightE2eState(buildPlaywrightE2eState({
      status: "passed",
      exitCode: 0,
      message: "Playwright E2E acceptance passed.",
    }));
    return;
  }

  const message = result.error
    ? `Playwright E2E failed to start: ${result.error.message}`
    : `Playwright E2E exited with code ${result.exitCode}.`;
  await writePlaywrightE2eState(buildPlaywrightE2eState({
    status: "failed",
    exitCode: result.exitCode ?? 1,
    message,
  })).catch(() => {});
  process.exitCode = result.exitCode || 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
