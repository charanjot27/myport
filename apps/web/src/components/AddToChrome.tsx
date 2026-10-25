import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CHROME_STORE_URL, EXTENSION_ZIP, useExtension } from "../lib/extension";

/** Simplified Chrome mark for the install button. */
export function ChromeMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="chrome-mark">
      <path d="M24 24 4.95 13A22 22 0 0 1 43.05 13z" fill="#ea4335" />
      <path d="M24 24 43.05 13A22 22 0 0 1 24 46z" fill="#fbbc04" />
      <path d="M24 24 24 46A22 22 0 0 1 4.95 13z" fill="#34a853" />
      <circle cx="24" cy="24" r="10.5" fill="#fff" />
      <circle cx="24" cy="24" r="8" fill="#4285f4" />
    </svg>
  );
}

/**
 * "Add to Chrome": opens the Chrome Web Store listing when there is one,
 * otherwise a short guide to load the downloaded extension. Shows
 * "Added to Chrome" once the extension's site script has marked the page.
 */
export function AddToChrome({ className = "", label = "Add to Chrome" }: { className?: string; label?: string }) {
  const version = useExtension();
  const [open, setOpen] = useState(false);

  if (version) {
    return (
      <span className={`${className} ext-added`} title={`JOTR extension ${version} is active`}>
        <span className="ext-dot" aria-hidden /> Added to Chrome
      </span>
    );
  }
  const click = () => {
    if (CHROME_STORE_URL) window.open(CHROME_STORE_URL, "_blank", "noopener");
    else setOpen(true);
  };
  return (
    <>
      <button className={className} onClick={click}>
        <ChromeMark /> <span className="ext-label">{label}</span>
      </button>
      {open && createPortal(<InstallGuide onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function InstallGuide({ onClose }: { onClose: () => void }) {
  const version = useExtension();
  const [zip, setZip] = useState<"checking" | "ok" | "missing">("checking");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(EXTENSION_ZIP, { method: "HEAD" })
      .then((r) => setZip(r.ok && !r.headers.get("content-type")?.includes("text/html") ? "ok" : "missing"))
      .catch(() => setZip("missing"));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText("chrome://extensions");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the address is shown for typing.
    }
  };

  return (
    <div className="ext-modal" role="dialog" aria-modal="true" aria-label="Add JOTR to Chrome" onClick={onClose}>
      <div className="ext-card" onClick={(e) => e.stopPropagation()}>
        <button className="ext-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="ext-head">
          <ChromeMark size={42} />
          <div>
            <h2>Add JOTR to Chrome</h2>
            <p>Processes your camera inside Meet, Zoom and Teams, and opens the teleprompter from your toolbar on any tab.</p>
          </div>
        </div>

        {version ? (
          <div className="ext-done">
            <span className="ext-dot" aria-hidden /> JOTR {version} is installed and active.
          </div>
        ) : (
          <ol className="ext-steps">
            <li>
              <b>Download the extension</b>
              {zip === "missing" ? (
                <span className="muted">
                  Not built yet on this server. Run <code>pnpm --filter @promptsense/web pack-extension</code>, then reload.
                </span>
              ) : (
                <a className="btn primary small" href={EXTENSION_ZIP} download aria-disabled={zip !== "ok"}>
                  Download .zip
                </a>
              )}
              <span className="muted">Double-click the file to unzip it.</span>
            </li>
            <li>
              <b>
                Open <code>chrome://extensions</code>
              </b>
              <button className="btn small" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy address"}
              </button>
              <span className="muted">Paste it into the address bar and turn on Developer mode (top right).</span>
            </li>
            <li>
              <b>Click “Load unpacked”</b>
              <span className="muted">
                Choose the <code>jotr-chrome-extension</code> folder. Pin JOTR from the puzzle-piece menu so it stays in your toolbar.
              </span>
            </li>
            <li>
              <b>Refresh this page</b>
              <button className="btn small" onClick={() => location.reload()}>
                Refresh
              </button>
              <span className="muted">The button turns into “Added to Chrome” once it is active.</span>
            </li>
          </ol>
        )}
        <p className="ext-foot">One-click install arrives when JOTR is published on the Chrome Web Store.</p>
      </div>
    </div>
  );
}
