import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import YAML from 'yaml';

const BASE = process.env.BACKEND_URL || 'http://localhost:8787';
const API_TOKEN = String(process.env.OPENPRISM_E2E_API_TOKEN || '').trim();
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input), BASE);
  if (!API_TOKEN || url.origin !== new URL(BASE).origin || !url.pathname.startsWith('/api/')) {
    return nativeFetch(input, init);
  }
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${API_TOKEN}`);
  return nativeFetch(input, { ...init, headers });
};

const ownsDataDir = !process.env.OPENPRISM_DATA_DIR;
const DATA_DIR = process.env.OPENPRISM_DATA_DIR || await mkdtemp(join(tmpdir(), 'paper-api-integration-'));

describe('Backend API Integration', () => {
  afterAll(async () => {
    if (ownsDataDir) await rm(DATA_DIR, { recursive: true, force: true });
  });
  describe('Health', () => {
    it('GET /api/health returns ok', async () => {
      const res = await fetch(`${BASE}/api/health`);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.build).toEqual(expect.objectContaining({
        id: expect.any(String),
        apiSchemaVersion: 2,
      }));
    });

    it('GET /api/ready reports deployment readiness separately from liveness', async () => {
      const res = await fetch(`${BASE}/api/ready`);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toMatchObject({ ready: true, checks: { dataRoot: true, templates: true } });
    });
  });

  describe('Config', () => {
    it('GET /api/config returns config object', async () => {
      const res = await fetch(`${BASE}/api/config`);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveProperty('claude_model');
      expect(data).toHaveProperty('claude_base_url');
    });
  });

  describe('Skills', () => {
    it('GET /api/skills returns array of skills', async () => {
      const res = await fetch(`${BASE}/api/skills`);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(20);
    });

    it('each skill has name, display_name, type', async () => {
      const res = await fetch(`${BASE}/api/skills`);
      const data = await res.json();
      for (const skill of data) {
        expect(skill.name).toBeTruthy();
        expect(skill.display_name).toBeTruthy();
        expect(skill.type).toBeTruthy();
      }
    });

    it('GET /api/skills/:name returns specific skill', async () => {
      const listResponse = await fetch(`${BASE}/api/skills`);
      const [expectedSkill] = await listResponse.json();
      expect(expectedSkill?.name).toBeTruthy();

      const res = await fetch(`${BASE}/api/skills/${encodeURIComponent(expectedSkill.name)}`);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.name).toBe(expectedSkill.name);
    });
  });

  describe('Legacy Paper Projects', () => {
    it('keeps absolute-path paper APIs disabled by default', async () => {
      const res = await fetch(`${BASE}/api/paper/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: join(DATA_DIR, 'legacy-disabled'),
          config: { title: 'Must not be created' },
        }),
      });
      expect(res.status).toBe(404);
      expect(existsSync(join(DATA_DIR, 'legacy-disabled'))).toBe(false);
    });
  });

  describe('Chapters', () => {
    let projectPath;

    beforeAll(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      projectPath = await mkdtemp(join(DATA_DIR, 'api-ch-test-'));
      await mkdir(join(projectPath, 'chapters'), { recursive: true });
      await writeFile(join(projectPath, 'chapters', 'ch1.md'), '# Chapter 1\n\nContent here.');
      await writeFile(join(projectPath, 'paper.yaml'), YAML.stringify({
        title: 'Chapter Test',
        chapters: [{ file: 'ch1.md', skills: [] }],
        global_skills: [],
      }));
    });

    afterAll(async () => {
      if (projectPath && existsSync(projectPath)) await rm(projectPath, { recursive: true, force: true });
    });

    it('POST /api/chapters/read reads chapter content', async () => {
      const res = await fetch(`${BASE}/api/chapters/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, filename: 'ch1.md' }),
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.content).toContain('Chapter 1');
    });

    it('POST /api/chapters/write saves chapter content', async () => {
      const res = await fetch(`${BASE}/api/chapters/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, filename: 'ch1.md', content: '# Updated\n\nNew content.' }),
      });
      expect(res.status).toBe(200);

      const readRes = await fetch(`${BASE}/api/chapters/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, filename: 'ch1.md' }),
      });
      const data = await readRes.json();
      expect(data.content).toContain('New content.');
    });

    it('POST /api/chapters/create adds new chapter', async () => {
      const res = await fetch(`${BASE}/api/chapters/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, filename: 'ch2.md' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Code Execution', () => {
    let projectPath;

    beforeAll(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      projectPath = await mkdtemp(join(DATA_DIR, 'api-code-test-'));
      await mkdir(join(projectPath, 'code'), { recursive: true });
    });

    afterAll(async () => {
      if (projectPath && existsSync(projectPath)) await rm(projectPath, { recursive: true, force: true });
    });

    it('POST /api/code/exec rejects a request that omits the isolated server token', async () => {
      const res = await nativeFetch(`${BASE}/api/code/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, command: 'echo "test output"' }),
      });
      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error).toMatch(/authentication/i);
    });
  });

  describe('Conversations', () => {
    let projectId;

    beforeAll(async () => {
      const response = await fetch(`${BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Conversation Integration ${Date.now()}` }),
      });
      expect(response.status).toBe(200);
      projectId = (await response.json()).id;
    });

    afterAll(async () => {
      if (projectId) await fetch(`${BASE}/api/projects/${projectId}/permanent`, { method: 'DELETE' });
    });

    it('POST /api/conversations/:projectId creates conversation', async () => {
      const res = await fetch(`${BASE}/api/conversations/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'API Test Conv',
          context_scope: { type: 'free' },
          mode: 'chat',
        }),
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.id).toBeTruthy();
      expect(data.name).toBe('API Test Conv');
    });

    it('GET /api/conversations/:projectId lists conversations', async () => {
      const res = await fetch(`${BASE}/api/conversations/${projectId}`);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
