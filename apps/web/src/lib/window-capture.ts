export interface CaptureResult {
  stream: MediaStream;
  label: string;
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
