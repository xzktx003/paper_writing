import type { SshTarget } from "@agent-orchestrator/shared";

export interface BuildSshArgsOptions {
  batchMode?: boolean;
  clearAllForwardings?: boolean;
  connectTimeoutSeconds?: number;
  remoteCommand?: string;
  requestTty?: boolean;
}

function assertSafeSshField(name: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  if (/\r|\n|\0/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
}

export function formatSshDestination(sshTarget: SshTarget): string {
  assertSafeSshField("host", sshTarget.host);
  assertSafeSshField("username", sshTarget.username);

  return sshTarget.username
    ? `${sshTarget.username}@${sshTarget.host}`
    : sshTarget.host;
}

export function buildSshArgs(
  sshTarget: SshTarget,
  options: BuildSshArgsOptions = {},
): string[] {
  assertSafeSshField("identity file", sshTarget.identityFile);
  assertSafeSshField("remote command", options.remoteCommand);

  const args: string[] = [];

  if (options.requestTty) {
    args.push("-t");
  }

  if (options.batchMode) {
    args.push("-o", "BatchMode=yes");
  }

  if (options.clearAllForwardings) {
    args.push("-o", "ClearAllForwardings=yes");
  }

  if (options.connectTimeoutSeconds) {
    args.push("-o", `ConnectTimeout=${options.connectTimeoutSeconds}`);
  }

  if (sshTarget.port) {
    args.push("-p", String(sshTarget.port));
  }

  if (sshTarget.identityFile) {
    args.push("-i", sshTarget.identityFile);
  }

  args.push(formatSshDestination(sshTarget));

  if (options.remoteCommand) {
    args.push(options.remoteCommand);
  }

  return args;
}
