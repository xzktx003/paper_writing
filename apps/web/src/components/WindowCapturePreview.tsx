import { useEffect, useRef } from "react";

interface WindowCapturePreviewProps {
  stream: MediaStream | null;
  interactionState: string;
  connectionState: string;
  large?: boolean;
}

export function WindowCapturePreview({
  stream,
  interactionState,
  connectionState,
  large,
}: WindowCapturePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  if (!stream) {
    const message =
      interactionState === "exited"
        ? "窗口观察已结束"
        : connectionState === "degraded"
          ? "观察连接已断开"
          : "无可用视频流";

    return (
      <div
        className={`capture-placeholder ${large ? "capture-placeholder-large" : ""}`}
      >
        <span className="capture-placeholder-text">{message}</span>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={`capture-video ${large ? "capture-video-large" : ""}`}
    />
  );
}
