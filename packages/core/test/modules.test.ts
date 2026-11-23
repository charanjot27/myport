import { describe, expect, it } from "vitest";
import {
  buildReport,
  calibrationGrid,
  classifyHand,
  FEATURE_COUNT,
  fitBestGazeModel,
  fitGazeModel,
  isGazeModelCompatible,
  generateChallenge,
  GestureDebouncer,
  HeuristicStumblePredictor,
  OneEuroFilter,
  parseScript,
  predictGaze,
  readingFeatures,
  readingProbability,
  ReadingGate,
  RingBuffer,
  scoreLiveness,
  ScrollController,
  seededRandom,
  StumbleFeatureExtractor,
  StumbleMonitor,
  tintAt,
  type GazeSample,
  type Point3,
  type SessionRecord,
} from "../src/index.js";

describe("RingBuffer", () => {
  it("keeps the newest items", () => {
    const b = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((x) => b.push(x));
    expect(b.toArray()).toEqual([3, 4, 5]);
    expect(b.tail(2)).toEqual([4, 5]);
    expect(b.last()).toBe(5);
  });
});

describe("ScrollController", () => {
  it("settles on the target without overshoot", () => {
    const c = new ScrollController({ responseTime: 0.4 });
    c.setTarget(500);
    let max = 0;
    for (let i = 0; i < 120; i++) max = Math.max(max, c.step(16));
    expect(c.position).toBeCloseTo(500, 0);
    expect(max).toBeLessThanOrEqual(501);
  });
  it("holds still when paused and moves steadily in fixed mode", () => {
    const c = new ScrollController({ fixedSpeed: 50 });
    c.setTarget(300);
    c.step(16, { paused: true });
    expect(c.position).toBe(0);
    c.mode = "fixed";
    for (let i = 0; i < 10; i++) c.step(100);
    expect(c.position).toBeCloseTo(50, 0);
  });
});

describe("gaze calibration", () => {
  /** Synthetic face: weak noisy iris signal, stronger blendshape signal, small head jitter. */
  const face = (x: number, y: number, rand: () => number, headJitter = 0.002) => [
    0.5 + (x - 0.5) * 0.08 + (rand() - 0.5) * 0.01,
    (y - 0.3) * 0.05 + (rand() - 0.5) * 0.01,
    (x - 0.5) * 0.9 + (rand() - 0.5) * 0.05,
    -(y - 0.3) * 1.2 + (rand() - 0.5) * 0.05,
    (rand() - 0.5) * 0.02,
    (rand() - 0.5) * 0.02,
    0.5 + (rand() - 0.5) * headJitter,
    0.45 + (rand() - 0.5) * headJitter,
    0.3 + (rand() - 0.5) * headJitter,
  ];

  it("predicts unseen points accurately and picks a model by cross-validation", () => {
    const rand = seededRandom("calib");
    const samples = [];
    for (const p of calibrationGrid(0.1)) for (let k = 0; k < 12; k++) samples.push({ features: face(p.x, p.y, rand), x: p.x, y: p.y });
    const model = fitBestGazeModel(samples);
    expect(isGazeModelCompatible(model)).toBe(true);
    expect(model.cvError).toBeLessThan(0.06);
    let err = 0;
    const test = [{ x: 0.3, y: 0.2 }, { x: 0.7, y: 0.65 }, { x: 0.5, y: 0.35 }];
    for (const t of test) {
      const p = predictGaze(model, face(t.x, t.y, rand));
      err += Math.hypot(p.x - t.x, p.y - t.y);
    }
    expect(err / test.length).toBeLessThan(0.06);
  });

  it("does not amplify head jitter that was absent during calibration", () => {
    const rand = seededRandom("jitter");
    const samples = [];
    for (const p of calibrationGrid(0.1)) for (let k = 0; k < 12; k++) samples.push({ features: face(p.x, p.y, rand, 0.0001), x: p.x, y: p.y });
    const model = fitBestGazeModel(samples);
    const p = predictGaze(model, face(0.5, 0.5, rand, 0.02));
    expect(Math.hypot(p.x - 0.5, p.y - 0.5)).toBeLessThan(0.15);
  });

  it("rejects models fitted on an older feature layout", () => {
    expect(isGazeModelCompatible({ version: 1, mean: [0, 0, 0, 0, 0, 0, 0] })).toBe(false);
    const rand = seededRandom("x");
    const model = fitGazeModel(calibrationGrid().flatMap((p) => [0, 1].map(() => ({ features: face(p.x, p.y, rand), x: p.x, y: p.y }))));
    expect(Number.isNaN(predictGaze(model, [0.5, 0.1]).x)).toBe(true);
  });

  it("OneEuroFilter reduces jitter", () => {
    const f = new OneEuroFilter(1, 0.01);
    const rand = seededRandom("noise");
    let errRaw = 0;
    let errF = 0;
    for (let i = 0; i < 200; i++) {
      const noisy = 0.5 + (rand() - 0.5) * 0.1;
      errRaw += Math.abs(noisy - 0.5);
      errF += Math.abs(f.filter(noisy, i * 33) - 0.5);
    }
    expect(errF).toBeLessThan(errRaw * 0.5);
  });
});

