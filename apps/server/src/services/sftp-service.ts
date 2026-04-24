import { readFileSync } from "node:fs";

import { Client } from "ssh2";
import type { Attributes, SFTPWrapper } from "ssh2";

import type {
  FileEntry,
  FilePreviewResponse,
  ListFilesResponse,
  SshTarget,
} from "@agent-orchestrator/shared";

import {
  assertSafeFilesystemPath,
  detectFileEntryType,
  formatPermissions,
  guessMimeType,
  isBinaryBuffer,
  joinRemotePath,
} from "./file-system-utils.js";

interface PooledConnection {
  client: Client;
  homePath: Promise<string>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

function createConnectionKey(target: SshTarget): string {
  const username = target.username ?? "default";
  const port = target.port ?? 22;
  const identityFile = target.identityFile ?? "";
  return `${username}@${target.host}:${port}:${identityFile}`;
}

function attrsToFileEntry(
  basePath: string,
  name: string,
  attrs: Attributes,
  longname?: string,
): FileEntry {
  const typeFromLongname = longname?.startsWith("d")
    ? "directory"
    : longname?.startsWith("l")
      ? "symlink"
      : undefined;
  const type = typeFromLongname ?? detectFileEntryType(attrs.mode ?? 0);
  const modifiedAt = new Date(((attrs.mtime ?? 0) || 0) * 1000).toISOString();

  return {
    name,
    path: joinRemotePath(basePath, name),
    type,
    size: type === "directory" ? 0 : (attrs.size ?? 0),
    modifiedAt,
    permissions: formatPermissions(attrs.mode ?? 0, type),
    isHidden: name.startsWith("."),
  };
}

function withSftp<T>(
  client: Client,
  callback: (sftp: SFTPWrapper) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error);
        return;
      }

      callback(sftp)
        .then((result) => {
          sftp.end();
          resolve(result);
        })
        .catch((error) => {
          sftp.end();
          reject(error);
        });
    });
  });
}

function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(sftp);
    });
  });
}

function sftpStat(sftp: SFTPWrapper, remotePath: string): Promise<Attributes> {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (error, stats) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stats);
    });
  });
}

function sftpReaddir(
  sftp: SFTPWrapper,
  remotePath: string,
): Promise<Array<{ filename: string; longname: string; attrs: Attributes }>> {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (error, items) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(items ?? []);
    });
  });
}

