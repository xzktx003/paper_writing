import { useState } from "react";

import { MOBILE_TERMINAL_CONTROLS } from "../lib/mobile-terminal-controls";

interface MobileTerminalToolbarProps {
  disabled?: boolean;
  onSendInput: (input: string) => Promise<void> | void;
}

interface MobileTerminalShortcutHelpProps {
  onClose: () => void;
}

export function MobileTerminalShortcutHelp({
  onClose,
}: MobileTerminalShortcutHelpProps) {
  return (
    <div className="mobile-terminal-help-backdrop" role="presentation">
      <section
        aria-label="手机终端快捷键说明"
        className="mobile-terminal-help-panel"
        role="dialog"
      >
        <div className="mobile-terminal-help-header">
          <div>
            <strong>快捷键说明</strong>
            <span>点击快捷键会直接发送到当前终端</span>
          </div>
          <button
            aria-label="关闭快捷键说明"
            className="mobile-terminal-help-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <dl className="mobile-terminal-help-list">
          {MOBILE_TERMINAL_CONTROLS.map((control) => (
            <div className="mobile-terminal-help-item" key={control.id}>
              <dt>{control.label}</dt>
              <dd>{control.description}</dd>
            </div>
          ))}
        </dl>
        <button
          className="mobile-terminal-help-confirm"
          onClick={onClose}
          type="button"
        >
          知道了
        </button>
      </section>
    </div>
  );
}

export function MobileTerminalToolbar({
  disabled = false,
  onSendInput,
}: MobileTerminalToolbarProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <div
        aria-label="手机终端快捷键"
        className="mobile-terminal-toolbar"
        role="toolbar"
      >
        <button
          aria-controls="mobile-terminal-shortcut-help"
          aria-expanded={showHelp}
          className="mobile-terminal-key mobile-terminal-key--help"
          onClick={() => setShowHelp(true)}
          type="button"
        >
          说明
        </button>
        {MOBILE_TERMINAL_CONTROLS.map((control) => (
          <button
            className={`mobile-terminal-key${control.danger ? " mobile-terminal-key--danger" : ""}`}
            disabled={disabled}
            key={control.id}
            onClick={() => void onSendInput(control.input)}
            title={control.description}
            type="button"
          >
            {control.label}
          </button>
        ))}
      </div>
      {showHelp && (
        <div id="mobile-terminal-shortcut-help">
          <MobileTerminalShortcutHelp onClose={() => setShowHelp(false)} />
        </div>
      )}
    </>
  );
}
