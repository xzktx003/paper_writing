export interface CaptureResult {
  stream: MediaStream;
  label: string;
}

export interface WindowCaptureEnvironment {
  isSecureContext: boolean;
  protocol: string;
  hostname: string;
  hasMediaDevices: boolean;
  hasGetDisplayMedia: boolean;
}

export interface WindowCaptureAvailability {
  supported: boolean;
  reason?: string;
}

function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

function readWindowCaptureEnvironment(): WindowCaptureEnvironment {
  return {
    isSecureContext: window.isSecureContext,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    hasMediaDevices: Boolean(navigator.mediaDevices),
    hasGetDisplayMedia: Boolean(navigator.mediaDevices?.getDisplayMedia),
  };
}

function buildUnavailableReason(env: WindowCaptureEnvironment): string {
  if (!env.isSecureContext) {
    if (env.protocol === "http:" && !isLoopbackHost(env.hostname)) {
      return "当前通过非安全 HTTP 从另一台机器访问，Chrome 已禁用窗口共享。请改用 HTTPS 访问当前页面，或在打开浏览器的同一台机器上通过 localhost 访问。";
    }

    return "当前页面不是安全上下文，浏览器已禁用窗口共享。请改用 HTTPS 或 localhost 访问。";
  }

  return "当前浏览器环境不支持窗口共享。请使用 Chrome/Edge 等 Chromium 浏览器，并确认系统允许窗口共享。";
}

export function getWindowCaptureAvailability(
  env: WindowCaptureEnvironment = readWindowCaptureEnvironment(),
): WindowCaptureAvailability {
  if (!env.isSecureContext || !env.hasMediaDevices || !env.hasGetDisplayMedia) {
    return {
      supported: false,
      reason: buildUnavailableReason(env),
    };
  }

  return { supported: true };
}

export async function requestWindowCapture(): Promise<CaptureResult | null> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "window",
      } as MediaTrackConstraints,
      audio: false,
    });

    const track = stream.getVideoTracks()[0];
    const label = track?.label || "VS Code 窗口";

    return { stream, label };
  } catch {
    // User cancelled or permission denied
    return null;
  }
}

export function stopCapture(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
