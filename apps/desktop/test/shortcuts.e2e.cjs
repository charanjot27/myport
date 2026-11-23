// Checks the global shortcuts: ⌥Space/⌥H/⌥R always, arrows only while reading.
const { app, BrowserWindow, globalShortcut, shell } = require("electron");
const os = require("os"), path = require("path"), fs = require("fs");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "jotr-keys-")));
shell.openExternal = async () => {};
const mod = process.platform === "darwin" ? "Alt+" : "Control+Alt+";
const fail = (m) => { console.error("FAIL:", m); app.quit(); process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(() => setTimeout(async () => {
  for (const k of ["Shift+S", "H", "R"]) if (!globalShortcut.isRegistered(mod + k)) return fail(`${mod + k} not registered`);
  if (globalShortcut.isRegistered("CommandOrControl+Shift+Space")) return fail("old Siri-clashing shortcut still registered");
  if (globalShortcut.isRegistered(mod + "Up")) return fail("arrow shortcut active while not reading");
  const notch = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("notch"));
  notch.webContents.send("cmd", "start");
  await wait(2500);
  if (!globalShortcut.isRegistered(mod + "Up")) return fail("arrow shortcut not active while reading");
  notch.webContents.send("cmd", "toggle-pause");
  await wait(1500);
  if (globalShortcut.isRegistered(mod + "Up")) return fail("arrow shortcut still active after pause");
  console.log("PASS: shortcuts", ["Shift+S", "H", "R"].map((k) => mod + k).join(", "));
  app.quit();
}, 3500));
