import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_SCHEMA_VERSION = 2;

const configDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BUILD_METADATA_PATH = path.resolve(configDir, '..', '..', '.openprism-build.json');

export function loadBuildInfo({
  metadataPath = DEFAULT_BUILD_METADATA_PATH,
  env = process.env,
  now = () => new Date(),
} = {}) {
  let metadata = {};
  try {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  } catch {
    // Development and first-run environments may not have a production build artifact yet.
  }
  return {
    buildId: String(env.OPENPRISM_BUILD_ID || metadata.buildId || 'development'),
    builtAt: String(metadata.builtAt || ''),
    version: String(metadata.version || '0.1.0'),
    apiSchemaVersion: Number(metadata.apiSchemaVersion) || API_SCHEMA_VERSION,
    backendStartedAt: now().toISOString(),
  };
}

export const BUILD_INFO = Object.freeze(loadBuildInfo());
