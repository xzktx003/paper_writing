import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MobileTerminalShortcutHelp,
  MobileTerminalToolbar,
} from "./MobileTerminalToolbar.js";

describe("MobileTerminalToolbar", () => {
  it("renders a shortcut help button beside terminal controls", () => {
    const markup = renderToStaticMarkup(
      createElement(MobileTerminalToolbar, {
        onSendInput: () => {},
      }),
    );

    assert.match(markup, /aria-label="手机终端快捷键"/);
    assert.match(markup, /aria-controls="mobile-terminal-shortcut-help"/);
    assert.match(markup, />说明<\/button>/);
    assert.match(markup, />中断<\/button>/);
  });

  it("lists shortcut descriptions for mobile users", () => {
    const markup = renderToStaticMarkup(
      createElement(MobileTerminalShortcutHelp, {
        onClose: () => {},
      }),
    );

    assert.match(markup, /role="dialog"/);
    assert.match(markup, /快捷键说明/);
    assert.match(markup, /等价 Ctrl\+C，停止当前输出或命令/);
    assert.match(markup, /退出 TUI 当前状态/);
    assert.match(markup, /方向键上/);
    assert.match(markup, /等价 Ctrl\+L/);
  });
});
