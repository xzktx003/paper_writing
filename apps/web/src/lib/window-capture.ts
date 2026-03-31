export interface CaptureResult {
  stream: MediaStream;
  label: string;
}

export interface CaptureActivityProbe {
  readScreenSignature(): string | undefined;
  dispose(): void;
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

export function buildCaptureFrameSignature(pixels: ArrayLike<number>): string {
  let signature = "";

  for (let index = 0; index < pixels.length; index += 4) {
    const red = Number(pixels[index] ?? 0);
    const green = Number(pixels[index + 1] ?? 0);
    const blue = Number(pixels[index + 2] ?? 0);
    const gray = Math.round((red * 3 + green * 4 + blue) / 8);
    signature += Math.round(gray / 17)
      .toString(16)
      .padStart(1, "0");
  }

  return signature;
}

export function createWindowCaptureActivityProbe(
  stream: MediaStream,
): CaptureActivityProbe {
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d");

  return {
    readScreenSignature(): string | undefined {
      if (!context) {
        return undefined;
      }

      if (
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        return undefined;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      return buildCaptureFrameSignature(frame.data);
    },
    dispose(): void {
      video.pause();
      video.srcObject = null;
      canvas.width = canvas.width;
    },
  };
}

export function stopCapture(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
