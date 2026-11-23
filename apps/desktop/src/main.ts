import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray, type Display, type MenuItemConstructorOptions } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  cameraGuess,
  DEFAULT_SETTINGS,
  FLOAT_PAD,
  notchBounds,
  placeAfterDrag,
  prompterSize,
  THEMES,
  type Command,
  type DesktopSettings,
  type Layout,
  type Mode,
  type PrompterState,
  type Rect,
  type Theme,
} from "./shared/settings";

/**
 * JOTR Desktop. Two windows:
 * - the prompter: a frameless panel that hangs from the top of the screen like
 *   the notch, floats above every app (full-screen ones too), can be dragged
 *   anywhere, and asks the OS to keep it out of screen recordings;
 * - the control window: script and settings.
 * A menu-bar (tray) icon and global shortcuts work from any app.
 */

const mac = process.platform === "darwin";
let settings: DesktopSettings = { ...DEFAULT_SETTINGS };
let notch: BrowserWindow | null = null;
let control: BrowserWindow | null = null;
let tray: Tray | null = null;
let state: PrompterState = { visible: false, running: false, paused: false, progress: 0, speaking: false, listening: "off" };
let quitting = false;
let applyingBounds = false;

// ----------------------------------------------------------------- storage

const storePath = () => join(app.getPath("userData"), "settings.json");

function load(): void {
  try {
    settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(storePath(), "utf8")) as Partial<DesktopSettings>) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

let saveTimer: NodeJS.Timeout | undefined;
function save(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(dirname(storePath()), { recursive: true });
    writeFileSync(storePath(), JSON.stringify(settings, null, 2));
  }, 200);
}

// ------------------------------------------------------------------ layout

function targetDisplay(): Display {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === settings.displayId) ?? screen.getPrimaryDisplay();
}

/** Height of the menu bar / notch strip on a display (0 where there is none, e.g. Windows). */
function topInset(d: Display): number {
  return mac ? Math.max(0, d.workArea.y - d.bounds.y) : 0;
}

function prompterBounds(): Rect {
  const d = targetDisplay();
  if (settings.position === null) {
    const size = prompterSize(settings, true, topInset(d));
    return notchBounds(d.bounds, size.width, size.height);
  }
  const size = prompterSize(settings, false, 0);
  const area = screen.getDisplayNearestPoint(settings.position).bounds;
  return {
    x: Math.min(Math.max(settings.position.x, area.x), area.x + area.width - size.width),
    y: Math.min(Math.max(settings.position.y, area.y), area.y + area.height - size.height),
    ...size,
  };
}

function layout(): Layout {
  const d = targetDisplay();
  const inset = topInset(d);
  return { floating: settings.position !== null, topInset: settings.position === null ? inset : 0, notched: cameraGuess(inset).notched };
}

function applyWindow(): void {
  if (!notch) return;
  applyingBounds = true;
  notch.setBounds(prompterBounds());
  setTimeout(() => (applyingBounds = false), 300);
  notch.setContentProtection(settings.invisible);
  notch.webContents.send("layout", layout());
}

// ----------------------------------------------------------------- windows

const preload = join(__dirname, "preload.js");
const page = (name: string) => join(__dirname, "renderer", `${name}.html`);

function createNotch(): BrowserWindow {
  const b = prompterBounds();
  const win = new BrowserWindow({
    ...b,
    type: mac ? "panel" : undefined,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    roundedCorners: false,
    enableLargerThanScreen: true,
    title: "JOTR",
    webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  // Above every app, on every desktop, including full-screen apps and presentations.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  // Ask the OS to leave this window out of screenshots, recordings and screen sharing.
  win.setContentProtection(settings.invisible);
  void win.loadFile(page("notch"));
  win.webContents.on("did-finish-load", () => win.webContents.send("layout", layout()));
  // A drag ends when the window stops moving for a moment (works the same on macOS, Windows and Linux).
  let dragEnd: NodeJS.Timeout | undefined;
  win.on("move", () => {
    if (applyingBounds) return;
    clearTimeout(dragEnd);
    dragEnd = setTimeout(() => onDragEnd(win), 250);
  });
  win.on("show", () => sendState());
  win.on("hide", () => sendState());
  return win;
}

function onDragEnd(win: BrowserWindow): void {
  const dropped = win.getBounds();
  const d = screen.getDisplayMatching(dropped);
  const placed = placeAfterDrag(dropped, d.bounds);
  const position = placed.snapped ? null : { x: placed.bounds.x, y: placed.bounds.y };
  const same = position === null ? settings.position === null : settings.position?.x === position.x && settings.position?.y === position.y;
  if (!same || settings.displayId !== d.id) update({ displayId: d.id, position });
}

function createControl(): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 760,
    minWidth: 400,
    minHeight: 560,
    title: "JOTR",
    show: false,
    titleBarStyle: mac ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: mac ? "under-window" : undefined,
    visualEffectState: "active",
    backgroundMaterial: process.platform === "win32" ? "mica" : undefined,
    backgroundColor: mac ? "#00000000" : "#141018",
    webPreferences: { preload, contextIsolation: true, sandbox: true },
  });
  void win.loadFile(page("control"));
  win.once("ready-to-show", () => win.show());
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide(); // keep running in the menu bar
    }
  });
  return win;
}

