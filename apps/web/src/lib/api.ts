import type {
  AddDiscoveredTmuxInput,
  AgentSessionDetailResponse,
  AgentSessionSnapshotEvent,
  AgentSessionRecord,
  CreateWindowCaptureSessionInput,
  CreateWindowCaptureSessionResponse,
  DirectorySuggestionsInput,
  DirectorySuggestionsResponse,
  DiscoverTmuxInput,
  DiscoverTmuxSessionsResponse,
  FocusAgentSessionInput,
  LaunchLocalAgentInput,
  LaunchRemoteAgentInput,
  LaunchSshPtyInput,
  ListAgentSessionsResponse,
  ObserveStateInput,
  RegisterAgentSessionInput,
  ScanDirectoryInput,
  ScanDirectoryResponse,
  SshHostsResponse,
  StdinAgentSessionInput,
  TmuxControlActionResponse,
  UpdateAgentSessionInput,
} from "@agent-orchestrator/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

function wsBase(): string {
  if (import.meta.env.VITE_API_WS_URL) {
    return import.meta.env.VITE_API_WS_URL.replace(
      /\/ws\/agent-sessions\/?$/,
      "",
    );
  }

  if (apiBaseUrl) {
    const httpUrl = new URL(apiBaseUrl, window.location.origin);
    httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
    httpUrl.search = "";
    httpUrl.hash = "";
    return httpUrl.toString().replace(/\/$/, "");
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function buildWebSocketUrl(): string {
  return `${wsBase()}/ws/agent-sessions`;
}

export function buildTerminalWebSocketUrl(agentSessionId: string): string {
  return `${wsBase()}/ws/agent-sessions/${agentSessionId}/terminal`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers,
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function listAgentSessions(): Promise<ListAgentSessionsResponse> {
  return request<ListAgentSessionsResponse>("/api/agent-sessions");
}

export function getAgentSessionDetail(
  agentSessionId: string,
): Promise<AgentSessionDetailResponse> {
  return request<AgentSessionDetailResponse>(
    `/api/agent-sessions/${agentSessionId}`,
  );
}

export function registerAgentSession(
  body: RegisterAgentSessionInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>("/api/agent-sessions/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function focusAgentSession(
  body: FocusAgentSessionInput,
): Promise<ListAgentSessionsResponse> {
  return request<ListAgentSessionsResponse>("/api/agent-sessions/focus", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function sendAgentInput(
  agentSessionId: string,
  body: StdinAgentSessionInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>(
    `/api/agent-sessions/${agentSessionId}/stdin`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function launchLocalAgent(
  body: LaunchLocalAgentInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>("/api/agent-launch/local", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function launchRemoteAgent(
  body: LaunchRemoteAgentInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>("/api/agent-launch/remote", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function discoverTmuxSessions(
  body?: DiscoverTmuxInput,
): Promise<DiscoverTmuxSessionsResponse> {
  return request<DiscoverTmuxSessionsResponse>(
    "/api/agent-discovery/tmux/scan",
    {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

export function takeOverTmuxSession(
  agentSessionId: string,
): Promise<TmuxControlActionResponse> {
  return request<TmuxControlActionResponse>(
    `/api/agent-sessions/${agentSessionId}/tmux/takeover`,
    {
      method: "POST",
    },
  );
}

export function releaseTmuxSession(
  agentSessionId: string,
): Promise<TmuxControlActionResponse> {
  return request<TmuxControlActionResponse>(
    `/api/agent-sessions/${agentSessionId}/tmux/release`,
    {
      method: "POST",
    },
  );
}

export function refreshTmuxSession(
  agentSessionId: string,
): Promise<TmuxControlActionResponse> {
  return request<TmuxControlActionResponse>(
    `/api/agent-sessions/${agentSessionId}/tmux/refresh`,
    {
      method: "POST",
    },
  );
}

export function subscribeAgentSessions(
  onSnapshot: (snapshot: ListAgentSessionsResponse) => void,
): () => void {
  const socket = new WebSocket(buildWebSocketUrl());
  let closeAfterOpen = false;

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data) as AgentSessionSnapshotEvent;

    if (payload.type === "snapshot") {
      onSnapshot(payload.payload);
    }
  });

  socket.addEventListener("open", () => {
    if (closeAfterOpen) {
      socket.close();
    }
  });

  return () => {
    if (socket.readyState === WebSocket.CONNECTING) {
      closeAfterOpen = true;
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };
}

export function launchPtyAgent(
  body: LaunchLocalAgentInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>("/api/agent-launch/pty", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function launchSshPtyAgent(
  body: LaunchSshPtyInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>("/api/agent-launch/ssh-pty", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function scanDirectory(
  body: ScanDirectoryInput,
): Promise<ScanDirectoryResponse> {
  return request<ScanDirectoryResponse>("/api/agent-discovery/scan", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addScanResult(
  body: ScanDirectoryInput & { index: number },
): Promise<AgentSessionRecord> {
  const { index, ...scanInput } = body;
  return request<AgentSessionRecord>(`/api/agent-discovery/scan/${index}/add`, {
    method: "POST",
    body: JSON.stringify(scanInput),
  });
}

export function getSshHosts(): Promise<SshHostsResponse> {
  return request<SshHostsResponse>("/api/ssh-hosts");
}

export function getDirectorySuggestions(
  body: DirectorySuggestionsInput,
): Promise<DirectorySuggestionsResponse> {
  return request<DirectorySuggestionsResponse>("/api/directory-suggestions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAgentSession(agentSessionId: string): Promise<void> {
  return fetch(`${apiBaseUrl}/api/agent-sessions/${agentSessionId}`, {
    method: "DELETE",
  }).then((res) => {
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  });
}

export function updateAgentSession(
  agentSessionId: string,
  input: UpdateAgentSessionInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>(`/api/agent-sessions/${agentSessionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function reconnectAgentSession(
  agentSessionId: string,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>(
    `/api/agent-sessions/${agentSessionId}/reconnect`,
    { method: "POST" },
  );
}

export function createWindowCaptureSession(
  input: CreateWindowCaptureSessionInput = {},
): Promise<CreateWindowCaptureSessionResponse> {
  return request<CreateWindowCaptureSessionResponse>(
    "/api/agent-sessions/window-capture",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function sendObserveState(
  agentSessionId: string,
  input: ObserveStateInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>(
    `/api/agent-sessions/${agentSessionId}/observe-state`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function focusAgentWindow(
  agentSessionId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/agent-sessions/${agentSessionId}/focus-window`,
    { method: "POST" },
  );
}

export async function deleteAgentSessionSafe(
  agentSessionId: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(
    `${apiBaseUrl}/api/agent-sessions/${agentSessionId}`,
    { method: "DELETE" },
  );
  return { ok: res.ok, status: res.status };
}

export function removeFromGrid(agentSessionId: string): Promise<void> {
  return request<void>(
    `/api/agent-sessions/${agentSessionId}/remove-from-grid`,
    { method: "POST" },
  );
}

export function killTmuxSession(agentSessionId: string): Promise<void> {
  return request<void>(`/api/agent-sessions/${agentSessionId}/tmux/kill`, {
    method: "POST",
  });
}

export function addDiscoveredTmux(
  input: AddDiscoveredTmuxInput,
): Promise<AgentSessionRecord> {
  return request<AgentSessionRecord>("/api/agent-discovery/tmux/add", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
