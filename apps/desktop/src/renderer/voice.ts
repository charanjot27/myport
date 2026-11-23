/**
 * Live voice analysis from the microphone, all on this computer:
 * - speaking or not (adaptive to the room's noise),
 * - loudness (0..1) and pitch relative to your own voice (0..1), for the glow,
 * - syllables per second, so "voice pace" can scroll at your speed in any language.
 */

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / buf.length);
}

/**
 * Fundamental frequency by normalised autocorrelation, searched over the
 * range of human speech (70–450 Hz). Returns clarity 0..1; below ~0.5 the
 * frame is unvoiced (a consonant, a breath or noise).
 */
export function detectPitch(buf: Float32Array, sampleRate: number): { hz: number; clarity: number } {
  const minLag = Math.floor(sampleRate / 450);
  const maxLag = Math.min(Math.floor(sampleRate / 70), buf.length - 1);
  const n = buf.length - maxLag;
  if (n < 64) return { hz: 0, clarity: 0 };
  let energy0 = 0;
  for (let i = 0; i < n; i++) energy0 += buf[i]! * buf[i]!;
  if (energy0 < 1e-7) return { hz: 0, clarity: 0 };

  let best = -1;
  let bestLag = 0;
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    let e = 0;
    for (let i = 0; i < n; i++) {
      c += buf[i]! * buf[i + lag]!;
      e += buf[i + lag]! * buf[i + lag]!;
    }
    const v = c / Math.sqrt(energy0 * e || 1);
    corr[lag] = v;
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  // Prefer the shortest lag that is nearly as strong (avoids picking an octave too low).
  for (let lag = minLag; lag < bestLag; lag++) {
    if (corr[lag]! > best * 0.92 && corr[lag]! >= corr[lag - 1]! && corr[lag]! >= corr[lag + 1]!) {
      bestLag = lag;
      best = corr[lag]!;
      break;
    }
  }
  // Parabolic interpolation around the peak for sub-sample accuracy.
  const a = corr[bestLag - 1] ?? best;
  const c = corr[bestLag + 1] ?? best;
  const denom = a - 2 * best + c;
  const shift = denom ? (0.5 * (a - c)) / denom : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  return { hz: sampleRate / lag, clarity: Math.max(0, Math.min(1, best)) };
}

export interface VoiceFrame {
  /** 0..1, relative to the room's noise floor. */
  level: number;
  speaking: boolean;
  /** 0..1 within your own speaking range (low voice ≈ 0, high voice ≈ 1). Holds its last value between voiced frames. */
  pitch: number;
  /** Raw pitch in Hz of this frame, or 0 if unvoiced. */
  hz: number;
  /** Syllables per second over the last few seconds of speech (0 until measured). */
  syllableRate: number;
}

export class VoiceMeter {
  private floorDb = -60;
  private lastSpeechT = -Infinity;
  private lo = Math.log2(105);
  private hi = Math.log2(250);
  private pitchNorm = 0.35;
  private envDb = -90;
  private trough = 0;
  private rising = false;
  private peakDb = -90;
  private lastPeakT = -Infinity;
  private peaks: number[] = [];
  private speechTime: Array<{ t: number; dt: number }> = [];
  private lastT = 0;

  push(buf: Float32Array, sampleRate: number, t: number): VoiceFrame {
    const dt = this.lastT ? Math.min(0.1, (t - this.lastT) / 1000) : 0.016;
    this.lastT = t;
    const db = 20 * Math.log10(rms(buf) + 1e-9);

    // Noise floor: follows quiet moments quickly, rises only slowly while you talk.
    this.floorDb = db < this.floorDb ? this.floorDb + (db - this.floorDb) * 0.25 : this.floorDb + Math.min(db - this.floorDb, 6) * 0.0015;
    this.floorDb = Math.max(-90, Math.min(-25, this.floorDb));
    const above = db - this.floorDb;
    if (above > 9) this.lastSpeechT = t;
    const speaking = t - this.lastSpeechT < 350;
    const level = Math.max(0, Math.min(1, (above - 3) / 30));

    // Pitch, normalised to the speaker's own range (learnt as they talk).
    let hz = 0;
    if (above > 9) {
      const p = detectPitch(buf, sampleRate);
      if (p.clarity > 0.55 && p.hz >= 70 && p.hz <= 450) {
        hz = p.hz;
        const x = Math.log2(p.hz);
        this.lo += (x - this.lo) * (x < this.lo ? 0.08 : 0.004);
        this.hi += (x - this.hi) * (x > this.hi ? 0.08 : 0.004);
        if (this.hi - this.lo < 0.5) this.hi = this.lo + 0.5; // at least half an octave of range
        const norm = Math.max(0, Math.min(1, (x - this.lo) / (this.hi - this.lo)));
        this.pitchNorm += (norm - this.pitchNorm) * 0.35;
      }
    } else if (!speaking) {
      this.pitchNorm += (0.2 - this.pitchNorm) * 0.03; // settle low in silence
    }

    // Syllable nuclei: peaks in the smoothed loudness envelope, at least 4 dB above the dip before them.
    this.envDb += (db - this.envDb) * 0.35;
    if (speaking) {
      this.speechTime.push({ t, dt });
      if (this.envDb > this.peakDb) {
        this.peakDb = this.envDb;
        this.rising = this.envDb - this.trough > 4;
      } else if (this.rising && this.peakDb - this.envDb > 2.5 && t - this.lastPeakT > 110) {
        this.peaks.push(t);
        this.lastPeakT = t;
        this.rising = false;
        this.trough = this.envDb;
        this.peakDb = this.envDb;
      } else if (!this.rising) {
        this.trough = Math.min(this.trough, this.envDb);
        this.peakDb = this.envDb;
        if (this.envDb - this.trough > 4) this.rising = true;
      }
    } else {
      this.trough = this.envDb;
      this.peakDb = this.envDb;
      this.rising = false;
    }
    const since = t - 4000;
    while (this.peaks.length && this.peaks[0]! < since) this.peaks.shift();
    while (this.speechTime.length && this.speechTime[0]!.t < since) this.speechTime.shift();
    const talked = this.speechTime.reduce((s, f) => s + f.dt, 0);
    const syllableRate = talked > 1.2 ? this.peaks.length / talked : 0;

    return { level, speaking, pitch: this.pitchNorm, hz, syllableRate };
  }
}

/** Opens the microphone and calls back every animation frame with a VoiceFrame. */
export async function startVoice(onFrame: (f: VoiceFrame) => void, deviceId?: string): Promise<{ stream: MediaStream; stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const meter = new VoiceMeter();
  const buf = new Float32Array(analyser.fftSize);
  let raf = 0;
  const loop = (t: number) => {
    analyser.getFloatTimeDomainData(buf);
    onFrame(meter.push(buf, ctx.sampleRate, t));
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    stream,
    stop: () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
