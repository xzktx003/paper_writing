import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../', import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, repoRoot), 'utf8');
}

describe('Paper Writer production lifecycle contract', () => {
  it('loads root and app env files through one shared helper', async () => {
    const helper = await source('scripts/load-openprism-env.sh');
    const launcher = await source('scripts/run-server.sh');
    const restart = await source('scripts/restart.sh');

    expect(helper).toContain('"$openprism_repo_root/.env" "$openprism_repo_root/app/.env"');
    expect(launcher).toContain('load-openprism-env.sh');
    expect(launcher).toContain('load_openprism_env "$ROOT_DIR"');
    expect(restart).toContain('load-openprism-env.sh');
    expect(restart).toContain('load_openprism_env "$REPO_ROOT"');
  });

  it('builds before stopping and restarts the single supervisor instead of a competing node', async () => {
    const restart = await source('scripts/restart.sh');
    expect(restart.indexOf('Building frontend...')).toBeLessThan(restart.indexOf('Stopping existing supervisor and backend...'));
    expect(restart).toContain('nohup setsid bash "$REPO_ROOT/scripts/run-server.sh"');
    expect(restart).not.toContain('nohup setsid node src/index.js');
    expect(restart.indexOf('run-server\\.sh')).toBeLessThan(restart.indexOf('node.*src/index.js'));
  });

  it('verifies readiness, schema and the exact build id after restart', async () => {
    const restart = await source('scripts/restart.sh');
    expect(restart).toContain('/api/ready');
    expect(restart).toContain("health.build?.id !== expected");
    expect(restart).toContain("health.build?.apiSchemaVersion !== 2");
    expect(restart).toContain('!ready.ready');
  });

  it('tracks and stops the supervised backend cleanly', async () => {
    const launcher = await source('scripts/run-server.sh');
    expect(launcher).toContain('printf \'%s\\n\' "$$" > "$PID_FILE"');
    expect(launcher).toContain('trap request_stop TERM INT');
    expect(launcher).toContain('stop_backend');
    expect(launcher).toContain('Refusing to start a second supervisor');
  });

  it('keeps both shell scripts syntactically valid', () => {
    execFileSync('bash', ['-n', new URL('../../scripts/run-server.sh', import.meta.url).pathname]);
    execFileSync('sh', ['-n', new URL('../../scripts/restart.sh', import.meta.url).pathname]);
  });
});
