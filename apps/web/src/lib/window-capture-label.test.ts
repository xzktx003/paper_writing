import test from "node:test";
import assert from "node:assert/strict";

import {
  getWindowCaptureDisplay,
  parseWindowCaptureLabel,
} from "./window-capture-label";

test("parses 'coding_kanban - Visual Studio Code' as high confidence", () => {
  const result = parseWindowCaptureLabel("coding_kanban - Visual Studio Code");
  assert.equal(result.confidence, "high");
  assert.equal(result.parsedTitle, "coding_kanban");
  assert.equal(result.parsedAppName, "Visual Studio Code");
});

test("parses 'coding_kanban — Code' with em-dash as high confidence", () => {
  const result = parseWindowCaptureLabel("coding_kanban — Code");
  assert.equal(result.confidence, "high");
  assert.equal(result.parsedTitle, "coding_kanban");
  assert.equal(result.parsedAppName, "Code");
});

test("parses 'my-project – Visual Studio Code' with en-dash", () => {
  const result = parseWindowCaptureLabel("my-project – Visual Studio Code");
  assert.equal(result.confidence, "high");
  assert.equal(result.parsedTitle, "my-project");
  assert.equal(result.parsedAppName, "Visual Studio Code");
});

test("unknown label returns low confidence with no parsed fields", () => {
  const result = parseWindowCaptureLabel("mystery capture string");
  assert.equal(result.confidence, "low");
  assert.equal(result.parsedTitle, undefined);
  assert.equal(result.parsedAppName, undefined);
});

test("empty string returns low confidence", () => {
  const result = parseWindowCaptureLabel("");
  assert.equal(result.confidence, "low");
  assert.equal(result.parsedTitle, undefined);
  assert.equal(result.parsedAppName, undefined);
});

test("label with only app name and no title returns low confidence", () => {
  const result = parseWindowCaptureLabel("Visual Studio Code");
  assert.equal(result.confidence, "low");
  assert.equal(result.parsedTitle, undefined);
  assert.equal(result.parsedAppName, undefined);
});

test("label with multiple dashes picks last known suffix", () => {
  const result = parseWindowCaptureLabel(
    "src/index.ts - coding_kanban - Visual Studio Code",
  );
  assert.equal(result.confidence, "high");
  assert.equal(result.parsedTitle, "src/index.ts - coding_kanban");
  assert.equal(result.parsedAppName, "Visual Studio Code");
});

test("custom displayName takes precedence over rawLabel parsing", () => {
  const result = getWindowCaptureDisplay(
    "我的 VS Code 窗口",
    "coding_kanban - Visual Studio Code",
  );
  assert.equal(result.title, "我的 VS Code 窗口");
  assert.equal(result.appName, undefined);
  assert.equal(result.usesCustomName, true);
});

test("rawLabel is parsed when displayName still equals rawLabel", () => {
  const result = getWindowCaptureDisplay(
    "coding_kanban - Visual Studio Code",
    "coding_kanban - Visual Studio Code",
  );
  assert.equal(result.title, "coding_kanban");
  assert.equal(result.appName, "Visual Studio Code");
  assert.equal(result.usesCustomName, false);
});
