import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium } from "@playwright/test";

const missingLibraryPattern =
  /error while loading shared libraries:\s*([^:\s]+):\s*cannot open shared object file/i;

export function formatPlaywrightPreflightError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const missingLibrary = message.match(missingLibraryPattern)?.[1];

  if (missingLibrary) {
    return [
      `Playwright Chromium cannot start because the system library ${missingLibrary} is missing.`,
      "Install the browser and OS dependencies, then rerun e2e:",
      "  npx playwright install",
      "  sudo npx playwright install-deps",
      "If this machine cannot install system packages, run e2e on an environment with Playwright browser dependencies.",
    ].join("\n");
  }

  return [
    "Playwright Chromium preflight failed before running e2e tests.",
    message,
  ].join("\n");
}

export async function runPlaywrightPreflight() {
  const browser = await chromium.launch({ headless: true });
  await browser.close();
}

export function buildPlaywrightPreflightState(result) {
  const error = result?.error;
  const message = error ? formatPlaywrightPreflightError(error) : "Playwright Chromium preflight passed.";
  const missingLibrary = error
    ? (error instanceof Error ? error.message : String(error)).match(missingLibraryPattern)?.[1] || ""
    : "";
  return {
    status: error ? "failed" : "passed",
    checkedAt: new Date().toISOString(),
    command: "node scripts/playwright-preflight.mjs",
    message,
    missingLibrary,
  };
}

export function getPlaywrightPreflightStatePath() {
  if (process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH) {
    return resolve(process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH);
  }
  return resolve(process.cwd(), ".paper-agent-runtime/playwright-preflight.json");
}

export async function writePlaywrightPreflightState(state, statePath = getPlaywrightPreflightStatePath()) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return statePath;
}

async function main() {
  try {
    await runPlaywrightPreflight();
    await writePlaywrightPreflightState(buildPlaywrightPreflightState());
    console.log("Playwright Chromium preflight passed.");
  } catch (error) {
    const state = buildPlaywrightPreflightState({ error });
    await writePlaywrightPreflightState(state).catch(() => {});
    console.error(state.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
