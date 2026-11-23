import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AddToChrome } from "./AddToChrome";
import QRCode from "qrcode";
import { useInstall } from "../lib/install";

/** Where the installers live: the latest GitHub Release by default (set VITE_DESKTOP_DOWNLOAD_BASE to host them elsewhere). */
const BASE = ((import.meta.env.VITE_DESKTOP_DOWNLOAD_BASE as string | undefined) || "https://github.com/charanjot27/myport/releases/latest/download").replace(/\/$/, "");
const SITE = typeof location !== "undefined" && /^https:/.test(location.origin) ? location.origin : "https://jotr1.netlify.app";

/** One-line installer for Macs: curl downloads aren't flagged, so macOS never says "damaged". */
export const MAC_INSTALL = `curl -fsSL ${SITE}/install.sh | sh`;
export const MAC_UNBLOCK = "xattr -dr com.apple.quarantine /Applications/JOTR.app";

export const DESKTOP_FILES = {
  android: `${BASE}/JOTR-android.apk`,
  macArm: `${BASE}/JOTR-mac-arm64.dmg`,
  macIntel: `${BASE}/JOTR-mac-x64.dmg`,
  windows: `${BASE}/JOTR-windows-x64.exe`,
};

export type Platform = "mac" | "windows" | "phone" | "other";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const uad = (navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }).userAgentData;
  if (uad?.mobile || /iphone|ipad|ipod|android/i.test(ua) || (/mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1)) return "phone";
  const p = uad?.platform ?? navigator.platform ?? ua;
  if (/mac/i.test(p)) return "mac";
  if (/win/i.test(p)) return "windows";
  return "other";
}

/** Apple Silicon or Intel; Chrome can tell, Safari can't (it then offers both). */
async function macArch(): Promise<"arm" | "intel" | "unknown"> {
  const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> } }).userAgentData;
  try {
    const v = await uad?.getHighEntropyValues?.(["architecture"]);
    if (v?.architecture === "arm") return "arm";
    if (v?.architecture === "x86") return "intel";
  } catch {
    // unknown
  }
  return "unknown";
}

const Apple = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden>
    <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4z" />
  </svg>
);
const WindowsLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden>
    <path d="M3 5.4 10.4 4.4v7.1H3zM11.3 4.3 21 3v8.5h-9.7zM3 12.4h7.4v7.2L3 18.6zM11.3 12.4H21V21l-9.7-1.3z" />
  </svg>
);
const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" width="17" height="17" aria-hidden>
    <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
    <path d="M10.5 5h3" />
  </svg>
);

function usePlatform(): { platform: Platform; arch: "arm" | "intel" | "unknown" } {
  const [platform, setPlatform] = useState<Platform>("other");
  const [arch, setArch] = useState<"arm" | "intel" | "unknown">("unknown");
  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    if (p === "mac") void macArch().then(setArch);
  }, []);
  return { platform, arch };
}

/** Hero buttons: Mac and Windows downloads (own system first), and "on your phone". All lead to the install guide below. */
export function DownloadDesktop({ className = "lg-btn lg-btn-glass" }: { className?: string }) {
  const { platform, arch } = usePlatform();
  const go = (tab: Tab) => () => {
    window.dispatchEvent(new CustomEvent("jotr:get", { detail: tab }));
    document.getElementById("get")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const mac = (
    <a key="mac" className={className} href={arch === "intel" ? DESKTOP_FILES.macIntel : DESKTOP_FILES.macArm} data-testid="download-mac" onClick={go("mac")}>
      <Apple /> Download for macOS
    </a>
  );
  const win = (
    <a key="win" className={className} href={DESKTOP_FILES.windows} data-testid="download-windows" onClick={go("windows")}>
      <WindowsLogo /> Download for Windows
    </a>
  );
  const phone = (
    <button key="phone" className={className} onClick={go("phone")} data-testid="get-phone">
      <PhoneIcon /> iPhone &amp; Android
    </button>
  );
  const order = platform === "windows" ? [win, mac, phone] : platform === "phone" ? [phone, mac, win] : [mac, win, phone];
  return (
    <div className="lg-downloads">
      <div className="lg-downloads-row">{order}</div>
      <span className="lg-downloads-note">
        Desktop app: the prompter floats over every app and stays out of screen recordings. <a href="#get">How to install ↓</a>
      </span>
    </div>
  );
}

function Copy({ text, testId }: { text: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="gj-cmd">
      <code data-testid={testId}>{text}</code>
      <button
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          })
        }
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="gj-step">
      <span className="gj-n">{n}</span>
      <div>
        <b>{title}</b>
        {children}
      </div>
    </li>
  );
}

