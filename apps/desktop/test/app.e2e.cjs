// Launches the real app on a virtual display and checks the prompter window.
// Run: xvfb-run -a npx electron --no-sandbox -r ./test/app.e2e.cjs .   (exit code 0 = pass)
const { app, BrowserWindow, screen } = require("electron");
const fail = (m) => { console.error("FAIL:", m); app.exit(1); };
app.whenReady().then(() => setTimeout(async () => {
  const notch = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("notch"));
  if (!notch) return fail("no prompter window");
  const b = notch.getBounds();
  const d = screen.getPrimaryDisplay().bounds;
  if (!notch.isAlwaysOnTop()) return fail("prompter is not always on top");
  if (b.y !== d.y || Math.abs(b.x + b.width / 2 - (d.x + d.width / 2)) > 1) return fail(`prompter not under the notch: ${JSON.stringify(b)}`);
  const js = (s) => notch.webContents.executeJavaScript(s);
  if ((await js("document.querySelectorAll('.w').length")) < 10) return fail("script not rendered");
  // Manual scroll moves to the next line; clicking a word jumps there.
  const caret0 = await js("document.getElementById('caret').style.transform");
  await js("document.getElementById('viewport').dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))");
  await new Promise((r) => setTimeout(r, 800));
  if ((await js("document.querySelector('.w.now').dataset.i")) === "0") return fail("wheel did not scroll");
  await js("document.querySelectorAll('.w')[5].click()");
  if ((await js("document.querySelector('.w.now').dataset.i")) !== "5") return fail("click did not jump");
  console.log("PASS", JSON.stringify(b), caret0 ? "" : "");
  app.exit(0);
}, 3500));
