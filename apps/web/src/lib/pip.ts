/**
 * Floating prompter via Document Picture-in-Picture (Chrome/Edge 116+): an
 * always-on-top window that stays above every tab and every other app, so
 * the script can sit under the camera while you use Meet, an interview site
 * or anything else. Websites cannot see, remove or capture it through the
 * tab, and it only appears in a screen share if you share the whole screen.
 */

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  window: Window | null;
}

function api(): DocumentPictureInPicture | null {
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
}

export function floatingSupported(): boolean {
  return api() !== null;
}

/** Copy our stylesheets so React content portalled into the window looks the same. */
function copyStyles(target: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = target.createElement("style");
      style.textContent = css;
      target.head.append(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.append(link);
      }
    }
  }
}

/**
 * Open (or reuse) the floating window. Must be called from a click handler.
 * Chrome remembers where the user last dragged it, so placing it under the
 * camera once is enough.
 */
export async function openFloatingWindow(size: { width: number; height: number }): Promise<Window> {
  const pip = api();
  if (!pip) throw new Error("Floating mode needs Chrome or Edge 116 or newer.");
  if (pip.window) return pip.window;
  const win = await pip.requestWindow({ width: Math.round(size.width), height: Math.round(size.height) });
  copyStyles(win.document);
  win.document.title = "PromptSense";
  win.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? "dark";
  win.document.body.className = "pip-body";
  return win;
}

export function closeFloatingWindow(): void {
  api()?.window?.close();
}
