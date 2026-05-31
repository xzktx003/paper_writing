import type {
  AddDiscoveredTmuxInput,
  AgentSessionDetailResponse,
  AgentSessionSnapshotEvent,
  AgentSessionRecord,
  ChmodInput,
  DirectorySuggestionsInput,
  DirectorySuggestionsResponse,
  DiscoverTmuxInput,
  DiscoverTmuxSessionsResponse,
  FileOperationInput,
  FilePreviewInput,
  FilePreviewResponse,
  FileUploadResponse,
  FocusAgentSessionInput,
  ListFilesInput,
  ListFilesResponse,
  LaunchLocalAgentInput,
  LaunchRemoteAgentInput,
  LaunchSshPtyInput,
  ListAgentSessionsResponse,
  OpenVsCodeWebResponse,
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
    const contentType = response.headers.get("content-type") ?? "";

    try {
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) {
          throw new Error(payload.error);
        }
      } else {
        const text = (await response.text()).trim();
        if (text) {
          throw new Error(text);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
    }

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

export function listFiles(body: ListFilesInput): Promise<ListFilesResponse> {
  return request<ListFilesResponse>("/api/fs/list", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fileOperation(body: FileOperationInput): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/fs/operation", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function previewFile(
  body: FilePreviewInput,
): Promise<FilePreviewResponse> {
  return request<FilePreviewResponse>("/api/fs/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function chmodFile(body: ChmodInput): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/fs/chmod", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function downloadFile(body: {
  path: string;
  sshTarget?: ListFilesInput["sshTarget"];
}): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/fs/download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = body.path.split("/").filter(Boolean).pop() ?? "download";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function uploadFiles(options: {
  path?: string;
  overwritePath?: string;
  sshTarget?: ListFilesInput["sshTarget"];
  files: File[];
  relativePaths?: string[];
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}): Promise<FileUploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();

    if (options.path) {
      formData.append("path", options.path);
    }

    if (options.overwritePath) {
      formData.append("overwritePath", options.overwritePath);
    }

    if (options.sshTarget) {
      formData.append("sshTarget", JSON.stringify(options.sshTarget));
    }

    if (options.relativePaths && options.relativePaths.length > 0) {
      formData.append("relativePaths", JSON.stringify(options.relativePaths));
    }

    for (const file of options.files) {
      formData.append("files", file);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBaseUrl}/api/fs/upload`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(event.loaded / event.total);
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed: ${xhr.status}`));
        return;
      }

      resolve(
        (xhr.response ?? JSON.parse(xhr.responseText)) as FileUploadResponse,
      );
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new Error("Upload cancelled"));
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.send(formData);
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

export function openVsCodeWeb(
  agentSessionId: string,
): Promise<OpenVsCodeWebResponse> {
  return request<OpenVsCodeWebResponse>(
    `/api/agent-sessions/${agentSessionId}/vscode-web`,
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

export function hideAgentSession(
  agentSessionId: string,
): Promise<AgentSessionRecord> {
  return updateAgentSession(agentSessionId, { hidden: true });
}

export function unhideAgentSession(
  agentSessionId: string,
): Promise<AgentSessionRecord> {
  return updateAgentSession(agentSessionId, { hidden: false });
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
