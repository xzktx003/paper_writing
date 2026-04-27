import type { OpenVsCodeWebResponse } from "@agent-orchestrator/shared";

export interface VsCodeWebEntry {
  needsServerCheck: boolean;
  reloadKey: number;
  response: OpenVsCodeWebResponse;
}

function isSameResponse(
  left: OpenVsCodeWebResponse,
  right: OpenVsCodeWebResponse,
): boolean {
  return (
    left.url === right.url &&
    left.provider === right.provider &&
    left.workingDirectory === right.workingDirectory
  );
}

export function createCachedVsCodeWebEntry(
  response: OpenVsCodeWebResponse,
): VsCodeWebEntry {
  return {
    needsServerCheck: true,
    reloadKey: 0,
    response,
  };
}

export function shouldEnsureVsCodeWebOnOpen(
  current: VsCodeWebEntry | null,
): boolean {
  return current === null || current.needsServerCheck;
}

export function applyVsCodeWebOpenResponse(
  current: VsCodeWebEntry | null,
  response: OpenVsCodeWebResponse,
): VsCodeWebEntry {
  if (!current) {
    return {
      needsServerCheck: false,
      reloadKey: 0,
      response,
    };
  }

  if (isSameResponse(current.response, response)) {
    if (!current.needsServerCheck) {
      return current;
    }

    return {
      needsServerCheck: false,
      reloadKey: current.reloadKey + 1,
      response,
    };
  }

  return {
    needsServerCheck: false,
    reloadKey: current.reloadKey + 1,
    response,
  };
}
