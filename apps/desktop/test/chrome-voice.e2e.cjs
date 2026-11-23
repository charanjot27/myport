// Launches the real app (fresh settings), presses Start, then acts as the Chrome listener window:
// connects to the app's local WebSocket like listen.html does and sends speech results word by word.
// Run: xvfb-run -a npx electron --no-sandbox -r ./test/chrome-voice.e2e.cjs .
const { app, BrowserWindow, shell } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "jotr-test-")));
shell.openExternal = async () => {}; // no real browser here
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(() => setTimeout(async () => {
  try {
    const notch = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("notch"));
    const js = (s) => notch.webContents.executeJavaScript(s);
    notch.webContents.send("cmd", "start");
    await wait(1200);
    // The listener page is served by the app.
    const page = await fetch("http://localhost:47831/listen").then((r) => r.text());
    if (!page.includes("JOTR")) return fail("listener page not served");
    // Wrong origin is refused.
    const bad = new WebSocket("ws://localhost:47831/ws", { headers: { Origin: "https://evil.example" } });
    const badClosed = await new Promise((r) => { bad.on("close", (c) => r(c)); bad.on("error", () => r("error")); });
    if (badClosed !== 1008 && badClosed !== "error") return fail("foreign origin accepted: " + badClosed);
    const ws = new WebSocket("ws://localhost:47831/ws", { headers: { Origin: "http://localhost:47831" } });
    const startMsg = await new Promise((resolve, reject) => {
      ws.on("open", () => ws.send(JSON.stringify({ type: "hello" })));
      ws.on("message", (m) => resolve(JSON.parse(String(m))));
      setTimeout(() => reject(new Error("no start message")), 4000);
    });
    if (startMsg.type !== "start") return fail("expected start, got " + JSON.stringify(startMsg));
    ws.send(JSON.stringify({ type: "status", status: "on" }));
    const words = "hi I'm using JOTR a teleprompter that sits right under my camera it floats over every app".split(" ");
    for (let i = 1; i <= words.length; i++) {
      ws.send(JSON.stringify({ type: "transcript", text: words.slice(0, i).join(" "), isFinal: false }));
      await wait(260);
    }
    ws.send(JSON.stringify({ type: "transcript", text: words.join(" "), isFinal: true }));
    await wait(2500); 
    const now = Number(await js("document.querySelector('.w.now')?.dataset.i ?? -1"));
    const word = await js("document.querySelector('.w.now')?.textContent");
    if (now < 14 || now > 18) return fail(`notch at word ${now} (${word}), expected about 16 ("app,")`);
    // Pause tells Chrome to stop listening.
    const stopped = new Promise((r) => ws.on("message", (m) => JSON.parse(String(m)).type === "stop" && r(true)));
    notch.webContents.send("cmd", "toggle-pause");
    if (!(await Promise.race([stopped, wait(3000).then(() => false)]))) return fail("pause did not stop Chrome listening");
    console.log(`PASS: lang=${startMsg.lang}, notch followed to word ${now} "${word}"`);
    console.log("quitting"); app.quit();
  } catch (e) { fail(e.stack); }
}, 3500));
