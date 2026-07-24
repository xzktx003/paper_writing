import { useEffect, useRef } from 'react';
import { getServerAccessToken } from '../../api/serverAccess';

interface FileChangeEvent {
  type: 'file_change';
  eventType: string;
  filename: string;
  path: string;
}

export function useFileWatcher(projectId: string | null, onFileChange: (event: FileChangeEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({ projectId });
    const token = getServerAccessToken();
    if (token) params.set('access_token', token);
    const url = `${protocol}//${window.location.host}/api/ws/watch?${params.toString()}`;
    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'file_change') {
          onFileChange(data);
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, onFileChange]);
}