type Tab = "mac" | "windows" | "phone" | "chrome";
const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "mac", label: "macOS", icon: <Apple /> },
  { id: "windows", label: "Windows", icon: <WindowsLogo /> },
  { id: "phone", label: "Phone & tablet", icon: <PhoneIcon /> },
  { id: "chrome", label: "Chrome", icon: <span className="gj-chrome" aria-hidden /> },
];

/** "Get JOTR": install instructions for every device, opening on the visitor's own. */
export function GetJotr() {
  const { platform, arch } = usePlatform();
  const [tab, setTab] = useState<Tab>("mac");
  useEffect(() => {
    setTab(platform === "windows" ? "windows" : platform === "phone" ? "phone" : "mac");
  }, [platform]);
  useEffect(() => {
    const on = (e: Event) => setTab((e as CustomEvent<Tab>).detail);
    window.addEventListener("jotr:get", on);
    return () => window.removeEventListener("jotr:get", on);
  }, []);

  return (
    <section className="lg-section gj" id="get" aria-labelledby="get-title">
      <div className="lg-head" data-reveal>
        <span className="lg-eyebrow">Get JOTR</span>
        <h2 id="get-title">On every screen you talk from</h2>
      </div>
      <div className="gj-card" data-reveal>
        <div className="gj-tabs" role="tablist" aria-label="Device">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "mac" && (
          <div className="gj-panel" role="tabpanel">
            <div className="gj-why">
              <b>Why macOS may say “JOTR is damaged”</b>
              <p>
                JOTR is free, so it isn’t signed with Apple’s paid ($99/year) developer certificate yet. macOS shows “damaged” for every unsigned app
                downloaded in a browser, even a safe one. Installing from Terminal skips that check, because Terminal downloads aren’t flagged.
              </p>
            </div>
            <ol className="gj-steps">
              <Step n={1} title="Easiest: install from Terminal (recommended)">
                <p>Open Terminal (⌘ Space, type “Terminal”), paste this and press Return. It installs the right version for your Mac and opens JOTR.</p>
                <Copy text={MAC_INSTALL} testId="mac-install-command" />
              </Step>
              <Step n={2} title="Or download the app">
                <div className="gj-buttons">
                  <a className="lg-btn lg-btn-white" data-testid="download-mac" href={arch === "intel" ? DESKTOP_FILES.macIntel : DESKTOP_FILES.macArm}>
                    <Apple /> Download for macOS
                  </a>
                  <a className="gj-alt" href={arch === "intel" ? DESKTOP_FILES.macArm : DESKTOP_FILES.macIntel}>
                    {arch === "intel" ? "Apple Silicon (M1 or newer) instead" : "Intel Mac instead"}
                  </a>
                </div>
                <p>Open the .dmg and drag JOTR into Applications. If macOS says it’s damaged, paste this into Terminal once, then open JOTR again:</p>
                <Copy text={MAC_UNBLOCK} testId="mac-unblock-command" />
              </Step>
              <Step n={3} title="Start reading">
                <p>The notch appears under your camera. Press ⌥⇧S (Option-Shift-S) to start and stop.</p>
              </Step>
            </ol>
          </div>
        )}

        {tab === "windows" && (
          <div className="gj-panel" role="tabpanel">
            <div className="gj-why">
              <b>Why Windows may warn you</b>
              <p>JOTR is free and not yet signed with a paid code-signing certificate, so SmartScreen shows “Windows protected your PC” the first time.</p>
            </div>
            <ol className="gj-steps">
              <Step n={1} title="Download and run the installer">
                <div className="gj-buttons">
                  <a className="lg-btn lg-btn-white" data-testid="download-windows" href={DESKTOP_FILES.windows}>
                    <WindowsLogo /> Download for Windows
                  </a>
                </div>
              </Step>
              <Step n={2} title="If SmartScreen appears">
                <p>Click <b>More info</b>, then <b>Run anyway</b>. You only need to do this once.</p>
              </Step>
              <Step n={3} title="Start reading">
                <p>The prompter appears at the top of your screen, under the webcam. Press Ctrl+Alt+Shift+S to start and stop.</p>
              </Step>
            </ol>
          </div>
        )}

        {tab === "phone" && <PhoneInstall onPhone={platform === "phone"} />}

        {tab === "chrome" && (
          <div className="gj-panel" role="tabpanel">
            <div className="gj-why">
              <b>In your browser, nothing to install</b>
              <p>JOTR runs right in Chrome or Edge, and floats over Meet, Zoom and any tab. The extension adds the camera effects inside video calls.</p>
            </div>
            <div className="gj-buttons">
              <Link className="lg-btn lg-btn-white" to="/app">
                Start free in your browser
              </Link>
              <AddToChrome className="lg-btn lg-btn-glass" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="gj-inline-ic">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

/** QR code of the site, so a laptop visitor can open it on their phone in one scan. */
function SiteQr() {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    void QRCode.toString(SITE, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1016", light: "#ffffff" } }).then(setSvg);
  }, []);
  return <div className="gj-qr" role="img" aria-label={`QR code for ${SITE}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * Phones and tablets: no app store. JOTR is an installable web app: Chrome/Edge
 * install it with one tap; iPhone and iPad add it from Safari's Share menu.
 */
function PhoneInstall({ onPhone }: { onPhone: boolean }) {
  const { canInstall, installed, apple, install } = useInstall();
  const [busy, setBusy] = useState(false);
  const safari = typeof navigator !== "undefined" && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|chrome|android/i.test(navigator.userAgent);
  return (
    <div className="gj-panel" role="tabpanel">
      <div className="gj-why">
        <b>No app store needed</b>
        <p>
          <b>Android:</b> the JOTR app floats your script in a notch over any app (WhatsApp, Instagram, the camera) and follows your voice.{" "}
          <b>iPhone &amp; iPad:</b> Apple lets no app draw over other apps, so JOTR installs from Safari and floats a scrolling window instead.
        </p>
      </div>

      {(!onPhone || !apple) && (
        <div className="gj-android">
          <div className="gj-buttons">
            <a className="lg-btn lg-btn-white" href={DESKTOP_FILES.android} data-testid="download-android">
              Download for Android (APK)
            </a>
          </div>
          <ol className="gj-steps compact">
            <Step n={1} title="Open the downloaded file" />
            <Step n={2} title="Allow “Install unknown apps” once" />
            <Step n={3} title="In JOTR, allow “Display over other apps”" />
          </ol>
          <p className="gj-fine">Free and outside the Play Store, so Android may ask you to confirm. Tap “Install anyway”.</p>
        </div>
      )}

      {installed ? (
        <div className="gj-installed" data-testid="pwa-installed">
          <span>✓</span> JOTR is installed. Open it from your home screen.
        </div>
      ) : !onPhone ? (
        <div className="gj-qr-row">
          <SiteQr />
          <div>
            <b>Scan with your phone or tablet</b>
            <p>
              Or open <span className="gj-url">{SITE.replace(/^https:\/\//, "")}</span> there, then follow the steps for your device.
            </p>
          </div>
        </div>
      ) : canInstall ? (
        <div className="gj-buttons">
          <button
            className="lg-btn lg-btn-white lg"
            data-testid="pwa-install"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void install().finally(() => setBusy(false));
            }}
          >
            Install JOTR
          </button>
        </div>
      ) : null}

      {!installed && (onPhone ? apple : true) && (
        <ol className="gj-steps compact">
          <Step n={1} title={apple && !safari ? "Open this page in Safari" : "iPhone & iPad: in Safari"} />
          <Step n={2} title={<>Tap Share <ShareIcon /></>} />
          <Step n={3} title="Tap “Add to Home Screen”" />
        </ol>
      )}

      <div className="gj-buttons">
        <Link className="lg-btn lg-btn-glass" to="/app">
          Use it in the browser
        </Link>
      </div>
    </div>
  );
}
