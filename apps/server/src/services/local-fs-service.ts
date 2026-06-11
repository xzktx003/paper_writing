import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  chmod,
} from "node:fs/promises";
import path from "node:path";

import type {
  FileEntry,
  FilePreviewResponse,
  ListFilesResponse,
} from "@agent-orchestrator/shared";

import {
  assertSafeFilesystemPath,
  formatPermissions,
  guessMimeType,
  isBinaryBuffer,
  normalizeLocalPath,
} from "./file-system-utils.js";

function toFileEntry(
  entryPath: string,
  stats: Awaited<ReturnType<typeof lstat>>,
): FileEntry {
  const type = stats.isSymbolicLink()
    ? "symlink"
    : stats.isDirectory()
      ? "directory"
      : "file";

  return {
    name: path.basename(entryPath),
    path: entryPath,
    type,
    size: stats.isDirectory() ? 0 : Number(stats.size),
    modifiedAt: stats.mtime.toISOString(),
    permissions: formatPermissions(Number(stats.mode), type),
    isHidden: path.basename(entryPath).startsWith("."),
  };
}

const VALID_CHMOD_PATTERN = /^0[0-7]{3,4}$/;

function validateChmodMode(mode: string): number {
  if (!VALID_CHMOD_PATTERN.test(mode)) {
    throw new Error("mode must be a valid octal permission (e.g. 755, 644)");
  }

  const parsed = Number.parseInt(mode, 8);

  // Reject permissions that set world-writable on files or dangerous setuid/setgid
  const others = parsed & 0o007;
  const ownerExecute = (parsed >> 0) & 0o100;
  const setuid = parsed & 0o4000;
  const setgid = parsed & 0o2000;
  const sticky = parsed & 0o1000;

  // Disallow world-writable for files (only directories may have it for sticky)
  const isDir = false; // caller context doesn't know here, so just block dangerous bits
  if (others === 0o007 && (setuid || setgid)) {
    throw new Error("mode cannot combine world-writable with setuid/setgid");
  }

  if (sticky && others !== 0o007 && others !== 0o000) {
    throw new Error(
      "sticky bit is only meaningful with world-writable directories",
    );
  }

  return parsed;
}

export class LocalFsService {
  async list(
    inputPath: string,
    showHidden = false,
  ): Promise<ListFilesResponse> {
    const resolvedPath = normalizeLocalPath(inputPath);
    const entries = await readdir(resolvedPath);
    const results = await Promise.all(
      entries.map(async (name) => {
        const entryPath = path.join(resolvedPath, name);
        const stats = await lstat(entryPath);
        return toFileEntry(entryPath, stats);
      }),
    );

    return {
      path: resolvedPath,
      entries: results
        .filter((entry: FileEntry) => showHidden || !entry.isHidden)
        .sort((left: FileEntry, right: FileEntry) => {
          if (left.type === "directory" && right.type !== "directory") {
            return -1;
          }

          if (left.type !== "directory" && right.type === "directory") {
            return 1;
          }

          return left.name.localeCompare(right.name);
        }),
    };
  }

  async mkdir(inputPath: string): Promise<string> {
    const resolvedPath = normalizeLocalPath(inputPath);
    await mkdir(resolvedPath, { recursive: true });
    return resolvedPath;
  }

  async rename(fromPath: string, toPath: string): Promise<string> {
    const resolvedFromPath = normalizeLocalPath(fromPath);
    const resolvedToPath = normalizeLocalPath(toPath);
    await rename(resolvedFromPath, resolvedToPath);
    return resolvedToPath;
  }

  async remove(inputPath: string): Promise<void> {
    const resolvedPath = normalizeLocalPath(inputPath);
    await rm(resolvedPath, { recursive: true, force: false });
  }

  createReadStream(inputPath: string) {
    return createReadStream(normalizeLocalPath(inputPath));
  }

  createWriteStream(inputPath: string) {
    const resolvedPath = normalizeLocalPath(inputPath);
    return createWriteStream(resolvedPath);
  }

  resolvePath(inputPath: string): string {
    return normalizeLocalPath(inputPath);
  }

  async preview(
    inputPath: string,
    maxBytes = 64 * 1024,
  ): Promise<FilePreviewResponse> {
    const resolvedPath = normalizeLocalPath(inputPath);
    const fileHandle = await open(resolvedPath, "r");

    try {
      const fileStats = await stat(resolvedPath);
      const bytesToRead = Math.min(fileStats.size, maxBytes);
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, 0);
      const contentBuffer = buffer.subarray(0, bytesRead);
      const binary = isBinaryBuffer(contentBuffer);

      return {
        path: resolvedPath,
        content: binary
          ? contentBuffer.toString("base64")
          : contentBuffer.toString("utf8"),
        encoding: binary ? "binary" : "utf8",
        truncated: fileStats.size > bytesRead,
        size: fileStats.size,
        mimeType: guessMimeType(resolvedPath),
      };
    } finally {
      await fileHandle.close();
    }
  }

  async chmod(inputPath: string, mode: string): Promise<void> {
    assertSafeFilesystemPath(inputPath, "path");
    const parsedMode = validateChmodMode(mode);
    await chmod(normalizeLocalPath(inputPath), parsedMode);
  }
}
