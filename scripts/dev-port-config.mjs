import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';

const defaultWebPort = '3100';
const defaultServerPort = '3200';

function validatePort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${name} is invalid. Expected a port number between 1 and 65535, got: ${value}`,
    );
  }
}

export function loadRootEnv(cwd = process.cwd()) {
  loadDotenv({
    path: resolve(cwd, '.env'),
    override: false,
  });
}

export function resolvePortDefaults(env) {
  const webPort = env.WEB_PORT?.trim() || defaultWebPort;
  const serverPort = env.SERVER_PORT?.trim() || defaultServerPort;

  if (env.WEB_PORT?.trim()) {
    validatePort(webPort, 'WEB_PORT');
  }
  if (env.SERVER_PORT?.trim()) {
    validatePort(serverPort, 'SERVER_PORT');
  }

  return {
    webPort,
    serverPort,
  };
}

export function resolveReadmeUrls(env) {
  const { webPort, serverPort } = resolvePortDefaults(env);

  return {
    baseUrl: env.README_BASE_URL ?? `http://localhost:${webPort}`,
    apiBaseUrl: env.README_API_URL ?? `http://127.0.0.1:${serverPort}`,
  };
}
