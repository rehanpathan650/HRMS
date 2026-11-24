"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "live" }
  | { status: "error"; message: string };

function cameraError(e: unknown) {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission was denied. Allow camera access for this site in your browser settings, then retry.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "Your camera is in use by another application. Close it and retry.";
  return "Could not start the camera. Please retry.";
}

/**
 * Live camera via getUserMedia with front-camera preference.
 * The stream is stopped on unmount and after capture so the camera light turns off.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ status: "idle" });

  /**
   * Callback ref: attaches the active stream whenever the <video> mounts. The element
   * may mount after start() resolves (e.g. behind an exit animation), so a plain
   * ref read inside start() is not enough.
   */
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: "error", message: "This browser does not support camera access." });
      return;
    }
    if (!window.isSecureContext) {
      setState({ status: "error", message: "Camera access requires a secure (HTTPS) connection." });
      return;
    }
    stop();
    setState({ status: "starting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState({ status: "live" });
    } catch (e) {
      setState({ status: "error", message: cameraError(e) });
    }
  }, [stop]);

  /** Captures a mirrored, center-cropped 4:5 JPEG (max 900px tall). */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const targetRatio = 4 / 5;
    let sw = vw;
    let sh = vh;
    if (vw / vh > targetRatio) sw = Math.round(vh * targetRatio);
    else sh = Math.round(vw / targetRatio);
    const sx = Math.round((vw - sw) / 2);
    const sy = Math.round((vh - sh) / 2);
    const outH = Math.min(900, sh);
    const outW = Math.round(outH * targetRatio);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.translate(outW, 0);
    ctx.scale(-1, 1); // mirror to match the preview users see
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef: attachVideo, state, start, stop, capture };
}
