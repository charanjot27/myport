import { describe, expect, it } from "vitest";
import { AdaptiveBrightness } from "./adaptive";

/** Drive the controller at 30 fps with a simulated camera. */
function run(ctrl: AdaptiveBrightness, ms: number, env: { ambient: (t: number) => number; reflects: (level: number) => boolean }, t0 = 0) {
  let noise = 0;
  for (let t = t0; t < t0 + ms; t += 33) {
    const shown = ctrl.displayLevel(t);
    noise = (noise * 31 + 7) % 11;
    const glare = 150 + (env.reflects(shown) ? shown * 20 : 0) + noise * 0.15;
    ctrl.update(t, env.ambient(t), ctrl.wantsGlare(t) ? glare : null);
  }
  return t0 + ms;
}

const opts = { base: 0.9, ceiling: 1, firstProbeMs: 2000, probeEveryMs: 6000 };

describe("adaptive anti-glare", () => {
  it("never shows text above the ceiling in a very bright room", () => {
    const c = new AdaptiveBrightness({ ...opts, base: 1, ceiling: 0.6, probeEveryMs: 1e9 });
    run(c, 20_000, { ambient: (t) => (t < 3000 ? 100 : 400), reflects: () => false });
    expect(c.snapshot().level).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  it("lowers the ceiling until the reflection disappears", () => {
    const c = new AdaptiveBrightness(opts);
    // Reflections are visible above 50% brightness.
    run(c, 60_000, { ambient: () => 100, reflects: (l) => l > 0.5 });
    const s = c.snapshot();
    expect(s.lastProbe?.visible).toBe(false);
    expect(s.level).toBeLessThanOrEqual(0.52);
    expect(s.level).toBeGreaterThan(0.3);
  });

  it("keeps a clean level and does not dim without reflections", () => {
    const c = new AdaptiveBrightness(opts);
    run(c, 30_000, { ambient: () => 100, reflects: () => false });
    expect(c.snapshot().level).toBeGreaterThan(0.85);
  });

  it("dims in a darker room and brightens back, never above the ceiling", () => {
    const c = new AdaptiveBrightness({ ...opts, base: 0.7, ceiling: 0.8 });
    let t = run(c, 5000, { ambient: () => 120, reflects: () => false });
    t = run(c, 20_000, { ambient: () => 40, reflects: () => false }, t);
    const dark = c.snapshot();
    expect(dark.level).toBeLessThan(0.6);
    expect(dark.warm).toBe(true);
    expect(dark.weight).toBeGreaterThan(500);
    run(c, 20_000, { ambient: () => 300, reflects: () => false }, t);
    const bright = c.snapshot();
    expect(bright.level).toBeGreaterThan(0.7);
    // Never above the measured reflection-free ceiling (which only relaxes slowly after clean probes).
    expect(bright.level).toBeLessThanOrEqual(bright.ceiling + 1e-9);
    expect(bright.ceiling).toBeLessThan(0.95);
  });

  it("modulates only during probes", () => {
    const c = new AdaptiveBrightness(opts);
    run(c, 1000, { ambient: () => 100, reflects: () => false });
    expect(c.snapshot().probing).toBe(false);
    run(c, 1200, { ambient: () => 100, reflects: () => false }, 1000);
    expect(c.snapshot().probing).toBe(true);
    const levels = new Set([2500, 2900, 3300].map((t) => c.displayLevel(t).toFixed(2)));
    expect(levels.size).toBe(2);
  });
});
