import { describe, expect, it } from "vitest";
import { detectPitch, VoiceMeter } from "../src/renderer/voice";
import { placeAfterDrag, notchBounds } from "../src/shared/settings";

const SR = 48000;
/** A vowel-like tone: fundamental plus harmonics, with a little noise. */
function voice(hz: number, n = 2048, amp = 0.2, phase = 0): Float32Array {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i + phase) / SR;
    b[i] = amp * (Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(4 * Math.PI * hz * t) + 0.3 * Math.sin(6 * Math.PI * hz * t)) + (Math.random() - 0.5) * 0.002;
  }
  return b;
}
const noise = (n = 2048, amp = 0.001) => Float32Array.from({ length: n }, () => (Math.random() - 0.5) * amp);

describe("pitch", () => {
  it("finds the fundamental of low and high voices", () => {
    for (const hz of [95, 140, 210, 320]) {
      const p = detectPitch(voice(hz), SR);
      expect(p.clarity).toBeGreaterThan(0.8);
      expect(Math.abs(p.hz - hz) / hz).toBeLessThan(0.03);
    }
  });
  it("calls noise unvoiced", () => {
    expect(detectPitch(noise(2048, 0.2), SR).clarity).toBeLessThan(0.5);
  });
});

describe("VoiceMeter", () => {
  it("detects speech over room noise, and a higher voice raises the pitch level", () => {
    const m = new VoiceMeter();
    let t = 0;
    for (let i = 0; i < 120; i++) m.push(noise(), SR, (t += 16)); // 2 s of room noise
    const quiet = m.push(noise(), SR, (t += 16));
    expect(quiet.speaking).toBe(false);

    let low = quiet;
    for (let i = 0; i < 90; i++) low = m.push(voice(110, 2048, 0.2, i * 768), SR, (t += 16));
    expect(low.speaking).toBe(true);
    expect(low.level).toBeGreaterThan(0.5);

    let high = low;
    for (let i = 0; i < 90; i++) high = m.push(voice(260, 2048, 0.2, i * 768), SR, (t += 16));
    expect(high.pitch).toBeGreaterThan(low.pitch + 0.3);
  });

  it("measures syllables per second from the loudness rhythm", () => {
    const m = new VoiceMeter();
    let t = 0;
    for (let i = 0; i < 60; i++) m.push(noise(), SR, (t += 16));
    let f = m.push(noise(), SR, t);
    // 5 syllables a second: 120 ms voiced, 80 ms near-quiet, for 4 s.
    for (let i = 0; i < 250; i++) {
      const inSyllable = t % 200 < 120;
      f = m.push(inSyllable ? voice(150, 2048, 0.25, i * 768) : voice(150, 2048, 0.012, i * 768), SR, (t += 16));
    }
    expect(f.syllableRate).toBeGreaterThan(3.5);
    expect(f.syllableRate).toBeLessThan(6.5);
  });
});

describe("prompter placement", () => {
  const display = { x: 0, y: 0, width: 1512, height: 982 };
  it("snaps back under the notch when dropped near the top centre", () => {
    const r = placeAfterDrag({ x: 520, y: 30, width: 520, height: 120 }, display);
    expect(r.snapped).toBe(true);
    expect(r.bounds).toEqual(notchBounds(display, 520, 120));
    expect(r.bounds.x).toBe(496);
  });
  it("stays where it is dropped anywhere else, inside the screen", () => {
    expect(placeAfterDrag({ x: 100, y: 400, width: 520, height: 120 }, display)).toEqual({ snapped: false, bounds: { x: 100, y: 400, width: 520, height: 120 } });
    expect(placeAfterDrag({ x: 1400, y: 950, width: 520, height: 120 }, display).bounds).toEqual({ x: 992, y: 862, width: 520, height: 120 });
  });
});
