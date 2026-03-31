import { useEffect, useRef, useState } from "react";

interface CardMoreMenuProps {
  sessionId: string;
  isTmux: boolean;
  onRename: (id: string) => void;
  onCopyConnectCommand: (id: string) => void;
  onKillTmux: (id: string) => void;
}

export function CardMoreMenu({
  sessionId,
  isTmux,
  onRename,
  onCopyConnectCommand,
  onKillTmux,
}: CardMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="card-more-menu" ref={ref}>
      <button
        className="card-more-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-label="更多操作"
      >
        ···
      </button>
      {open && (
        <div className="card-more-menu-dropdown">
          <button
            className="card-more-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRename(sessionId);
            }}
          >
            ✎ 重命名
          </button>
          {isTmux && (
            <button
              className="card-more-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onCopyConnectCommand(sessionId);
              }}
            >
              📋 复制连接命令
            </button>
          )}
          {isTmux && (
            <button
              className="card-more-menu-item card-more-menu-item--danger"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (
                  window.confirm("确定要终止此 tmux 会话吗？这将杀掉底层进程。")
                ) {
                  onKillTmux(sessionId);
                }
              }}
            >
              ⚠ 终止 tmux 会话
            </button>
          )}
        </div>
      )}
    </div>
  );
}
