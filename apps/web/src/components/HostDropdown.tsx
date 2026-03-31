import { useEffect, useRef, useState } from "react";

import type { SshHostPreset } from "@agent-orchestrator/shared";

export type SelectedHost =
  | { type: "local" }
  | { type: "ssh"; preset: SshHostPreset };

interface HostDropdownProps {
  sshHosts: SshHostPreset[];
  onSelectHost: (host: SelectedHost) => void;
  triggerLabel: string;
  disabled?: boolean;
}

export function HostDropdown({
  sshHosts,
  onSelectHost,
  triggerLabel,
  disabled,
}: HostDropdownProps) {
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
    <div className="host-dropdown" ref={ref}>
      <button
        className="top-bar-action"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        data-testid={`btn-${triggerLabel}`}
      >
        {triggerLabel} ▾
      </button>
      {open && (
        <div className="host-dropdown-menu" data-testid="host-dropdown-menu">
          <button
            className="host-dropdown-item"
            onClick={() => {
              onSelectHost({ type: "local" });
              setOpen(false);
            }}
          >
            🖥 本机
          </button>
          {sshHosts.map((h) => (
            <button
              key={h.name}
              className="host-dropdown-item"
              onClick={() => {
                onSelectHost({ type: "ssh", preset: h });
                setOpen(false);
              }}
            >
              🌐 {h.name}
              <span className="host-dropdown-detail">
                {h.username ? `${h.username}@` : ""}
                {h.host}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
