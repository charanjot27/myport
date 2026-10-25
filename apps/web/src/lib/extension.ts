import { useEffect, useState } from "react";

/** Chrome Web Store listing; set VITE_CHROME_STORE_URL once the extension is published for one-click installs. */
export const CHROME_STORE_URL: string = import.meta.env.VITE_CHROME_STORE_URL ?? "";
export const EXTENSION_ZIP = "/downloads/jotr-chrome-extension.zip";

function installedVersion(): string | null {
  return typeof document === "undefined" ? null : (document.documentElement.dataset.jotrExtension ?? null);
}

/** The installed JOTR extension's version (its site script marks the page), or null. */
export function useExtension(): string | null {
  const [version, setVersion] = useState(installedVersion);
  useEffect(() => {
    const on = () => setVersion(installedVersion());
    on();
    window.addEventListener("jotr:extension", on);
    return () => window.removeEventListener("jotr:extension", on);
  }, []);
  return version;
}
