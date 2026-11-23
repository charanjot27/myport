import type { CameraPlacement } from "./settings";

/**
 * What the browser can tell us about the machine. Browsers deliberately hide
 * the laptop model, so we combine OS, screen and camera name into a best guess
 * of where the webcam is, and the user confirms it with one click.
 */
export interface DeviceInfo {
  os: "macOS" | "Windows" | "ChromeOS" | "Linux" | "iOS" | "Android" | "Unknown";
  browser: { name: string; version: string; supported: boolean; note?: string };
  screen: { width: number; height: number; dpr: number };
  camera: { label: string; kind: "built-in" | "external" | "phone" | "unknown" } | null;
  /** Human-readable summary, e.g. "Mac laptop · built-in FaceTime HD camera". */
  summary: string;
  suggested: CameraPlacement;
  /** How sure we are about `suggested`. */
  confidence: "high" | "medium" | "low";
}

const BUILT_IN = /facetime|built-?in|integrated|internal|front|user[- ]?facing|hd webcam|hd camera|ir camera|lenovo easycamera|chicony|realtek|sunplus|bison/i;
const PHONE = /iphone|continuity|android|droidcam|camo/i;
const EXTERNAL = /logitech|brio|c9\d\d|c270|streamcam|razer|kiyo|elgato|facecam|obsbot|insta360|anker|poly|jabra|aver|usb|external|virtual|obs/i;

export function classifyCamera(label: string): "built-in" | "external" | "phone" | "unknown" {
  if (!label) return "unknown";
  if (PHONE.test(label)) return "phone";
  if (EXTERNAL.test(label)) return "external";
  if (BUILT_IN.test(label)) return "built-in";
  return "unknown";
}

function detectOs(): DeviceInfo["os"] {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad/.test(ua) || (p.includes("mac") && navigator.maxTouchPoints > 1)) return "iOS";
  if (p.includes("mac")) return "macOS";
  if (p.includes("win")) return "Windows";
  if (p.includes("cros") || ua.includes("cros")) return "ChromeOS";
  if (ua.includes("android")) return "Android";
  if (p.includes("linux")) return "Linux";
  return "Unknown";
}

function detectBrowser(): DeviceInfo["browser"] {
  const ua = navigator.userAgent;
  const nav = navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string; version: string }> } };
  const brands = nav.userAgentData?.brands ?? [];
  const pick = (name: string) => brands.find((b) => b.brand === name);
  const edge = pick("Microsoft Edge");
  const chrome = pick("Google Chrome");
  if (edge) return { name: "Edge", version: edge.version, supported: true };
  if (chrome) return { name: "Chrome", version: chrome.version, supported: true };
  const fx = /Firefox\/(\d+)/.exec(ua);
  if (fx) return { name: "Firefox", version: fx[1]!, supported: false, note: "Firefox has no built-in speech recognition. Use Chrome or Edge, or cloud speech (Pro)." };
  const safari = /Version\/(\d+).*Safari/.exec(ua);
  if (safari && !/Chrome|Chromium/.test(ua)) return { name: "Safari", version: safari[1]!, supported: true, note: "Safari works; Chrome gives the most reliable speech recognition." };
  const chromium = /Chrom(e|ium)\/(\d+)/.exec(ua);
  if (chromium) return { name: "Chromium", version: chromium[2]!, supported: true };
  return { name: "Unknown browser", version: "", supported: false, note: "Use Chrome or Edge for the best experience." };
}

/** Pass a live camera track when available: device labels are only readable after permission. */
export async function detectDevice(track?: MediaStreamTrack | null): Promise<DeviceInfo> {
  const os = detectOs();
  const browser = detectBrowser();
  let label = track?.label ?? "";
  if (!label) {
    const devices = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => [])) ?? [];
    label = devices.find((d) => d.kind === "videoinput" && d.label)?.label ?? "";
  }
  const kind = classifyCamera(label);
  const screenInfo = { width: screen.width, height: screen.height, dpr: window.devicePixelRatio || 1 };
  // A built-in camera on any laptop sits top-centre. External webcams are usually clipped to the top centre of a monitor too.
  const suggested: CameraPlacement = { x: 0.5, edge: "top" };
  const confidence: DeviceInfo["confidence"] = kind === "built-in" ? "high" : kind === "unknown" ? "low" : "medium";
  const machine =
    os === "macOS" ? (kind === "built-in" ? "MacBook" : "Mac") : os === "Windows" ? "Windows PC" : os === "ChromeOS" ? "Chromebook" : os;
  const camText =
    kind === "built-in" ? `built-in camera (${label})` : kind === "phone" ? `phone as webcam (${label})` : kind === "external" ? `external webcam (${label})` : label ? `camera “${label}”` : "camera not identified yet";
  return {
    os,
    browser,
    screen: screenInfo,
    camera: label ? { label, kind } : null,
    summary: `${machine} · ${camText} · ${screenInfo.width}×${screenInfo.height} screen`,
    suggested,
    confidence,
  };
}

/** Horizontal camera position inside the current window, in CSS pixels. */
export function cameraXInWindow(p: CameraPlacement): number {
  const fullscreen = !!document.fullscreenElement || (window.innerWidth >= screen.width - 2 && window.screenX <= 0);
  if (fullscreen) return p.x * window.innerWidth;
  const borders = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  return p.x * screen.width - (window.screenX - ((screen as Screen & { availLeft?: number }).availLeft ?? 0)) - borders;
}

/** Phones and small tablets: the camera sits in the screen's top cut-out (notch, Dynamic Island, punch-hole). */
export function isPhone(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false) && Math.min(window.innerWidth, window.innerHeight) < 700;
}

/** Height of the top safe area (status bar and camera cut-out), from CSS env(); 0 where there is none. */
export function safeAreaTop(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

export interface FocusFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  lineHeight: number;
  /** On phones: the frame hangs from the camera cut-out like a notch. */
  phone?: boolean;
}

/**
 * The text window in camera layout: a narrow column of a few lines, centred
 * under (or over) the webcam, as close to the lens as the screen allows.
 */
export function focusFrame(
  opts: { placement: CameraPlacement; fontSize: number; lines: number; columnWidth: number; phone?: boolean; safeTop?: number },
  vw = window.innerWidth,
  vh = window.innerHeight,
  camX = cameraXInWindow(opts.placement),
): FocusFrame {
  const lineHeight = opts.fontSize * 1.45;
  const width = Math.round(Math.max(Math.min(320, vw - 24), Math.min(vw - 24, opts.columnWidth * vw)));
  const height = Math.round(lineHeight * opts.lines + lineHeight * 0.35);
  const left = Math.round(Math.max(12, Math.min(vw - width - 12, camX - width / 2)));
  if (opts.phone) {
    // Full width under the cut-out: the camera is top centre on phones.
    const pw = vw - 24;
    return { left: 12, top: Math.round((opts.safeTop ?? 0) + 8), width: pw, height, lineHeight, phone: true };
  }
  const top = opts.placement.edge === "top" ? 6 : Math.max(6, vh - height - 6);
  return { left, top, width, height, lineHeight };
}

/** Text colour for the given brightness and tone, kept low-luminance to avoid reflections. */
export function textColor(brightness: number, tone: "warm" | "neutral", factor = 1): string {
  const b = Math.max(0.15, Math.min(1, brightness * factor));
  const base = tone === "warm" ? [255, 208, 150] : [236, 236, 236];
  return `rgb(${base.map((c) => Math.round(c * b)).join(", ")})`;
}
