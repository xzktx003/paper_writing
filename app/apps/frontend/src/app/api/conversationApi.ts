const BASE = '/api';

export interface ConversationSummary {
  id: string;
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  mode: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  active_skills: string[];
  mode: string;
  model?: string;
  history: { role: string; content: string }[];
}

export async function listConversations(projectId: string): Promise<ConversationSummary[]> {
  const res = await fetch(`${BASE}/conversations/${projectId}`);
  return res.json();
}

export async function getConversation(projectId: string, convId: string): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations/${projectId}/${convId}`);
  return res.json();
}

export async function createConversation(projectId: string, data: {
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  active_skills?: string[];
  mode?: string;
  model?: string;
}): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateConversation(projectId: string, convId: string, updates: Partial<{ name: string; active_skills: string[]; mode: string }>): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations/${projectId}/${convId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteConversation(projectId: string, convId: string) {
  await fetch(`${BASE}/conversations/${projectId}/${convId}`, { method: 'DELETE' });
}

export async function sendMessage(projectId: string, convId: string, projectPath: string, userMessage: string, projectConfig: any) {
  const res = await fetch(`${BASE}/ai/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, convId, projectPath, userMessage, projectConfig }),
  });
  return res.json();
}

/** SSE streaming version of sendMessage */
export async function sendMessageStream(
  projectId: string, convId: string, projectPath: string, userMessage: string, projectConfig: any,
  callbacks: {
    onToken: (text: string) => void;
    onToolUse?: (name: string, input: any) => void;
    onToolResult?: (name: string, result: string) => void;
    onDone: (fullText: string) => void;
    onError: (message: string) => void;
  }
) {
  const res = await fetch(`${BASE}/ai/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, convId, projectPath, userMessage, projectConfig }),
  });

  if (!res.ok) {
    callbacks.onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        try {
          const data = JSON.parse(dataStr);
          switch (eventType) {
            case 'token': callbacks.onToken(data.text || ''); break;
            case 'tool_use': callbacks.onToolUse?.(data.name, data.input); break;
            case 'tool_result': callbacks.onToolResult?.(data.name, data.result || ''); break;
            case 'done': callbacks.onDone(data.fullText || ''); break;
            case 'error': callbacks.onError(data.message || 'Unknown error'); break;
          }
        } catch {}
        eventType = '';
      }
    }
  }
}

// ── Review API ──
export async function structuredReview(projectPath: string, chapterScope?: string) {
  const res = await fetch(`${BASE}/review/structured`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, chapterScope }),
  });
  return res.json();
}

// ── Anti-AI API ──
export async function detectAntiAi(projectPath: string, content?: string, chapterScope?: string) {
  const res = await fetch(`${BASE}/anti-ai/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, content, chapterScope }),
  });
  return res.json();
}

export async function detectAntiAiDeep(projectPath: string, content?: string, chapterScope?: string) {
  const res = await fetch(`${BASE}/anti-ai/deep-detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, content, chapterScope }),
  });
  return res.json();
}

export async function detectAntiAiGPTZero(projectPath: string, content?: string, chapterScope?: string) {
  const res = await fetch(`${BASE}/anti-ai/gptzero-detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, content, chapterScope }),
  });
  return res.json();
}

// ── Pipeline API ──
export async function listPipelineTypes() {
  const res = await fetch(`${BASE}/pipeline/types`);
  return res.json();
}

export async function startPipeline(pipelineType: string, projectPath: string, chapterScope?: string) {
  const res = await fetch(`${BASE}/pipeline/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipelineType, projectPath, chapterScope }),
  });
  return res.json();
}

export async function getPipelineStatus(pipelineId: string) {
  const res = await fetch(`${BASE}/pipeline/${pipelineId}`);
  return res.json();
}

export async function runPipelineStage(pipelineId: string) {
  const res = await fetch(`${BASE}/pipeline/${pipelineId}/run-stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function advancePipeline(pipelineId: string, approved: boolean, feedback?: string) {
  const res = await fetch(`${BASE}/pipeline/${pipelineId}/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved, feedback }),
  });
  return res.json();
}

// ── Pipeline V2 API ──

export interface PipelinePreset {
  id: string;
  name: string;
  description: string;
  stageCount: number;
  stages: { name: string; type: string; description: string }[];
}

export interface PipelineStageV2 {
  name: string;
  type: 'ai' | 'compute' | 'human' | 'citation' | 'compile';
  description: string;
  config: Record<string, any>;
  index: number;
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';
  output: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, any>;
}

export interface PipelineV2 {
  id: string;
  name: string;
  description: string;
  projectId: string;
  projectPath: string;
  stages: PipelineStageV2[];
  currentStage: number;
  status: 'created' | 'running' | 'waiting' | 'paused' | 'completed' | 'failed';
  chapterScope: string | null;
  createdAt: string;
  updatedAt: string;
  outputs: Record<string, string>;
  errors: { stage: string; error: string }[];
}

export async function listPipelinePresets(): Promise<{ presets: PipelinePreset[] }> {
  const res = await fetch(`${BASE}/v2/pipeline/presets`);
  return res.json();
}

export async function startPipelineV2(preset: string, projectPath: string, chapterScope?: string): Promise<PipelineV2> {
  const res = await fetch(`${BASE}/v2/pipeline/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset, projectPath, chapterScope }),
  });
  return res.json();
}

export async function getPipelineV2Status(pipelineId: string): Promise<PipelineV2> {
  const res = await fetch(`${BASE}/v2/pipeline/${pipelineId}`);
  return res.json();
}

export async function runPipelineV2Stage(pipelineId: string) {
  const res = await fetch(`${BASE}/v2/pipeline/${pipelineId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function resolvePipelineV2(pipelineId: string, action: string, feedback?: string) {
  const res = await fetch(`${BASE}/v2/pipeline/${pipelineId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, feedback }),
  });
  return res.json();
}

export async function retryPipelineV2(pipelineId: string, feedback?: string) {
  const res = await fetch(`${BASE}/v2/pipeline/${pipelineId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback }),
  });
  return res.json();
}

export async function skipPipelineV2Stage(pipelineId: string) {
  const res = await fetch(`${BASE}/v2/pipeline/${pipelineId}/skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function pausePipelineV2(pipelineId: string) {
  const res = await fetch(`${BASE}/v2/pipeline/${pipelineId}/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function resumePipelineV2(pipelineId: string) {
  const res = await fetch(`${BASE}/v2/pipeline/${pipelineId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}
