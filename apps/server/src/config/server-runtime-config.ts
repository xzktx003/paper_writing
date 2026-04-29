export type ServerRuntimeConfig = {
  host: string;
  port: number;
};

function parsePort(value: string | undefined): number {
  const normalized = value?.trim();
  if (!normalized) {
    return 3200;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      "SERVER_PORT must be a positive integer between 1 and 65535",
    );
  }

  return parsed;
}

function resolvePortValue(env: NodeJS.ProcessEnv): string | undefined {
  const explicitServerPort = env.SERVER_PORT?.trim();
  if (explicitServerPort) {
    return explicitServerPort;
  }

  return env.PORT?.trim();
}

export function resolveServerRuntimeConfig(
  env: NodeJS.ProcessEnv,
): ServerRuntimeConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: parsePort(resolvePortValue(env)),
  };
}
