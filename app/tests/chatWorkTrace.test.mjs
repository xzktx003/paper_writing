import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChatView } from '../apps/frontend/src/app/components/ChatView.tsx';
import i18n from '../apps/frontend/src/i18n/index.ts';
import {
  beginConversationTrace,
  finishConversationTrace,
  finishToolActivity,
  startToolActivity,
  updateConversationPhase,
} from '../apps/frontend/src/app/utils/conversationActivity.ts';
import {
  summarizeToolResult,
  summarizeToolUse,
} from '../apps/backend/src/services/aiActivityTrace.js';

describe('chat work trace', () => {
  it('renders a collapsed, accessible work-process disclosure instead of a bare Thinking label', () => {
    void i18n.changeLanguage('zh-CN');
    const activities = [
      {
        id: 'phase-1',
        kind: 'phase',
        status: 'running',
        title: 'Preparing context',
        startedAt: 1,
      },
    ];
    const html = renderToStaticMarkup(React.createElement(ChatView, {
      messages: [],
      loading: true,
      activities,
    }));

    expect(html).toContain('工作过程');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('1 个步骤');
    expect(html).toContain('正在准备上下文');
    expect(html).not.toContain('Thinking...');
  });

  it('tracks phase changes and pairs tool results with the running tool step', () => {
    let trace = beginConversationTrace(100);
    trace = updateConversationPhase(trace, 'response', 200);
    trace = startToolActivity(trace, 'tool-1', 'read_project_file', { detail: 'sec/method.tex' }, 300);
    trace = finishToolActivity(trace, 'read_project_file', { detail: '读取完成（正文未展示）' }, 450);
    trace = finishConversationTrace(trace, 500);

    expect(trace.some(item => item.title === 'Waiting for AI response')).toBe(true);
    const tool = trace.find(item => item.id === 'tool-1');
    expect(tool).toMatchObject({ status: 'success', toolName: 'read_project_file' });
    expect(tool.resultDetail).toBe('读取完成（正文未展示）');
    expect(trace.at(-1)).toMatchObject({ status: 'success', title: 'Answer completed' });
  });
});

describe('AI activity trace redaction', () => {
  it('never streams raw tool inputs or results from the AI route', () => {
    const source = readFileSync(new URL('../apps/backend/src/routes/ai.js', import.meta.url), 'utf8');
    expect(source).not.toContain("sendEvent('tool_use', { name, input })");
    expect(source).not.toContain("result.slice(0, 2000)");
    expect(source).toContain('summarizeToolUse(name, input)');
    expect(source).toContain('summarizeToolResult(name, result)');
  });

  it('redacts credentials and omits full edit/file contents from tool summaries', () => {
    const useSummary = summarizeToolUse('propose_edit', {
      filename: 'sec/method.tex',
      new_content: 'SECRET PAPER BODY',
      apiKey: 'sk-super-secret',
      authorization: 'Bearer private-token',
    });
    const resultSummary = summarizeToolResult('read_project_file', 'SECRET PAPER BODY\n' + 'x'.repeat(5000));

    expect(JSON.stringify(useSummary)).toContain('sec/method.tex');
    expect(JSON.stringify(useSummary)).not.toContain('SECRET PAPER BODY');
    expect(JSON.stringify(useSummary)).not.toContain('sk-super-secret');
    expect(JSON.stringify(useSummary)).not.toContain('private-token');
    expect(JSON.stringify(resultSummary)).not.toContain('SECRET PAPER BODY');
    expect(JSON.stringify(resultSummary).length).toBeLessThan(500);
  });

  it('redacts secret-looking values in unknown tool payloads', () => {
    const summary = summarizeToolUse('custom_tool', {
      query: 'safe query',
      password: 'dont-show-me',
      nested: { token: 'abc123', note: 'visible' },
    });

    const text = JSON.stringify(summary);
    expect(text).toContain('safe query');
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain('dont-show-me');
    expect(text).not.toContain('abc123');
  });
});