function showControl(): void {
  if (!control || control.isDestroyed()) control = createControl();
  control.show();
  control.focus();
}

// ---------------------------------------------------------------- commands

function showNotch(): void {
  if (!notch || notch.isDestroyed()) notch = createNotch();
  applyWindow();
  // Show without taking focus, so the call or recording app stays active.
  notch.showInactive();
}

function command(c: Command): void {
  switch (c) {
    case "show":
      showNotch();
      break;
    case "hide":
      notch?.webContents.send("cmd", "pause");
      notch?.hide();
      break;
    case "toggle":
      if (notch?.isVisible()) command("hide");
      else showNotch();
      break;
    case "snap":
      update({ position: null });
      showNotch();
      break;
    case "editor":
      showControl();
      break;
    case "faster":
    case "slower":
      update({ wpm: Math.max(60, Math.min(260, settings.wpm + (c === "faster" ? 10 : -10))) });
      break;
    default:
      if (c === "start" || c === "toggle-pause" || c === "restart" || c === "prev-section" || c === "next-section") showNotch();
      notch?.webContents.send("cmd", c);
  }
  sendState();
}

function update(patch: Partial<DesktopSettings>): DesktopSettings {
  settings = { ...settings, ...patch };
  save();
  applyWindow();
  for (const w of [notch, control]) if (w && !w.isDestroyed()) w.webContents.send("settings", settings);
  refreshTray();
  return settings;
}

function sendState(): void {
  state = { ...state, visible: !!notch?.isVisible() };
  if (control && !control.isDestroyed()) control.webContents.send("state", state);
  refreshTray();
}

// -------------------------------------------------------------------- tray

const MODES: Array<[Mode, string]> = [
  ["pace", "Voice pace (offline, any language)"],
  ["words", "Follow my words (Deepgram)"],
  ["steady", "Steady speed"],
];
const key = (k: string) => `CommandOrControl+Shift+${k}`;

function refreshTray(): void {
  if (!tray) return;
  const template: MenuItemConstructorOptions[] = [
    { label: notch?.isVisible() ? "Hide Teleprompter" : "Show Teleprompter", accelerator: key("J"), click: () => command("toggle") },
    { label: state.running && !state.paused ? "Pause" : "Start", accelerator: key("Space"), click: () => command("toggle-pause") },
    { label: "Start Over", accelerator: key("R"), click: () => command("restart") },
    { label: "Snap Under the Notch", click: () => command("snap") },
    { type: "separator" },
    { label: "Mode", submenu: MODES.map(([m, label]) => ({ label, type: "radio", checked: settings.mode === m, click: () => update({ mode: m }) })) },
    {
      label: "Theme",
      submenu: (Object.keys(THEMES) as Theme[]).map((t) => ({ label: THEMES[t].name, type: "radio", checked: settings.theme === t, click: () => update({ theme: t }) })),
    },
    { label: "Invisible to Screen Recording", type: "checkbox", checked: settings.invisible, click: (i) => update({ invisible: i.checked }) },
    { label: "Voice Glow", type: "checkbox", checked: settings.voiceGlow, click: (i) => update({ voiceGlow: i.checked }) },
    { type: "separator" },
    { label: "Open JOTR…", click: showControl },
    { label: "JOTR Website", click: () => void shell.openExternal("https://jotr1.netlify.app") },
    { type: "separator" },
    { label: "Quit JOTR", accelerator: "CommandOrControl+Q", click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(state.running && !state.paused ? "JOTR: reading" : "JOTR");
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, "icons", mac ? "trayTemplate.png" : "tray.png"));
  if (mac) icon.setTemplateImage(true);
  tray = new Tray(icon);
  refreshTray();
}

// --------------------------------------------------------------------- app

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showControl);
  app.whenReady().then(async () => {
    load();
    // Microphone for voice pace, the glow and Deepgram. Nothing else is requested.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "media");
    if (mac && systemPreferences.getMediaAccessStatus("microphone") !== "granted") {
      await systemPreferences.askForMediaAccess("microphone").catch(() => false);
    }

    ipcMain.handle("settings:get", () => settings);
    ipcMain.handle("settings:set", (_e, patch: Partial<DesktopSettings>) => update(patch));
    ipcMain.on("cmd", (_e, c: Command) => command(c));
    ipcMain.on("state", (_e, s: PrompterState) => {
      state = s;
      sendState();
    });
    ipcMain.on("open-external", (_e, url: string) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
    });

    globalShortcut.register(key("J"), () => command("toggle"));
    globalShortcut.register(key("Space"), () => command("toggle-pause"));
    globalShortcut.register(key("R"), () => command("restart"));
    globalShortcut.register(key("Up"), () => command("back"));
    globalShortcut.register(key("Down"), () => command("forward"));
    globalShortcut.register(key("Left"), () => command("prev-section"));
    globalShortcut.register(key("Right"), () => command("next-section"));

    screen.on("display-metrics-changed", applyWindow);
    screen.on("display-removed", applyWindow);

    createTray();
    notch = createNotch();
    showControl();
    notch.once("ready-to-show", () => notch?.showInactive());
  });
  app.on("activate", showControl);
  app.on("before-quit", () => (quitting = true));
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => {
    // Stay in the menu bar until the user quits.
  });
}

// Exposed for tests and the "open from the website" flow later.
export const _testing = { get settings() { return settings; }, get notch() { return notch; }, command, update };
