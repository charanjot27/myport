import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * A procedural laptop for the landing page: space-black aluminium, a notch at
 * the top of the display, and a live screen (JOTR's text hanging under the
 * camera). The lid opens with scroll progress, and each "closer look" mode
 * moves the camera and changes what the screen shows.
 */

export type ScreenMode = "notch" | "voice" | "glare" | "float" | "coach";

const W = 3.1; // width
const D = 2.15; // base depth
const BASE_H = 0.075;
const LID_T = 0.042;
const LID_H = D - 0.06;
const SCREEN_PX = { w: 1536, h: 1024 };

type View = { pos: THREE.Vector3; look: THREE.Vector3 };
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const VIEWS: Record<ScreenMode | "intro", View> = {
  intro: { pos: v(0, 5.2, 6.2), look: v(0, 0.2, 0) },
  voice: { pos: v(0, 2.05, 7.6), look: v(0, 0.78, -0.45) },
  notch: { pos: v(0, 2.45, 4.9), look: v(0, 1.5, -1.15) },
  glare: { pos: v(2.4, 1.95, 7.0), look: v(0, 0.8, -0.45) },
  float: { pos: v(-2.4, 1.85, 7.1), look: v(0, 0.8, -0.45) },
  coach: { pos: v(1.1, 2.7, 7.0), look: v(0, 0.75, -0.4) },
};

