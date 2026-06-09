import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { copyTextToClipboard } from "./clipboard.js";

function createClipboardDocumentStub() {
  const appended: unknown[] = [];
  const calls: string[] = [];
  const textarea = {
    focus: () => {
      calls.push("focus");
    },
    readOnly: false,
    select: () => {
      calls.push("select");
    },
    setSelectionRange: (start: number, end: number) => {
      calls.push(`range:${start}:${end}`);
    },
    style: {},
    value: "",
  } as unknown as HTMLTextAreaElement;

  return {
    calls,
    documentRef: {
      body: {
        appendChild: (element: HTMLTextAreaElement) => {
          appended.push(element);
          calls.push("append");
        },
        removeChild: (element: HTMLTextAreaElement) => {
          assert.equal(element, textarea);
          calls.push("remove");
        },
      },
      createElement: (tagName: "textarea") => {
        assert.equal(tagName, "textarea");
        calls.push("create");
        return textarea;
      },
      execCommand: (command: "copy") => {
        assert.equal(command, "copy");
        assert.equal(appended.at(-1), textarea);
        calls.push("copy");
        return true;
      },
    },
    textarea,
  };
}

describe("copyTextToClipboard", () => {
  it("uses navigator.clipboard.writeText when available", async () => {
    let copied = "";
    const result = await copyTextToClipboard("/workspace/file.txt", {
      documentRef: createClipboardDocumentStub().documentRef,
      navigatorRef: {
        clipboard: {
          writeText: async (text) => {
            copied = text;
          },
        },
      },
    });

    assert.equal(result, true);
    assert.equal(copied, "/workspace/file.txt");
  });

  it("falls back to textarea copy when clipboard API is unavailable", async () => {
    const { calls, documentRef, textarea } = createClipboardDocumentStub();
    const result = await copyTextToClipboard("/workspace/folder", {
      documentRef,
      navigatorRef: {},
    });

    assert.equal(result, true);
    assert.equal(textarea.value, "/workspace/folder");
    assert.equal(textarea.readOnly, true);
    assert.deepEqual(calls, [
      "create",
      "append",
      "focus",
      "select",
      "range:0:17",
      "copy",
      "remove",
    ]);
  });

  it("falls back when clipboard API rejects on an HTTP page", async () => {
    const { calls, documentRef, textarea } = createClipboardDocumentStub();
    const result = await copyTextToClipboard("/workspace/retry.txt", {
      documentRef,
      navigatorRef: {
        clipboard: {
          writeText: async () => {
            throw new Error("clipboard denied");
          },
        },
      },
    });

    assert.equal(result, true);
    assert.equal(textarea.value, "/workspace/retry.txt");
    assert.equal(calls.includes("copy"), true);
  });
});
