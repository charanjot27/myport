import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { shell } from "electron";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * "Chrome voice": JOTR borrows the user's real Google Chrome for speech
 * recognition (free, multilingual, word by word: the same engine as the JOTR
 * website). The app serves a tiny listener page on localhost, opens it as a
 * small Chrome app window, and receives transcripts over a local WebSocket.
 * localhost is a secure context, so Chrome allows the microphone there.
 */

export interface ListenEvents {
  onTranscript(text: string, isFinal: boolean): void;
  onStatus(status: "starting" | "on" | "error" | "off", detail?: string): void;
}

const PORTS = [47831, 47832, 47833];

export class ChromeListener {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port = 0;
  private pending: { lang: string } | null = null;
  private launchedAt = 0;

  constructor(
    private readonly dir: string,
    private readonly events: ListenEvents,
  ) {}

  get url(): string {
    return `http://localhost:${this.port}/listen`;
  }

  get connected(): boolean {
    return !!this.client && this.client.readyState === this.client.OPEN;
  }

  async listen(): Promise<void> {
    if (this.server) return;
    const files: Record<string, [string, string]> = {
      "/listen": ["listen.html", "text/html; charset=utf-8"],
      "/listen.js": ["listen.js", "text/javascript; charset=utf-8"],
      "/logo.svg": ["../icons/logo.svg", "image/svg+xml"],
    };
    const server = createServer((req, res) => {
      const f = files[(req.url ?? "").split("?")[0]!];
      if (!f) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": f[1], "cache-control": "no-store" }).end(readFileSync(join(this.dir, f[0])));
    });
    for (const port of PORTS) {
      const ok = await new Promise<boolean>((resolve) => {
        server.once("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () => resolve(true));
      });
      if (ok) {
        this.port = port;
        break;
      }
    }
    if (!this.port) throw new Error("No free local port for the Chrome listener");
    this.server = server;
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws, req) => {
      // Only our own page may connect.
      const origin = req.headers.origin ?? "";
      if (origin !== `http://localhost:${this.port}` && origin !== `http://127.0.0.1:${this.port}`) {
        ws.close(1008);
        return;
      }
      this.client?.close();
      this.client = ws;
      ws.on("message", (raw) => {
        try {
          const m = JSON.parse(String(raw)) as { type: string; text?: string; isFinal?: boolean; status?: "on" | "error"; detail?: string };
          if (m.type === "transcript" && m.text) this.events.onTranscript(m.text, !!m.isFinal);
          else if (m.type === "status" && m.status) this.events.onStatus(m.status, m.detail);
          else if (m.type === "hello" && this.pending) this.send({ type: "start", lang: this.pending.lang });
        } catch {
          // ignore malformed messages
        }
      });
      ws.on("close", () => {
        if (this.client !== ws) return;
        this.client = null;
        if (this.pending) this.events.onStatus("error", "The Chrome listening window was closed. Press Start to open it again.");
      });
    });
  }

  /** Start listening in this language; opens the Chrome window if it isn't connected. */
  async start(lang: string): Promise<void> {
    await this.listen();
    this.pending = { lang };
    this.events.onStatus("starting");
    if (this.connected) this.send({ type: "start", lang });
    else if (Date.now() - this.launchedAt > 4000) this.launchChrome();
  }

  stop(): void {
    this.pending = null;
    this.send({ type: "stop" });
    this.events.onStatus("off");
  }

  close(): void {
    this.send({ type: "close" });
    this.wss?.close();
    this.server?.close();
  }

  private send(m: unknown): void {
    if (this.connected) this.client!.send(JSON.stringify(m));
  }

  private launchChrome(): void {
    this.launchedAt = Date.now();
    const args = [`--app=${this.url}`, "--window-size=360,300", "--window-position=40,80"];
    const fallback = () => {
      this.events.onStatus("starting", "Google Chrome not found: opened the listener in your default browser. Chrome gives the best results.");
      void shell.openExternal(this.url);
    };
    try {
      if (process.platform === "darwin") {
        const p = spawn("open", ["-na", "Google Chrome", "--args", ...args], { detached: true, stdio: "ignore" });
        p.on("exit", (code) => code && fallback());
        p.unref();
        return;
      }
      const exe = chromePath();
      if (!exe) return fallback();
      spawn(exe, args, { detached: true, stdio: "ignore" }).unref();
    } catch {
      fallback();
    }
  }
}

function chromePath(): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          join(process.env["PROGRAMFILES"] ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
          join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
          join(process.env["LOCALAPPDATA"] ?? "", "Google\\Chrome\\Application\\chrome.exe"),
        ]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}
