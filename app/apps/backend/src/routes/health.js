import { constants as fsConstants, promises as fs, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import unzipper from 'unzipper';
import {
  readTemplateManifest,
  installTemplateFromStaging,
  validateTemplateId,
  validateTemplateCatalog,
} from '../services/templateService.js';
import { DATA_DIR, TEMPLATE_DIR, TEMPLATE_MANIFEST } from '../config/constants.js';
import { BUILD_INFO } from '../config/buildInfo.js';
import { ensureDir } from '../utils/fsUtils.js';
import { sanitizeUploadPath } from '../utils/pathSecurity.js';
import { safeJoin } from '../utils/pathSecurity.js';
 
async function defaultReadinessCheck() {
  const checks = { dataRoot: false, templates: false };
  const diagnostics = {};
  try {
    await fs.access(DATA_DIR, fsConstants.R_OK | fsConstants.W_OK);
    checks.dataRoot = true;
  } catch { /* reported below */ }
  try {
    await validateTemplateCatalog();
    checks.templates = true;
  } catch (error) {
    diagnostics.templates = { code: error.code || 'TEMPLATE_MANIFEST_INVALID', message: error.message };
  }
  return { ready: Object.values(checks).every(Boolean), checks, diagnostics };
}

export function registerHealthRoutes(fastify, options = {}) {
  const buildInfo = options.buildInfo || BUILD_INFO;
  const readinessCheck = options.readinessCheck || defaultReadinessCheck;
  fastify.get('/api/health', async () => ({
    ok: true,
    authRequired: Boolean(process.env.OPENPRISM_API_TOKEN),
    build: {
      id: buildInfo.buildId,
      version: buildInfo.version,
      builtAt: buildInfo.builtAt,
      backendStartedAt: buildInfo.backendStartedAt,
      apiSchemaVersion: buildInfo.apiSchemaVersion,
    },
  }));

  fastify.get('/api/ready', async (_request, reply) => {
    const status = await readinessCheck();
    if (!status.ready) reply.code(503);
    return status;
  });
 
  fastify.get('/api/templates', async () => {
    const { templates, categories } = await readTemplateManifest();
    return { templates, categories };
  });
 
  fastify.post('/api/templates/upload', async (req, reply) => {
    await ensureDir(TEMPLATE_DIR);
    let templateId = '';
    let templateLabel = '';
    let hasZip = false;
    let stagingRoot = '';
 
    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'templateId') {
          try {
            templateId = validateTemplateId(part.value);
          } catch (error) {
            return reply.code(400).send({ ok: false, error: error.message });
          }
          continue;
        }
        if (part.type === 'field' && part.fieldname === 'templateLabel') {
          templateLabel = String(part.value || '').trim();
          continue;
        }
        if (part.type !== 'file') continue;
        if (!templateId) {
          return reply.code(400).send({ ok: false, error: 'templateId is required before file.' });
        }
        hasZip = true;
        stagingRoot = await fs.mkdtemp(path.join(TEMPLATE_DIR, '.upload-'));
 
        const zipStream = part.file.pipe(unzipper.Parse({ forceStream: true }));
        for await (const entry of zipStream) {
          const relPath = sanitizeUploadPath(entry.path);
          if (!relPath) { entry.autodrain(); continue; }
          const abs = safeJoin(stagingRoot, relPath);
          if (entry.type === 'Directory') {
            await ensureDir(abs);
            entry.autodrain();
            continue;
          }
          await ensureDir(path.dirname(abs));
          await pipeline(entry, createWriteStream(abs));
        }
      }
    } catch (err) {
      if (stagingRoot) await fs.rm(stagingRoot, { recursive: true, force: true });
      return reply.code(500).send({ ok: false, error: String(err) });
    }
 
    if (!hasZip || !templateId) {
      return reply.code(400).send({ ok: false, error: 'Missing templateId or zip file.' });
    }
 
    try {
      const installed = await installTemplateFromStaging({
        templateId,
        templateLabel,
        stagingRoot,
      });
      stagingRoot = '';
      return { ok: true, templateId, mainFile: installed.mainFile };
    } catch (error) {
      if (stagingRoot) await fs.rm(stagingRoot, { recursive: true, force: true });
      return reply.code(error.statusCode || 500).send({ ok: false, error: error.message, code: error.code });
    }
  });
}
 
