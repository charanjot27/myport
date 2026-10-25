/**
 * Lightweight voice activity and noise estimate from the mic stream. Runs on
 * an AnalyserNode (no worklet needed) and tracks an adaptive noise floor so it
 * works in quiet rooms and on noisy stages. The SNR estimate feeds the lip
 * fallback (module 3): as SNR drops, vision gets more weight.
 */
export class VoiceActivity {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private noiseFloor = 0.003;
  private hangUntil = 0;
  level = 0;
  speaking = false;

  start(stream: MediaStream): void {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    this.ctx = ctx;
    this.analyser = analyser;
    this.buf = new Float32Array(analyser.fftSize);
  }

  /** Call once per animation frame. Returns whether the speaker is talking. */
  sample(now: number): boolean {
    if (!this.analyser || !this.buf) return false;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    const rms = Math.sqrt(sum / this.buf.length);
    this.level = rms;
    // The floor follows quiet periods quickly and loud periods very slowly.
    const rate = rms < this.noiseFloor ? 0.05 : 0.0005;
    this.noiseFloor += (rms - this.noiseFloor) * rate;
    if (rms > this.noiseFloor * 3 + 0.004) this.hangUntil = now + 300;
    this.speaking = now < this.hangUntil;
    return this.speaking;
  }

  /** Rough SNR in dB of the current level over the noise floor. */
  get snrDb(): number {
    return 20 * Math.log10((this.level + 1e-6) / (this.noiseFloor + 1e-6));
  }

  stop(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
  }
}
