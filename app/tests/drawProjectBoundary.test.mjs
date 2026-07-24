import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const roots = new Map();
vi.mock('../apps/backend/src/services/projectLocator.js', () => ({
  getProjectRoot: vi.fn(async (id) => roots.get(id) || path.join(tmpdir(), 'missing-managed-project')),
}));

const { registerDrawRoutes } = await import('../apps/backend/src/routes/draw.js');

let tempRoot;
let projectRoot;
let app;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'paper-draw-boundary-'));
  projectRoot = path.join(tempRoot, 'human-readable-directory');
  await mkdir(path.join(projectRoot, 'draw'), { recursive: true });
  await writeFile(path.join(projectRoot, 'project.json'), JSON.stringify({ id: 'managed-id', name: 'Visible name' }));
  await writeFile(path.join(projectRoot, 'draw', 'inside.png'), Buffer.from('inside'));
  await writeFile(path.join(tempRoot, 'outside.png'), Buffer.from('outside'));
  roots.set('managed-id', projectRoot);

  app = Fastify();
  await app.register(multipart);
  await registerDrawRoutes(app, {
    appConfig: {
      draw_image_api_key: 'server-only-key',
      draw_image_model: 'server-image-model',
      draw_image_api_base: 'https://draw.example.test/v1',
    },
  });
  await app.ready();
});

afterEach(async () => {
  roots.clear();
  await app?.close();
  await rm(tempRoot, { recursive: true, force: true });
});

describe('Draw managed-project boundary', () => {
  it('requires projectId and rejects legacy projectName routing', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/draw/list-images' });
    expect(missing.statusCode).toBe(400);
    const legacy = await app.inject({ method: 'GET', url: '/api/draw/list-images?projectName=human-readable-directory' });
    expect(legacy.statusCode).toBe(400);

    expect((await app.inject({
      method: 'POST',
      url: '/api/draw/generate-image',
      payload: { imagePrompt: 'figure', projectName: 'human-readable-directory' },
    })).statusCode).toBe(400);
    expect((await app.inject({
      method: 'POST',
      url: '/api/draw/edit-image',
      payload: { imagePath: 'inside.png', editPrompt: 'change it', projectName: 'human-readable-directory' },
    })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/draw/images/inside.png?projectName=human-readable-directory' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/draw/download/inside.png?projectName=human-readable-directory' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/draw/upload-image?projectName=human-readable-directory' })).statusCode).toBe(400);
  });

  it('does not accept a client-supplied image API key when the server has none', async () => {
    const isolated = Fastify();
    await isolated.register(multipart);
    await registerDrawRoutes(isolated, { appConfig: {}, getProjectRoot: async () => projectRoot });
    await isolated.ready();
    const response = await isolated.inject({
      method: 'POST',
      url: '/api/draw/generate-image',
      payload: {
        projectId: 'managed-id',
        imagePrompt: 'academic diagram',
        apiSettings: { apiKey: 'browser-supplied-key' },
      },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain('服务器配置');
    await isolated.close();
  });

  it('resolves a managed id through project metadata and lists only project-contained images', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/draw/list-images?projectId=managed-id' });
    expect(response.statusCode).toBe(200);
    expect(response.json().images).toEqual([
      expect.objectContaining({ path: 'draw/inside.png', url: '/api/draw/images/draw%2Finside.png?projectId=managed-id' }),
    ]);
  });

  it('rejects mismatched project.json identity and traversal paths', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/draw/list-images?projectId=..%2Foutside' })).statusCode).toBe(400);
    await writeFile(path.join(projectRoot, 'project.json'), JSON.stringify({ id: 'different-id' }));
    expect((await app.inject({ method: 'GET', url: '/api/draw/list-images?projectId=managed-id' })).statusCode).toBe(404);

    await writeFile(path.join(projectRoot, 'project.json'), JSON.stringify({ id: 'managed-id' }));
    const traversal = await app.inject({ method: 'GET', url: '/api/draw/images/..%2Foutside.png?projectId=managed-id' });
    expect(traversal.statusCode).toBe(400);
  });

  it('serves and downloads files only from the managed project root', async () => {
    const image = await app.inject({ method: 'GET', url: '/api/draw/images/draw%2Finside.png?projectId=managed-id' });
    expect(image.statusCode).toBe(200);
    expect(image.rawPayload.toString()).toBe('inside');

    const download = await app.inject({ method: 'GET', url: '/api/draw/download/draw%2Finside.png?projectId=managed-id' });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain('inside.png');
  });

  it('uses the exact editable image prompt and current runtime image configuration', async () => {
    const imageGenerator = vi.fn(async (input) => ({ sourceUrl: null, buffer: Buffer.from('generated') }));
    const runtimeConfig = {
      llm_api_key: 'shared-key',
      llm_base_url: 'http://10.40.0.2/v1',
      draw_image_model: 'gpt-image-2',
      draw_image_use_llm_credentials: true,
    };
    const isolated = Fastify();
    await isolated.register(multipart);
    await registerDrawRoutes(isolated, {
      appConfig: runtimeConfig,
      getProjectRoot: async () => projectRoot,
      imageGenerator,
    });
    await isolated.ready();
    const response = await isolated.inject({
      method: 'POST',
      url: '/api/draw/generate-image',
      payload: {
        projectId: 'managed-id',
        imagePrompt: 'USER EDITED FINAL PROMPT',
        paperContent: 'must not be appended automatically',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(imageGenerator).toHaveBeenCalledWith({
      apiBase: 'http://10.40.0.2/v1',
      apiKey: 'shared-key',
      model: 'gpt-image-2',
      prompt: 'USER EDITED FINAL PROMPT',
    });
    expect(response.json().prompt).toBe('USER EDITED FINAL PROMPT');
    await isolated.close();
  });
});
