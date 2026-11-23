import { useEffect, useState } from "react";

/** Where the installers live: the latest GitHub Release by default (set VITE_DESKTOP_DOWNLOAD_BASE to host them elsewhere). */
const BASE = ((import.meta.env.VITE_DESKTOP_DOWNLOAD_BASE as string | undefined) || "https://github.com/charanjot27/myport/releases/latest/download").replace(/\/$/, "");

/** One-line installer for Macs: curl downloads aren't flagged, so macOS never says "damaged". */
export const MAC_INSTALL = `curl -fsSL ${typeof location !== "undefined" && /^https:/.test(location.origin) ? location.origin : "https://jotr1.netlify.app"}/install.sh | sh`;

export const DESKTOP_FILES = {
  macArm: `${BASE}/JOTR-mac-arm64.dmg`,
  macIntel: `${BASE}/JOTR-mac-x64.dmg`,
  windows: `${BASE}/JOTR-windows-x64.exe`,
};

type Os = "mac" | "windows" | "other";

function detectOs(): Os {
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
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

/** "Download for Mac / Windows" buttons; the visitor's own system comes first. */
export function DownloadDesktop({ className = "lg-btn lg-btn-glass" }: { className?: string }) {
  const [os, setOs] = useState<Os>("other");
  const [arch, setArch] = useState<"arm" | "intel" | "unknown">("unknown");
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const o = detectOs();
    setOs(o);
    if (o === "mac") void macArch().then(setArch);
  }, []);

  const mac =
    arch === "intel" ? (
      <a key="mac" className={className} href={DESKTOP_FILES.macIntel} data-testid="download-mac">
        <Apple /> Download for Mac
      </a>
    ) : (
      <a key="mac" className={className} href={DESKTOP_FILES.macArm} data-testid="download-mac" title="For Apple Silicon Macs (M1 and newer)">
        <Apple /> Download for Mac
      </a>
    );
  const win = (
    <a key="win" className={className} href={DESKTOP_FILES.windows} data-testid="download-windows">
      <WindowsLogo /> Download for Windows
    </a>
  );
  return (
    <div className="lg-downloads">
      <div className="lg-downloads-row">{os === "windows" ? [win, mac] : [mac, win]}</div>
      <span className="lg-downloads-note">
        Desktop app: the prompter floats over every app and stays out of screen recordings.
        {os === "mac" && arch !== "intel" && (
          <>
            {" "}
            Intel Mac? <a href={DESKTOP_FILES.macIntel}>Get this one</a>.
          </>
        )}
      </span>
      {os !== "windows" && (
        <div className="lg-mac-install">
          <span className="lg-mac-install-label">
            <b>Mac:</b> install in one step. Paste this into Terminal:
          </span>
          <div className="lg-mac-install-row">
            <code data-testid="mac-install-command">{MAC_INSTALL}</code>
            <button
              onClick={() =>
                void navigator.clipboard?.writeText(MAC_INSTALL).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                })
              }
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <button className="lg-mac-help-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
            {help ? "Hide" : "Downloaded the .dmg and macOS says “damaged”?"}
          </button>
          {help && (
            <span className="lg-mac-help-text">
              JOTR isn't signed by Apple yet. Drag it into Applications, then run once in Terminal: <code>xattr -dr com.apple.quarantine /Applications/JOTR.app</code>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
