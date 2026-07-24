export const EXPECTED_API_SCHEMA_VERSION = 2;

export interface HealthBuildInfo {
  id?: string;
  apiSchemaVersion?: number;
}

export interface HealthResponse {
  ok?: boolean;
  build?: HealthBuildInfo;
}

export type DeploymentCompatibility = {
  compatible: boolean;
  reason: 'compatible' | 'missing-build-metadata' | 'build-id-mismatch' | 'api-schema-mismatch';
};

export function evaluateDeploymentCompatibility(
  frontendBuildId: string,
  health: HealthResponse,
): DeploymentCompatibility {
  if (!health?.build?.id || !Number.isFinite(Number(health.build.apiSchemaVersion))) {
    return { compatible: false, reason: 'missing-build-metadata' };
  }
  if (Number(health.build.apiSchemaVersion) !== EXPECTED_API_SCHEMA_VERSION) {
    return { compatible: false, reason: 'api-schema-mismatch' };
  }
  if (health.build.id !== frontendBuildId) {
    return { compatible: false, reason: 'build-id-mismatch' };
  }
  return { compatible: true, reason: 'compatible' };
}