const SCRIPT =
  "Hi everyone, thanks for joining. Today I'll walk you through our launch plan, the three numbers that matter most, and what we need from each team this week. Let's start with where we are.".split(
    " ",
  );

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export class Laptop3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
  private readonly lid = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly screenCanvas = document.createElement("canvas");
  private readonly screenTex: THREE.CanvasTexture;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly look = v(0, 0.2, 0);
  private progress = 0;
  private shown = 0; // eased progress
  private mode: ScreenMode = "voice";
  private pointer = new THREE.Vector2();
  private word = 0;
  private lastWord = 0;
  private lastDraw = 0;
  private raf = 0;
  private last = 0;
  private running = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
    this.disposables.push(env, pmrem);
    room.traverse((o) => (o as THREE.Mesh).geometry?.dispose());

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 5, 4);
    const rim = new THREE.DirectionalLight(0xff9b6b, 1.3);
    rim.position.set(-3, 2.5, -4);
    const rim2 = new THREE.DirectionalLight(0xff5a78, 0.9);
    rim2.position.set(3.5, 1.5, -3);
    this.scene.add(key, rim, rim2, new THREE.AmbientLight(0xffffff, 0.12));

    this.screenCanvas.width = SCREEN_PX.w;
    this.screenCanvas.height = SCREEN_PX.h;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.disposables.push(this.screenTex);

    this.build();
    this.scene.add(this.rig);
    this.camera.position.copy(VIEWS.intro.pos);
    this.look.copy(VIEWS.intro.look);
    this.drawScreen();
    this.resize();
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.disposables.push(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  private build(): void {
    const alu = this.mat(
      new THREE.MeshPhysicalMaterial({ color: 0x1f1f23, metalness: 0.9, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    );
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x0b0b0d, metalness: 0.2, roughness: 0.75 }));

    // Base
    const base = new THREE.Mesh(this.geo(new RoundedBoxGeometry(W, BASE_H, D, 6, 0.035)), alu);
    base.position.y = BASE_H / 2;
    this.rig.add(base);

    // Keyboard well (canvas-drawn keys) and trackpad
    const keys = this.keyboardTexture();
    const kb = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(W * 0.86, D * 0.4)),
      this.mat(new THREE.MeshStandardMaterial({ map: keys, roughness: 0.8, metalness: 0.1 })),
    );
    kb.rotation.x = -Math.PI / 2;
    kb.position.set(0, BASE_H + 0.0015, -D * 0.17);
    this.rig.add(kb);
    const pad = new THREE.Mesh(
      this.geo(new RoundedBoxGeometry(W * 0.4, 0.004, D * 0.3, 2, 0.002)),
      this.mat(new THREE.MeshPhysicalMaterial({ color: 0x232327, metalness: 0.85, roughness: 0.22 })),
    );
    pad.position.set(0, BASE_H + 0.001, D * 0.26);
    this.rig.add(pad);

    // Soft contact shadow
    const sh = document.createElement("canvas");
    sh.width = sh.height = 256;
    const sc = sh.getContext("2d")!;
    const g = sc.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = g;
    sc.fillRect(0, 0, 256, 256);
    const shTex = new THREE.CanvasTexture(sh);
    this.disposables.push(shTex);
    const shadow = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(W * 1.6, D * 1.7)), this.mat(new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.001;
    this.rig.add(shadow);

    // Lid: pivots on the hinge at the back edge of the base.
    this.lid.position.set(0, BASE_H, -D / 2 + 0.03);
    const shell = new THREE.Mesh(this.geo(new RoundedBoxGeometry(W, LID_H, LID_T, 6, 0.03)), alu);
    shell.position.set(0, LID_H / 2, 0);
    this.lid.add(shell);
    const glass = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(W - 0.03, LID_H - 0.03)), this.mat(new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false })));
    glass.position.set(0, LID_H / 2, LID_T / 2 + 0.0015);
    this.lid.add(glass);
    // A faint reflective glass layer over the display.
    const gloss = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(W - 0.03, LID_H - 0.03)),
      this.mat(new THREE.MeshPhysicalMaterial({ color: 0x000000, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, clearcoat: 1 })),
    );
    gloss.position.set(0, LID_H / 2, LID_T / 2 + 0.003);
    this.lid.add(gloss);
    // Hinge
    const hinge = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.035, 0.035, W * 0.84, 24)), dark);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 0.0, 0);
    this.lid.add(hinge);
    this.rig.add(this.lid);
    this.rig.position.z = 0.35;
  }

  private keyboardTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 420;
    const x = c.getContext("2d")!;
    x.fillStyle = "#121214";
    x.fillRect(0, 0, c.width, c.height);
    const rows = [14, 14, 13, 12, 11];
    const pad = 18;
    const rowH = (c.height - pad * 2) / 6;
    // Function row (short keys)
    for (let k = 0; k < 14; k++) {
      const kw = (c.width - pad * 2) / 14;
      this.key(x, pad + k * kw + 3, pad + 2, kw - 6, rowH * 0.55);
    }
    rows.forEach((n, r) => {
      const y = pad + rowH * 0.75 + r * rowH;
      const kw = (c.width - pad * 2) / n;
      if (r === 4) {
        // Bottom row with a long space bar
        const small = (c.width - pad * 2) / 13;
        let cx = pad;
        for (let k = 0; k < 13; k++) {
          const w = k === 4 ? small * 5 : small;
          if (k > 8) break;
          this.key(x, cx + 3, y + 3, w - 6, rowH - 6);
          cx += w;
        }
        return;
      }
      for (let k = 0; k < n; k++) this.key(x, pad + k * kw + 3, y + 3, kw - 6, rowH - 6);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(t);
    return t;
  }

  private key(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number): void {
    x.fillStyle = "#050506";
    roundRect(x, px, py, w, h, 7);
    x.fill();
    x.strokeStyle = "rgba(255,255,255,0.06)";
    x.lineWidth = 1.5;
    x.stroke();
  }

  /* ------------------------------------------------------------- screen */

  private drawScreen(): void {
    this.lastDraw = performance.now();
    const c = this.screenCanvas.getContext("2d")!;
    const { w, h } = SCREEN_PX;
    c.fillStyle = "#000";
    c.fillRect(0, 0, w, h);
    const inset = 22;
    const sw = w - inset * 2;
    const sh = h - inset * 2;
    c.save();
    roundRect(c, inset, inset, sw, sh, 18);
    c.clip();
    // Wallpaper: deep ink with warm glows, like light leaking from the camera.
    c.fillStyle = "#0a0610";
    c.fillRect(inset, inset, sw, sh);
    glow(c, w * 0.5, -h * 0.05, h * 0.9, "rgba(255,138,61,0.55)");
    glow(c, w * 0.2, h * 0.9, h * 0.7, "rgba(255,77,109,0.35)");
    glow(c, w * 0.85, h * 0.75, h * 0.6, "rgba(155,92,255,0.28)");

    if (this.mode === "float") this.drawCall(c, inset, sw, sh);
    if (this.mode === "coach") this.drawReport(c, w, h);

    // The prompter hanging from the notch
    if (this.mode !== "coach") {
      const dim = this.mode === "glare" ? 0.42 : 1;
      const pw = this.mode === "float" ? 520 : 760;
      const ph = this.mode === "float" ? 128 : 178;
      c.fillStyle = "#040305";
      c.shadowColor = "rgba(255,120,60,0.45)";
      c.shadowBlur = 60;
      roundRect(c, w / 2 - pw / 2, inset - 30, pw, ph + 30, 34);
      c.fill();
      c.shadowBlur = 0;
      this.drawWords(c, w / 2 - pw / 2 + 40, inset + 52, pw - 80, this.mode === "float" ? 30 : 40, dim);
      if (this.mode === "glare") this.drawBrightness(c, w, h);
      if (this.mode === "voice" || this.mode === "notch") this.drawWave(c, w, h);
    }
    c.restore();

    // Notch with camera
    c.fillStyle = "#000";
    roundRect(c, w / 2 - 110, -20, 220, 64, 18);
    c.fill();
    const cam = c.createRadialGradient(w / 2 - 3, 19, 1, w / 2, 21, 10);
    cam.addColorStop(0, "#6f7aa6");
    cam.addColorStop(0.5, "#151826");
    cam.addColorStop(1, "#000");
    c.fillStyle = cam;
    c.beginPath();
    c.arc(w / 2, 21, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2ee6a6";
    c.beginPath();
    c.arc(w / 2 + 22, 21, 3.5, 0, Math.PI * 2);
    c.fill();
    this.screenTex.needsUpdate = true;
  }

  private drawWords(c: CanvasRenderingContext2D, x: number, y: number, maxW: number, size: number, dim: number): void {
    c.font = `500 ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    c.textBaseline = "top";
    const lineH = size * 1.55;
    // Lay out lines, then show the two around the current word.
    const lines: Array<Array<{ w: string; i: number; x: number }>> = [[]];
    let cx = 0;
    SCRIPT.forEach((word, i) => {
      const ww = c.measureText(word + " ").width;
      if (cx + ww > maxW && cx > 0) {
        lines.push([]);
        cx = 0;
      }
      lines[lines.length - 1]!.push({ w: word, i, x: cx });
      cx += ww;
    });
    const cur = lines.findIndex((l) => l.some((t) => t.i === this.word));
    const first = Math.max(0, cur);
    for (let r = 0; r < 2; r++) {
      const line = lines[first + r];
      if (!line) break;
      for (const t of line) {
        const said = t.i < this.word;
        const now = t.i === this.word;
        const a = (now ? 1 : said ? 0.35 : r === 0 ? 0.85 : 0.45) * dim;
        c.fillStyle = now ? `rgba(255,255,255,${a})` : `rgba(255,216,181,${a})`;
        c.fillText(t.w, x + t.x, y + r * lineH);
        if (now) {
          const tw = c.measureText(t.w).width;
          const g = c.createLinearGradient(x + t.x, 0, x + t.x + tw, 0);
          g.addColorStop(0, "#ff4d6d");
          g.addColorStop(1, "#ffc93c");
          c.fillStyle = g;
          c.fillRect(x + t.x, y + r * lineH + size * 1.18, tw, 4);
        }
      }
    }
  }

  private drawWave(c: CanvasRenderingContext2D, w: number, h: number): void {
    const n = 34;
    const bw = 10;
    const gap = 8;
    const total = n * (bw + gap);
    const x0 = w / 2 - total / 2;
    const y = h * 0.82;
    const t = performance.now() / 1000;
    for (let k = 0; k < n; k++) {
      const amp = 0.25 + 0.75 * Math.abs(Math.sin(t * 3 + k * 0.55) * Math.cos(t * 1.7 + k * 0.23));
      const bh = 12 + amp * 70;
      const g = c.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
      g.addColorStop(0, "#ffc93c");
      g.addColorStop(1, "#ff4d6d");
      c.fillStyle = g;
      roundRect(c, x0 + k * (bw + gap), y - bh / 2, bw, bh, 5);
      c.fill();
    }
    c.font = `600 26px -apple-system, "SF Pro Text", Inter, sans-serif`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.textAlign = "center";
    c.fillText("Listening · following your voice", w / 2, y + 70);
    c.textAlign = "left";
  }

  private drawBrightness(c: CanvasRenderingContext2D, w: number, h: number): void {
    const bw = 620;
    const x = w / 2 - bw / 2;
    const y = h * 0.74;
    c.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(c, x, y, bw, 96, 26);
    c.fill();
    c.font = `600 28px -apple-system, "SF Pro Text", Inter, sans-serif`;
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fillText("Auto brightness", x + 32, y + 30);
    c.fillStyle = "#ffb547";
    c.textAlign = "right";
    c.fillText("38%", x + bw - 32, y + 30);
    c.textAlign = "left";
    c.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(c, x + 32, y + 70, bw - 64, 8, 4);
    c.fill();
    const g = c.createLinearGradient(x + 32, 0, x + bw - 32, 0);
    g.addColorStop(0, "#ff4d6d");
    g.addColorStop(1, "#ffc93c");
    c.fillStyle = g;
    roundRect(c, x + 32, y + 70, (bw - 64) * 0.38, 8, 4);
    c.fill();
  }

  private drawCall(c: CanvasRenderingContext2D, inset: number, sw: number, sh: number): void {
    const cols = 3;
    const rows = 2;
    const pad = 26;
    const top = inset + 190;
    const tw = (sw - pad * (cols + 1)) / cols;
    const th = (sh - 190 - pad * (rows + 1)) / rows;
    const names = ["Priya", "Marco", "You", "Aiko", "Sam", "Lena"];
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        const x = inset + pad + k * (tw + pad);
        const y = top + pad + r * (th + pad);
        c.fillStyle = "#17121c";
        roundRect(c, x, y, tw, th, 20);
        c.fill();
        // Silhouette
        const cx = x + tw / 2;
        const g = c.createLinearGradient(0, y, 0, y + th);
        g.addColorStop(0, "#3a2a30");
        g.addColorStop(1, "#1a1216");
        c.fillStyle = g;
        c.beginPath();
        c.arc(cx, y + th * 0.42, th * 0.17, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(cx, y + th * 1.02, th * 0.4, th * 0.36, 0, Math.PI, 0);
        c.fill();
        const name = names[r * cols + k]!;
        if (name === "You") {
          c.strokeStyle = "#2ee6a6";
          c.lineWidth = 4;
          roundRect(c, x, y, tw, th, 20);
          c.stroke();
        }
        c.font = `600 22px -apple-system, Inter, sans-serif`;
        c.fillStyle = "rgba(0,0,0,0.55)";
        roundRect(c, x + 14, y + th - 46, c.measureText(name).width + 24, 34, 10);
        c.fill();
        c.fillStyle = "#fff";
        c.fillText(name, x + 26, y + th - 38);
      }
  }

  private drawReport(c: CanvasRenderingContext2D, w: number, h: number): void {
    const cw = 900;
    const ch = 560;
    const x = w / 2 - cw / 2;
    const y = h / 2 - ch / 2 + 30;
    c.fillStyle = "rgba(20,14,24,0.92)";
    roundRect(c, x, y, cw, ch, 36);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.08)";
    c.lineWidth = 2;
    c.stroke();
    // Score ring
    const rx = x + 220;
    const ry = y + ch / 2;
    c.lineWidth = 26;
    c.strokeStyle = "rgba(255,255,255,0.08)";
    c.beginPath();
    c.arc(rx, ry, 130, 0, Math.PI * 2);
    c.stroke();
    const g = c.createLinearGradient(rx - 130, ry - 130, rx + 130, ry + 130);
    g.addColorStop(0, "#ff4d6d");
    g.addColorStop(1, "#ffc93c");
    c.strokeStyle = g;
    c.lineCap = "round";
    c.beginPath();
    c.arc(rx, ry, 130, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.86);
    c.stroke();
    c.lineCap = "butt";
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.font = `800 92px -apple-system, Inter, sans-serif`;
    c.fillText("86", rx, ry - 20);
    c.font = `600 24px -apple-system, Inter, sans-serif`;
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.fillText("TAKE SCORE", rx, ry + 64);
    c.textAlign = "left";
    const rows: Array<[string, string]> = [
      ["Pace", "148 wpm"],
      ["Filler words", "2"],
      ["Eye contact", "94%"],
      ["Caught early", "3 of 4"],
    ];
    rows.forEach(([k, val], i) => {
      const ly = y + 120 + i * 96;
      c.font = `500 30px -apple-system, Inter, sans-serif`;
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillText(k, x + 430, ly);
      c.font = `700 34px -apple-system, Inter, sans-serif`;
      c.fillStyle = "#fff";
      c.textAlign = "right";
      c.fillText(val, x + cw - 60, ly);
      c.textAlign = "left";
      if (i < rows.length - 1) {
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.fillRect(x + 430, ly + 58, cw - 490, 2);
      }
    });
  }

  /* ------------------------------------------------------------ control */

  setProgress(p: number): void {
    this.progress = Math.min(1, Math.max(0, p));
  }

  setMode(m: ScreenMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.drawScreen();
    this.renderOnce();
  }

  setPointer(x: number, y: number): void {
    this.pointer.set(x, y);
  }

  resize(): void {
    const { clientWidth: cw, clientHeight: ch } = this.canvas;
    if (!cw || !ch) return;
    this.renderer.setSize(cw, ch, false);
    this.camera.aspect = cw / ch;
    // Keep the whole laptop in frame on narrow screens.
    this.camera.fov = cw / ch < 1.1 ? 40 : 28;
    // On wide panels the pills sit on the left, so shift the laptop to the right.
    if (cw / ch > 1.35) this.camera.setViewOffset(cw, ch, -cw * 0.14, 0, cw, ch);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private renderOnce(): void {
    if (!this.running) this.frame(performance.now());
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * 4.5);
    this.shown += (this.progress - this.shown) * k;
    const p = easeInOut(this.shown);

    // Lid: closed (0°) to open (~105°).
    const angle = THREE.MathUtils.degToRad(p * 105);
    this.lid.rotation.x = Math.PI / 2 - angle;

    // Camera: from the intro view toward the selected mode as the lid opens.
    const target = VIEWS[this.mode];
    const pos = VIEWS.intro.pos.clone().lerp(target.pos, p);
    const look = VIEWS.intro.look.clone().lerp(target.look, p);
    pos.x += this.pointer.x * 0.35 * p;
    pos.y += this.pointer.y * 0.2 * p;
    this.camera.position.lerp(pos, k);
    this.look.lerp(look, k);
    this.camera.lookAt(this.look);
    this.rig.rotation.y = (1 - p) * -0.35;

    if (now - this.lastWord > 300) {
      this.lastWord = now;
      this.word = (this.word + 1) % (SCRIPT.length + 6);
      if (this.word >= SCRIPT.length) this.word = SCRIPT.length - 1;
      if (this.word === SCRIPT.length - 1 && Math.random() < 0.2) this.word = 0;
      this.drawScreen();
    } else if ((this.mode === "voice" || this.mode === "notch") && now - this.lastDraw > 66) {
      this.drawScreen();
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.stop();
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