function gazeStream(kind: "reading" | "glancing"): GazeSample[] {
  const rand = seededRandom(kind);
  const out: GazeSample[] = [];
  let t = 0;
  let x = 0.2;
  let y = 0.3;
  for (let fix = 0; fix < 14; fix++) {
    if (kind === "reading") {
      x += 0.06;
      if (x > 0.8) {
        x = 0.2;
        y += 0.05;
      }
    } else {
      x = rand();
      y = rand();
    }
    const dur = kind === "reading" ? 220 : 400 + rand() * 600;
    for (let s = 0; s < dur; s += 33) {
      out.push({ t, x: x + (rand() - 0.5) * 0.01, y: y + (rand() - 0.5) * 0.01, valid: true, blink: false, yaw: kind === "reading" ? 3 : 25, pitch: 0 });
      t += 33;
    }
  }
  return out;
}

describe("reading classifier", () => {
  const region = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.6 };
  it("separates reading from glancing", () => {
    const pr = readingProbability(readingFeatures(gazeStream("reading"), region));
    const pg = readingProbability(readingFeatures(gazeStream("glancing"), region));
    expect(pr).toBeGreaterThan(0.7);
    expect(pg).toBeLessThan(0.3);
  });
  it("gates with hysteresis and a ramp", () => {
    const g = new ReadingGate(0.65, 0.4, 200);
    expect(g.update(0.9, 100)).toBeCloseTo(0.5);
    expect(g.update(0.5, 100)).toBeCloseTo(1); // still active inside hysteresis band
    g.update(0.1, 50);
    expect(g.weight).toBeCloseTo(0.75);
  });
});

/** Build a synthetic hand: wrist at bottom, fingers pointing up, extended or curled. */
function hand(ext: [boolean, boolean, boolean, boolean], thumb: "out" | "in" | "up" | "down"): Point3[] {
  const p: Point3[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }));
  const bases = [0.42, 0.48, 0.54, 0.6];
  p[0] = { x: 0.5, y: 0.8, z: 0 };
  [5, 9, 13, 17].forEach((mcp, i) => {
    const x = bases[i]!;
    p[mcp] = { x, y: 0.62, z: 0 };
    if (ext[i]) {
      p[mcp + 1] = { x, y: 0.55, z: 0 };
      p[mcp + 2] = { x, y: 0.5, z: 0 };
      p[mcp + 3] = { x, y: 0.45, z: 0 };
    } else {
      p[mcp + 1] = { x, y: 0.58, z: 0 };
      p[mcp + 2] = { x, y: 0.64, z: 0 };
      p[mcp + 3] = { x, y: 0.67, z: 0 };
    }
  });
  p[1] = { x: 0.44, y: 0.76, z: 0 };
  p[2] = { x: 0.38, y: 0.72, z: 0 };
  if (thumb === "out") {
    p[3] = { x: 0.32, y: 0.68, z: 0 };
    p[4] = { x: 0.26, y: 0.64, z: 0 };
  } else if (thumb === "up") {
    p[3] = { x: 0.36, y: 0.62, z: 0 };
    p[4] = { x: 0.35, y: 0.52, z: 0 };
  } else if (thumb === "down") {
    p[2] = { x: 0.38, y: 0.66, z: 0 };
    p[3] = { x: 0.36, y: 0.76, z: 0 };
    p[4] = { x: 0.35, y: 0.86, z: 0 };
  } else {
    p[3] = { x: 0.43, y: 0.68, z: 0 };
    p[4] = { x: 0.46, y: 0.66, z: 0 };
  }
  return p;
}

describe("gestures", () => {
  it("classifies the core gestures", () => {
    expect(classifyHand(hand([true, true, true, true], "out"))).toBe("open_palm");
    expect(classifyHand(hand([true, true, false, false], "in"))).toBe("victory");
    expect(classifyHand(hand([true, false, false, false], "in"))).toBe("point_up");
    expect(classifyHand(hand([false, false, false, false], "in"))).toBe("fist");
    expect(classifyHand(hand([false, false, false, false], "up"))).toBe("thumbs_up");
    expect(classifyHand(hand([false, false, false, false], "down"))).toBe("thumbs_down");
  });
  it("fires once per hold with a cooldown", () => {
    const d = new GestureDebouncer();
    const fired = [];
    for (let t = 0; t <= 2000; t += 50) {
      const c = d.update("open_palm", t);
      if (c) fired.push([t, c]);
    }
    expect(fired).toEqual([[450, "toggle_pause"]]);
  });
});

