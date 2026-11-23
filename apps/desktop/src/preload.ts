import { contextBridge, ipcRenderer } from "electron";
import type { Command, DesktopSettings, JotrBridge, Layout, PrompterState } from "./shared/settings";

const bridge: JotrBridge = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<DesktopSettings>,
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch) as Promise<DesktopSettings>,
  onSettings: (fn) => void ipcRenderer.on("settings", (_e, s: DesktopSettings) => fn(s)),
  send: (c: Command) => ipcRenderer.send("cmd", c),
  onCommand: (fn) => void ipcRenderer.on("cmd", (_e, c: Command) => fn(c)),
  reportState: (s: PrompterState) => ipcRenderer.send("state", s),
  onState: (fn) => void ipcRenderer.on("state", (_e, s: PrompterState) => fn(s)),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  onLayout: (fn) => void ipcRenderer.on("layout", (_e, l: Layout) => fn(l)),
};

contextBridge.exposeInMainWorld("jotr", bridge);
