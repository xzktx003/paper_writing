import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";

import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

import type {
  ChmodInput,
  FileOperationInput,
  FilePreviewInput,
  FileUploadResponse,
  ListFilesInput,
  SshTarget,
} from "@agent-orchestrator/shared";

import { LocalFsService } from "../services/local-fs-service.js";
import { SftpService } from "../services/sftp-service.js";

interface FilesystemRouteOptions {
  localFsService: LocalFsService;
  sftpService: SftpService;
}

function parseMaybeSshTarget(value: string | undefined): SshTarget | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as SshTarget;
}

function resolveDefaultLocalPath(): string {
  if (process.env.FILE_BROWSER_DEFAULT_LOCAL_PATH) {
    return process.env.FILE_BROWSER_DEFAULT_LOCAL_PATH;
  }

  let currentPath = process.cwd();
  while (currentPath !== path.dirname(currentPath)) {
    if (existsSync(path.join(currentPath, "pnpm-workspace.yaml"))) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return process.cwd();
}

function getErrorStatusCode(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("no such file") ||
    message.includes("ENOENT") ||
    message.includes("not found")
  ) {
    return 404;
  }

  if (
    message.includes("permission denied") ||
    message.includes("EACCES") ||
    message.includes("EPERM")
  ) {
    return 403;
  }

  if (message.includes("cannot contain")) {
    return 400;
  }

  return 500;
}

export async function registerFilesystemRoutes(
  fastify: FastifyInstance,
  { localFsService, sftpService }: FilesystemRouteOptions,
): Promise<void> {
  await fastify.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024,
    },
  });

  fastify.post<{ Body: ListFilesInput }>(
    "/api/fs/list",
    async (request, reply) => {
      const requestedPath = request.body.path?.trim()
        ? request.body.path
        : request.body.sshTarget
          ? "~"
          : resolveDefaultLocalPath();

      try {
        if (request.body.sshTarget) {
          return await sftpService.list(
            request.body.sshTarget,
            requestedPath,
            request.body.showHidden,
          );
        }

        return await localFsService.list(
          requestedPath,
          request.body.showHidden,
        );
      } catch (error) {
        reply.code(getErrorStatusCode(error));
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  fastify.post<{ Body: FileOperationInput }>(
    "/api/fs/operation",
    async (request, reply) => {
      const { operation, path: targetPath, newPath, sshTarget } = request.body;

      try {
        if (operation === "mkdir") {
          const createdPath = sshTarget
            ? await sftpService.mkdir(sshTarget, targetPath)
            : await localFsService.mkdir(targetPath);
          return { ok: true, path: createdPath };
        }

        if (operation === "rename") {
          if (!newPath) {
            reply.code(400);
            return { error: "newPath is required for rename" };
          }

          const renamedPath = sshTarget
            ? await sftpService.rename(sshTarget, targetPath, newPath)
            : await localFsService.rename(targetPath, newPath);
          return { ok: true, path: renamedPath };
        }

        if (operation === "delete") {
          if (sshTarget) {
            await sftpService.remove(sshTarget, targetPath);
          } else {
            await localFsService.remove(targetPath);
          }

          return { ok: true };
        }

        reply.code(400);
        return { error: "Unsupported operation" };
      } catch (error) {
        reply.code(getErrorStatusCode(error));
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  fastify.post<{ Body: FilePreviewInput }>(
    "/api/fs/preview",
    async (request, reply) => {
      try {
        if (request.body.sshTarget) {
          return await sftpService.preview(
            request.body.sshTarget,
            request.body.path,
            request.body.maxBytes,
          );
        }

        return await localFsService.preview(
          request.body.path,
          request.body.maxBytes,
        );
      } catch (error) {
        reply.code(getErrorStatusCode(error));
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  fastify.post<{ Body: ChmodInput }>(
    "/api/fs/chmod",
    async (request, reply) => {
      try {
        if (request.body.sshTarget) {
          await sftpService.chmod(
            request.body.sshTarget,
            request.body.path,
            request.body.mode,
          );
        } else {
          await localFsService.chmod(request.body.path, request.body.mode);
        }

        return { ok: true };
      } catch (error) {
        reply.code(getErrorStatusCode(error));
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  fastify.post<{ Body: { path: string; sshTarget?: SshTarget } }>(
    "/api/fs/download",
    async (request, reply) => {
      try {
        const stream = request.body.sshTarget
          ? await sftpService.createReadStream(
              request.body.sshTarget,
              request.body.path,
            )
          : localFsService.createReadStream(request.body.path);

        const filename = path.basename(request.body.path);
        reply.header(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        reply.header("Content-Type", "application/octet-stream");
        return reply.send(stream);
      } catch (error) {
        reply.code(getErrorStatusCode(error));
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  fastify.post("/api/fs/upload", async (request, reply) => {
    const uploadedPaths: string[] = [];
    let targetDirectory: string | null = null;
    let overwritePath: string | null = null;
    let sshTarget: SshTarget | undefined;
    let relativePaths: string[] = [];
    let fileIndex = 0;

    try {
      for await (const part of request.parts()) {
        if (part.type === "field") {
          if (part.fieldname === "path") {
            targetDirectory = String(part.value);
          } else if (part.fieldname === "overwritePath") {
            overwritePath = String(part.value);
          } else if (part.fieldname === "sshTarget") {
            sshTarget = parseMaybeSshTarget(String(part.value));
          } else if (part.fieldname === "relativePaths") {
            relativePaths = JSON.parse(String(part.value));
          }
          continue;
        }

        if (!targetDirectory && !overwritePath) {
          reply.code(400);
          return { error: "Upload target path is required before files" };
        }

        let nextPath: string;
        if (overwritePath && uploadedPaths.length === 0) {
          nextPath = overwritePath;
        } else if (relativePaths.length > 0 && relativePaths[fileIndex]) {
          nextPath = path.join(targetDirectory ?? "", relativePaths[fileIndex]);
        } else {
          nextPath = path.join(targetDirectory ?? "", part.filename);
        }

        const parentDir = path.dirname(nextPath);
        if (parentDir && parentDir !== targetDirectory) {
          if (sshTarget) {
            await sftpService.ensureDirectory(sshTarget, parentDir);
          } else {
            await mkdir(localFsService.resolvePath(parentDir), { recursive: true });
          }
        }

        const output = sshTarget
          ? await sftpService.createWriteStream(sshTarget, nextPath)
          : localFsService.createWriteStream(nextPath);
        await pipeline(part.file, output);
        uploadedPaths.push(nextPath);
        fileIndex++;
      }

      const response: FileUploadResponse = { uploadedPaths };
      return response;
    } catch (error) {
      reply.code(getErrorStatusCode(error));
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