function sftpMkdir(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sftpRename(
  sftp: SFTPWrapper,
  fromPath: string,
  toPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(fromPath, toPath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sftpUnlink(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sftpRmdir(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rmdir(remotePath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sftpChmod(
  sftp: SFTPWrapper,
  remotePath: string,
  mode: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.chmod(remotePath, mode, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export class SftpService {
  private readonly connections = new Map<string, PooledConnection>();

  constructor(
    private readonly clientFactory: () => Client = () => new Client(),
    private readonly idleTimeoutMs = 5 * 60 * 1000,
  ) {}

  async list(
    target: SshTarget,
    inputPath: string,
    showHidden = false,
  ): Promise<ListFilesResponse> {
    const remotePath = await this.resolveRemotePath(target, inputPath);

    return this.withConnection(target, async (client) =>
      withSftp(client, async (sftp) => {
        const items = await sftpReaddir(sftp, remotePath);
        const entries = items
          .map((item) =>
            attrsToFileEntry(
              remotePath,
              item.filename,
              item.attrs,
              item.longname,
            ),
          )
          .filter((entry) => showHidden || !entry.isHidden)
          .sort((left, right) => {
            if (left.type === "directory" && right.type !== "directory") {
              return -1;
            }

            if (left.type !== "directory" && right.type === "directory") {
              return 1;
            }

            return left.name.localeCompare(right.name);
          });

        return { path: remotePath, entries };
      }),
    );
  }

  async mkdir(target: SshTarget, inputPath: string): Promise<string> {
    const remotePath = await this.resolveRemotePath(target, inputPath);

    await this.withConnection(target, async (client) =>
      withSftp(client, (sftp) => sftpMkdir(sftp, remotePath)),
    );

    return remotePath;
  }

  async rename(
    target: SshTarget,
    fromPath: string,
    toPath: string,
  ): Promise<string> {
    const resolvedFromPath = await this.resolveRemotePath(target, fromPath);
    const resolvedToPath = await this.resolveRemotePath(target, toPath);

    await this.withConnection(target, async (client) =>
      withSftp(client, (sftp) =>
        sftpRename(sftp, resolvedFromPath, resolvedToPath),
      ),
    );

    return resolvedToPath;
  }

  async remove(target: SshTarget, inputPath: string): Promise<void> {
    const remotePath = await this.resolveRemotePath(target, inputPath);

    await this.withConnection(target, async (client) =>
      withSftp(client, async (sftp) => {
        await this.removePathRecursive(sftp, remotePath);
      }),
    );
  }

  async preview(
    target: SshTarget,
    inputPath: string,
    maxBytes = 64 * 1024,
  ): Promise<FilePreviewResponse> {
    const remotePath = await this.resolveRemotePath(target, inputPath);

    return this.withConnection(target, async (client) =>
      withSftp(client, async (sftp) => {
        const fileStats = await sftpStat(sftp, remotePath);
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(remotePath, {
          start: 0,
          end: Math.max(0, maxBytes - 1),
        });

        const buffer = await new Promise<Buffer>((resolve, reject) => {
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        });
        const binary = isBinaryBuffer(buffer);

        return {
          path: remotePath,
          content: binary ? buffer.toString("base64") : buffer.toString("utf8"),
          encoding: binary ? "binary" : "utf8",
          truncated: (fileStats.size ?? 0) > buffer.length,
          size: fileStats.size ?? buffer.length,
          mimeType: guessMimeType(remotePath),
        };
      }),
    );
  }

  async chmod(
    target: SshTarget,
    inputPath: string,
    mode: string,
  ): Promise<void> {
    assertSafeFilesystemPath(mode, "mode");
    const remotePath = await this.resolveRemotePath(target, inputPath);
    const parsedMode = Number.parseInt(mode, 8);

    await this.withConnection(target, async (client) =>
      withSftp(client, (sftp) => sftpChmod(sftp, remotePath, parsedMode)),
    );
  }

  async createReadStream(target: SshTarget, inputPath: string) {
    const remotePath = await this.resolveRemotePath(target, inputPath);
    const client = await this.getClient(target);
    this.touchConnection(target);
    const sftp = await openSftp(client);
    const stream = sftp.createReadStream(remotePath);
    const closeSftp = () => sftp.end();
    stream.once("close", closeSftp);
    stream.once("end", closeSftp);
    stream.once("error", closeSftp);
    return stream;
  }

  async createWriteStream(target: SshTarget, inputPath: string) {
    const remotePath = await this.resolveRemotePath(target, inputPath);
    const client = await this.getClient(target);
    this.touchConnection(target);
    const sftp = await openSftp(client);
    const stream = sftp.createWriteStream(remotePath);
    const closeSftp = () => sftp.end();
    stream.once("close", closeSftp);
    stream.once("finish", closeSftp);
    stream.once("error", closeSftp);
    return stream;
  }

  async resolveRemotePath(
    target: SshTarget,
    inputPath: string,
  ): Promise<string> {
    assertSafeFilesystemPath(inputPath);

    if (inputPath.startsWith("/")) {
      return inputPath;
    }

    if (!inputPath.startsWith("~")) {
      return inputPath;
    }

    const connection = await this.getConnection(target);
    const homePath = await connection.homePath;
    const suffix = inputPath === "~" ? "" : inputPath.replace(/^~\/?/, "");
    return suffix ? joinRemotePath(homePath, suffix) : homePath;
  }

  private async removePathRecursive(
    sftp: SFTPWrapper,
    remotePath: string,
  ): Promise<void> {
    const stats = await sftpStat(sftp, remotePath);
    const type = detectFileEntryType(stats.mode ?? 0);

    if (type !== "directory") {
      await sftpUnlink(sftp, remotePath);
      return;
    }

    const children = await sftpReaddir(sftp, remotePath);
    for (const child of children) {
      await this.removePathRecursive(
        sftp,
        joinRemotePath(remotePath, child.filename),
      );
    }

    await sftpRmdir(sftp, remotePath);
  }

  private async withConnection<T>(
    target: SshTarget,
    callback: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient(target);
    this.touchConnection(target);

    try {
      return await callback(client);
    } catch (error) {
      this.disposeConnection(target);
      throw error;
    }
  }

  private async getClient(target: SshTarget): Promise<Client> {
    const connection = await this.getConnection(target);
    this.touchConnection(target);
    return connection.client;
  }

  private async getConnection(target: SshTarget): Promise<PooledConnection> {
    const connectionKey = createConnectionKey(target);
    const existing = this.connections.get(connectionKey);
    if (existing) {
      return existing;
    }

    const client = this.clientFactory();
    const connection = {
      client,
      homePath: Promise.resolve(""),
      idleTimer: null,
    } satisfies PooledConnection;
    this.connections.set(connectionKey, connection);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("SFTP connection timed out"));
      }, 30_000);

      client
        .once("ready", () => {
          clearTimeout(timeout);
          resolve();
        })
        .once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        })
        .once("close", () => {
          this.disposeConnection(target);
        })
        .connect({
          host: target.host,
          port: target.port ?? 22,
          username: target.username,
          ...(target.identityFile
            ? { privateKey: readFileSync(target.identityFile) }
            : {}),
        });
    });

    connection.homePath = withSftp(
      client,
      (sftp) =>
        new Promise((resolve, reject) => {
          sftp.realpath(".", (error, resolvedPath) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(resolvedPath);
          });
        }),
    );
    this.touchConnection(target);
    return connection;
  }

  private touchConnection(target: SshTarget): void {
    const connection = this.connections.get(createConnectionKey(target));
    if (!connection) {
      return;
    }

    if (connection.idleTimer) {
      clearTimeout(connection.idleTimer);
    }

    connection.idleTimer = setTimeout(() => {
      this.disposeConnection(target);
    }, this.idleTimeoutMs);
    // unref(): the pooled SFTP idle-timeout must not keep the Node event
    // loop alive independently of the Fastify server. Otherwise a single
    // pooled connection leaks into `node --test` runs and blocks process
    // exit after all tests have completed. See memories/repo/e2e.md.
    connection.idleTimer.unref();
  }

  private disposeConnection(target: SshTarget): void {
    const connectionKey = createConnectionKey(target);
    const connection = this.connections.get(connectionKey);
    if (!connection) {
      return;
    }

    if (connection.idleTimer) {
      clearTimeout(connection.idleTimer);
    }

    connection.client.end();
    this.connections.delete(connectionKey);
  }
}
