import { describe, expect, it } from "vitest";
import { targetsForFrame } from "./calibration";
import { classifyCamera, focusFrame, textColor } from "./device";
import { reflectionVisible, runReflectionCheck } from "./reflection";

describe("camera detection", () => {
  it("classifies common camera names", () => {
    expect(classifyCamera("FaceTime HD Camera")).toBe("built-in");
    expect(classifyCamera("MacBook Pro Camera (Built-in)")).toBe("built-in");
    expect(classifyCamera("Integrated Webcam (0bda:5650)")).toBe("built-in");
    expect(classifyCamera("Logitech BRIO (046d:085e)")).toBe("external");
    expect(classifyCamera("iPhone Camera")).toBe("phone");
    expect(classifyCamera("")).toBe("unknown");
  });
});

describe("text window", () => {
  const opts = { placement: { x: 0.5, edge: "top" as const }, fontSize: 40, lines: 3, columnWidth: 0.4 };
  it("sits centred under a top-centre camera", () => {
    const f = focusFrame(opts, 1440, 900, 720);
    expect(f.top).toBeLessThan(10);
    expect(f.left + f.width / 2).toBeCloseTo(720, 0);
    expect(f.height).toBeCloseTo(40 * 1.45 * 3.35, 0);
  });
  it("stays on screen for corner cameras and moves to the bottom edge", () => {
    const left = focusFrame({ ...opts, placement: { x: 0.05, edge: "top" } }, 1440, 900, 72);
    expect(left.left).toBe(12);
    const bottom = focusFrame({ ...opts, placement: { x: 0.5, edge: "bottom" } }, 1440, 900, 720);
    expect(bottom.top + bottom.height).toBeGreaterThan(880);
  });
  it("dims text colour with brightness", () => {
    expect(textColor(1, "neutral")).toBe("rgb(236, 236, 236)");
    expect(textColor(0.5, "warm")).toBe("rgb(128, 104, 75)");
  });
  it("puts calibration points inside the text window", () => {
    const f = focusFrame(opts, 1000, 800, 500);
    const t = targetsForFrame(f, 1000, 800);
    expect(t.calibrate).toHaveLength(5);
    for (const p of [...t.calibrate, ...t.validate]) {
      expect(p.x * 1000).toBeGreaterThanOrEqual(f.left);
      expect(p.x * 1000).toBeLessThanOrEqual(f.left + f.width);
      expect(p.y * 800).toBeGreaterThanOrEqual(f.top);
      expect(p.y * 800).toBeLessThanOrEqual(f.top + f.height);
    }
  });
});

describe("reflection check", () => {
  it("separates a real on/off difference from noise", () => {
    expect(reflectionVisible({ on: [200, 202, 201, 199, 203], off: [190, 191, 189, 190, 192] }).visible).toBe(true);
    expect(reflectionVisible({ on: [190, 195, 186, 193], off: [191, 188, 194, 189] }).visible).toBe(false);
  });

  it("dims until the reflection disappears", async () => {
    let shown: number | null = null;
    let n = 0;
    // Simulated eyes: the text reflects (adds glare) only above 55% brightness.
    const result = await runReflectionCheck({
      show: (l) => (shown = l),
      sample: () => 180 + (shown !== null && shown > 0.55 ? 15 * shown : 0) + ((n++ * 7) % 5) * 0.3,
      cycles: 2,
      phaseMs: 60,
    });
    expect(result.visibleAtFull).toBe(true);
    expect(result.level).toBe(0.5);
    expect(result.stillVisible).toBe(false);
    expect(shown).toBeNull();
  });

  it("refuses to guess without a face", async () => {
    await expect(runReflectionCheck({ show: () => undefined, sample: () => null, cycles: 1, phaseMs: 40 })).rejects.toThrow(/face/);
  });
});
