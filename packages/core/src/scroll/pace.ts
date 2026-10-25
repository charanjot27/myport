/**
 * Continuous reading position between recogniser updates.
 *
 * Speech recognition reports words in bursts (every 200–600 ms, slower for
 * some languages), so following it directly makes the text step. ReadingPace
 * keeps a fractional word position that glides at the speaker's measured
 * pace while they are talking, may run at most `lead` words ahead of the last
 * confirmed word, catches up smoothly when recognition jumps forward, and
 * holds still in silence.
 */

export interface ReadingPaceOptions {
  /** How far (words) the position may run ahead of the last confirmed word while speaking. */
  lead: number;
  /** Starting pace guess, words per second. */
  initialRate: number;
}

export class ReadingPace {
  /** Fractional word index the reader is at. */
  position = 0;
  /** Smoothed speaking rate, words per second. */
  rate: number;
  private confirmed = 0;
  private last: { word: number; t: number } | null = null;
  private readonly opts: ReadingPaceOptions;

  constructor(options: Partial<ReadingPaceOptions> = {}) {
    this.opts = { lead: 0.9, initialRate: 2.4, ...options };
    this.rate = this.opts.initialRate;
  }

  /** Jump without gliding (seek, section change, restart). */
  reset(word: number): void {
    this.position = word;
    this.confirmed = word;
    this.last = null;
  }

  /** The recogniser confirmed the reader is on `word` at time `t` (ms). */
  confirm(word: number, t: number): void {
    if (word < this.position - 2.5 || word > this.position + 12) {
      // Re-read or skipped ahead: follow immediately, the scroll spring smooths the jump.
      this.reset(word);
      this.last = { word, t };
      return;
    }
    if (this.last && word > this.last.word && t > this.last.t) {
      const inst = (word - this.last.word) / ((t - this.last.t) / 1000);
      if (Number.isFinite(inst)) this.rate = this.rate * 0.75 + Math.max(0.6, Math.min(6, inst)) * 0.25;
    }
    if (!this.last || word !== this.last.word) this.last = { word, t };
    this.confirmed = Math.max(this.confirmed, word);
  }

  /** Advance by `dtMs`; `speaking` comes from voice activity detection. */
  step(dtMs: number, speaking: boolean): number {
    const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
    const behind = this.confirmed - this.position;
    if (behind > 0) {
      // Catch up quickly but continuously; faster the further behind we are.
      this.position += Math.min(behind, Math.max(this.rate, behind * 4) * dt);
    } else if (speaking) {
      // Keep gliding at the speaker's pace, but never far past what was heard.
      const room = this.confirmed + this.opts.lead - this.position;
      if (room > 0) this.position += Math.min(room, this.rate * dt * (0.4 + 0.6 * Math.min(1, room / this.opts.lead)));
    }
    return this.position;
  }
}
