import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { getServerAccessToken } from '../../api/serverAccess';

// 过滤 xterm.js 自动回复的控制序列（焦点报告、OSC 颜色回复等）
// 这些序列会被 xterm.js 自动发送，但如果发到后端再返回会导致重复显示
const FOCUS_REPORT_PATTERN = /\u001b\[[IO]/g;
const OSC_COLOR_REPLY_PATTERN =
  /\u001b\](?:10|11);rgb:(?:[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}|[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4})(?:\u0007|\u001b\\)|\u001b\]4;\d+;rgb:(?:[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}|[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4})(?:\u0007|\u001b\\)/g;

function stripTerminalResponsePayload(payload: string): string {
  return payload
    .replace(FOCUS_REPORT_PATTERN, '')
    .replace(OSC_COLOR_REPLY_PATTERN, '');
}

interface Props {
  projectId: string;
}

export function TerminalPanel({ projectId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const isCyber = document.documentElement.getAttribute('data-theme') === 'cyber-tech';
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: isCyber ? {
        background: '#0a0f14',
        foreground: '#00ff88',
        cursor: '#00ff88',
        cursorAccent: '#0a0f14',
        selectionBackground: 'rgba(0, 255, 136, 0.2)',
        selectionForeground: '#ffffff',
        black: '#0a0f14',
        red: '#ff5555',
        green: '#00ff88',
        yellow: '#f1fa8c',
        blue: '#00e5ff',
        magenta: '#a855f7',
        cyan: '#00e5ff',
        white: '#e0e6f0',
        brightBlack: '#505a6e',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#6effff',
        brightMagenta: '#d6acff',
        brightCyan: '#6effff',
        brightWhite: '#ffffff',
      } : {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    const fitTerminal = () => {
      const container = containerRef.current;
      if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) return;
      try { fitAddon.fit(); } catch {}
    };
    requestAnimationFrame(fitTerminal);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const terminalParams = new URLSearchParams({
      cols: String(term.cols),
      rows: String(term.rows),
      projectId,
    });
    const apiToken = getServerAccessToken();
    if (apiToken) terminalParams.set('access_token', apiToken);
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws?${terminalParams.toString()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let disposed = false;
    let receivedTerminalData = false;
    let promptTimer: ReturnType<typeof setTimeout> | null = null;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data' || msg.type === 'replay') {
          receivedTerminalData = true;
          term.write(msg.data || '');
        } else if (msg.type === 'id') {
          term.writeln(`\x1b[90m[terminal connected · ${msg.backend || 'pty'} · ${msg.session}]\x1b[0m`);
          // Some shells emit their first prompt before the PTY listener is attached.
          // Request one empty command only when no terminal output arrives shortly.
          promptTimer = setTimeout(() => {
            if (!receivedTerminalData && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'data', data: '\r' }));
            }
          }, 150);
        } else if (msg.type === 'error') {
          term.writeln(`\r\n\x1b[31m${msg.error || 'Terminal backend error'}\x1b[0m`);
        } else if (msg.type === 'exit') {
          term.writeln(`\r\n\x1b[33m[terminal exited with code ${msg.code}]\x1b[0m`);
        }
      } catch {
        receivedTerminalData = true;
        term.write(String(event.data || ''));
      }
    };

    ws.onopen = () => {
      fitTerminal();
      term.focus();
    };

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31mTerminal connection failed. Check the backend WebSocket and node-pty installation.\x1b[0m');
    };

    ws.onclose = (event) => {
      if (!disposed && event.code !== 1000) {
        term.writeln(`\r\n\x1b[33m[terminal disconnected${event.reason ? `: ${event.reason}` : ''}]\x1b[0m`);
      }
    };

    term.onData((data) => {
      // 过滤 xterm.js 自动回复的控制序列
      const sanitized = stripTerminalResponsePayload(data);
      if (!sanitized) return;
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: sanitized }));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const observer = new ResizeObserver(() => {
      fitTerminal();
    });
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      if (promptTimer) clearTimeout(promptTimer);
      observer.disconnect();
      ws.close();
      term.dispose();
    };
  }, [projectId]);

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%', minHeight: 0, background: '#1e1e1e' }} />
  );
}