describe("liveness", () => {
  const ch = generateChallenge("c1", "seed-123");
  it("is deterministic and photosensitivity-safe", () => {
    expect(generateChallenge("c1", "seed-123")).toEqual(ch);
    expect(ch.steps.every((s) => s.durationMs >= 350)).toBe(true);
  });

  const simulate = (live: boolean) => {
    const rand = seededRandom(live ? "live" : "fake");
    const samples = [];
    for (let t = 0; t < ch.totalMs + 300; t += 33) {
      const tint = tintAt(ch, t - 120) ?? [210, 210, 210];
      const base = [180, 130, 110];
      const rgb = base.map((b, c) => {
        const reflect = live ? (tint[c]! - 210) * 0.15 : (rand() - 0.5) * 12;
        return b + reflect + (rand() - 0.5) * 3;
      }) as [number, number, number];
      samples.push({ t, rgb });
    }
    return samples;
  };

  it("passes a face that reflects the tint with a delay", () => {
    const r = scoreLiveness(ch, simulate(true));
    expect(r.passed).toBe(true);
    expect(r.lagMs).toBeGreaterThanOrEqual(96);
    expect(r.lagMs).toBeLessThanOrEqual(144);
  });
  it("fails a face that does not", () => {
    expect(scoreLiveness(ch, simulate(false)).passed).toBe(false);
  });
});

describe("stumble prediction", () => {
  const script = parseScript("The quick brown fox jumps. Psycholinguistic phenomenology characterises extraordinarily idiosyncratic vocabularies.");
  it("rates a collapsed eye-voice span before hard words as risky", async () => {
    const ex = new StumbleFeatureExtractor(script);
    const healthy = ex.next({ t: 0, speechWord: 0, gazeWord: 2, speaking: true, alignConfidence: 0.9, offScript: false });
    expect(healthy.length).toBe(FEATURE_COUNT);
    const p = new HeuristicStumblePredictor();
    const ex2 = new StumbleFeatureExtractor(script);
    let risky = ex2.next({ t: 0, speechWord: 5, gazeWord: 6, speaking: true, alignConfidence: 0.9, offScript: false });
    for (let t = 100; t <= 1200; t += 100) {
      risky = ex2.next({ t, speechWord: 5, gazeWord: 5, speaking: true, alignConfidence: 0.9, offScript: false });
    }
    expect(p.predict([risky])).toBeGreaterThan(p.predict([healthy]) + 0.3);

    const m = new StumbleMonitor(p);
    let warning = false;
    for (let i = 0; i < 10; i++) warning = (await m.push(risky)).warning;
    expect(warning).toBe(true);
    expect(m.slowFactor).toBeLessThan(1);
  });
});

describe("coach report", () => {
  it("summarises a session", () => {
    const source = "Hello everyone. Welcome to the demo of our product today. We will show three things.";
    const s = parseScript(source);
    const tokenTimings = s.tokens.map((tk, i) => ({ token: tk.index, t: 1000 + i * 400 + (i >= 12 ? 1500 : 0) }));
    const record: SessionRecord = {
      version: 1,
      id: "s",
      scriptId: "x",
      scriptTitle: "Demo",
      scriptSource: source,
      startedAt: new Date(0).toISOString(),
      durationMs: 10000,
      tokenTimings,
      transcript: [{ t: 2000, text: "hello everyone um welcome", isFinal: true }],
      alignment: [
        { t: 1000, position: 1, confidence: 0.9, offScript: false, jumped: false },
        { t: 3000, position: 6, confidence: 0.9, offScript: false, jumped: false },
        { t: 3500, position: 3, confidence: 0.9, offScript: false, jumped: false },
      ],
      gaze: Array.from({ length: 100 }, (_, i) => ({ t: i * 100, x: 0.5, y: 0.3, valid: true, blink: false, yaw: i < 80 ? 2 : 40, pitch: 0 })),
      face: Array.from({ length: 100 }, (_, i) => ({ t: i * 100, cx: 0.5, cy: 0.5, scale: 0.3, roll: 2 })),
      stumbleRisk: [],
      events: [],
    };
    const r = buildReport(record);
    expect(r.wordsSpoken).toBe(s.words.length);
    expect(r.fillers.count).toBe(1);
    expect(r.stumbles.some((x) => x.kind === "restart")).toBe(true);
    expect(r.stumbles.some((x) => x.kind === "hesitation")).toBe(true);
    expect(r.eyeContactPct).toBe(80);
    expect(r.score).toBeGreaterThan(0);
    expect(r.tips.length).toBeGreaterThan(0);
  });
});

describe("ScrollController stalls", () => {
  it("catches up smoothly after a long frame instead of jumping", async () => {
    const { ScrollController } = await import("../src/scroll/controller.js");
    const s = new ScrollController();
    s.setBounds(10_000);
    s.setTarget(600);
    for (let i = 0; i < 10; i++) s.step(16.7);
    const before = s.position;
    s.step(100); // a 100 ms stall
    expect(s.position - before).toBeLessThanOrEqual((900 / 60) * 1.2 + 1e-6);
    for (let i = 0; i < 200; i++) s.step(16.7);
    expect(s.position).toBeCloseTo(600, 0);
  });
});
