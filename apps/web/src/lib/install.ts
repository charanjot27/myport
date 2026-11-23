import { useEffect, useState } from "react";

/**
 * Installing JOTR on phones and tablets without an app store: JOTR is a
 * Progressive Web App. Chrome and Edge (Android, tablets, desktop) offer a real
 * one-tap install; iPhone and iPad install through Safari's "Add to Home Screen".
 * Either way JOTR gets its own icon and opens full screen, like any app.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once at startup: the browser offers the install prompt only once per page load. */
export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own "Install" button
    deferred = e as InstallPromptEvent;
    notify();
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    try {
      localStorage.setItem("jotr.installed", "1");
    } catch {
      // private mode
    }
    notify();
  });
}

/** Registers the service worker that lets the installed app start instantly and open offline. */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

/** iPhone, iPod and iPad (iPadOS presents itself as a Mac with a touch screen). */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1);
}

/** Running as the installed app (from the home screen icon). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  let installed = isStandalone();
  try {
    installed ||= localStorage.getItem("jotr.installed") === "1";
  } catch {
    // private mode
  }
  return {
    /** The browser can install JOTR with one tap (Chrome/Edge). */
    canInstall: !!deferred,
    installed,
    apple: isAppleMobile(),
    install: async () => {
      const e = deferred;
      if (!e) return false;
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null;
      notify();
      return outcome === "accepted";
    },
  };
}
