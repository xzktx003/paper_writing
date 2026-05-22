import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

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
  cwd: string;
}

export function TerminalPanel({ cwd }: Props) {
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
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws?cols=${term.cols}&rows=${term.rows}&cwd=${encodeURIComponent(cwd)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'data') {
        term.write(msg.data);
      }
    };

    ws.onopen = () => {
      // 不发送额外的换行，避免重复显示
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
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      term.dispose();
    };
  }, [cwd]);

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
  );
}
