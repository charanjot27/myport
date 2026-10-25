/**
 * A slowly turning cloud of stars on a 2D canvas. The pointer acts as a
 * magnet: nearby stars are pulled toward it, swirl around it and shrink, then
 * spring back home when it leaves. Touch works the same way while scrolling.
 */

interface Star {
  // Home position on a unit sphere (or a flat field), and the live offset from it.
  x: number;
  y: number;
  z: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  twinkle: number;
}

export interface StarFieldOptions {
  count: number;
  shape: "sphere" | "field";
  /** Radius of the magnet's reach, in CSS pixels. */
  reach: number;
}

const COLORS = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#fff1e6", "#ffd8b5", "#ff8a3d", "#ff4d6d"];

export class StarField {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: Star[] = [];
  private readonly opts: StarFieldOptions;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private pointer = { x: -1e4, y: -1e4, active: false, vx: 0, vy: 0 };
  private angle = 0;
  private raf = 0;
  private last = 0;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: Partial<StarFieldOptions> = {},
  ) {
    this.ctx = canvas.getContext("2d", { alpha: true })!;
    this.opts = { count: 2400, shape: "sphere", reach: 210, ...options };
    for (let i = 0; i < this.opts.count; i++) this.stars.push(this.makeStar(i));
    this.resize();
  }

  private makeStar(i: number): Star {
    const n = this.opts.count;
    let x: number;
    let y: number;
    let z: number;
    if (this.opts.shape === "sphere") {
      // Denser toward the surface, with a sprinkle of loose stars outside it.
      const loose = i % 9 === 0;
      const golden = Math.PI * (3 - Math.sqrt(5));
      const yy = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - yy * yy);
      const th = golden * i;
      const depth = loose ? 1.15 + Math.random() * 0.9 : 0.55 + Math.pow(Math.random(), 0.35) * 0.45;
      x = Math.cos(th) * r * depth;
      y = yy * depth;
      z = Math.sin(th) * r * depth;
    } else {
      x = Math.random() * 2 - 1;
      y = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
    }
    return {
      x,
      y,
      z,
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
      size: 0.9 + Math.pow(Math.random(), 3) * 1.9,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (!this.running) this.draw(0);
  }

  /** Pointer position in canvas CSS pixels; pass null when it leaves. */
  setPointer(x: number | null, y = 0): void {
    if (x === null) {
      this.pointer.active = false;
      return;
    }
    if (this.pointer.active) {
      this.pointer.vx = x - this.pointer.x;
      this.pointer.vy = y - this.pointer.y;
    }
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw(dt: number): void {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.angle += dt * 0.07;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const tilt = 0.32;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const radius = this.opts.shape === "sphere" ? Math.min(w, h) * 0.4 : Math.max(w, h) * 0.6;
    const cx = w / 2;
    const cy = h / 2;
    const p = this.pointer;
    const reach = this.opts.reach;
    const reach2 = reach * reach;
    const t = performance.now() / 1000;
    // Pointer velocity decays so the swirl settles when the cursor rests.
    p.vx *= 0.9;
    p.vy *= 0.9;

    for (const s of this.stars) {
      // Rotate about Y, then tilt about X, then project.
      const x1 = s.x * cos - s.z * sin;
      const z1 = s.x * sin + s.z * cos;
      const y1 = s.y * ct - z1 * st;
      const z2 = s.y * st + z1 * ct;
      const persp = 1 / (1.9 - z2 * 0.55);
      const hx = cx + x1 * radius * persp * 1.6;
      const hy = cy + y1 * radius * persp * 1.6;

      // Magnet: pull toward the pointer with a little swirl, then spring home.
      let ax = -s.ox * 9 - s.vx * 5.5;
      let ay = -s.oy * 9 - s.vy * 5.5;
      let shrink = 1;
      if (p.active) {
        const dx = p.x - (hx + s.ox);
        const dy = p.y - (hy + s.oy);
        const d2 = dx * dx + dy * dy;
        if (d2 < reach2) {
          const d = Math.sqrt(d2) || 1;
          const f = 1 - d / reach;
          const pull = f * f * 4200;
          ax += (dx / d) * pull + (-dy / d) * pull * 0.45 + p.vx * f * 30;
          ay += (dy / d) * pull + (dx / d) * pull * 0.45 + p.vy * f * 30;
          shrink = 0.25 + 0.75 * (d / reach);
        }
      }
      s.vx += ax * dt;
      s.vy += ay * dt;
      s.ox += s.vx * dt;
      s.oy += s.vy * dt;

      const depth = (z2 + 1.4) / 2.8; // 0 back .. 1 front
      const size = s.size * (0.55 + depth * 0.9) * shrink;
      const alpha = Math.max(0.15, Math.min(1, 0.4 + depth * 0.7)) * (0.75 + 0.25 * Math.sin(t * 2 + s.twinkle));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.fillRect(hx + s.ox - size / 2, hy + s.oy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}
