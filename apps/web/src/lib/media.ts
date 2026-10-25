/** Camera and microphone access with friendly errors. */

export interface MediaRequest {
  cameraId?: string;
  micId?: string;
  video: boolean;
  audio: boolean;
}

export async function openMedia(req: MediaRequest): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot access the camera or microphone. Use a recent Chrome, Edge, Firefox or Safari over HTTPS.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: req.video
        ? { deviceId: req.cameraId ? { exact: req.cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        : false,
      audio: req.audio
        ? { deviceId: req.micId ? { exact: req.micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : false,
    });
  } catch (e) {
    const err = e as DOMException;
    if (err.name === "NotAllowedError") throw new Error("Camera or microphone permission was denied. Allow access in the browser's address bar and try again.");
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
      if (req.cameraId || req.micId) return openMedia({ ...req, cameraId: "", micId: "" });
      throw new Error("No camera or microphone was found.");
    }
    if (err.name === "NotReadableError") throw new Error("The camera or microphone is in use by another app.");
    throw e;
  }
}

export function stopMedia(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function listDevices(): Promise<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }> {
  const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
  return {
    cameras: devices.filter((d) => d.kind === "videoinput"),
    mics: devices.filter((d) => d.kind === "audioinput"),
  };
}
