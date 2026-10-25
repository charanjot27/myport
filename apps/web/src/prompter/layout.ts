/**
 * Measures where each script word sits inside the scrolling text so speech
 * positions map to scroll offsets and gaze points map back to words.
 */

export interface LineBox {
  top: number;
  bottom: number;
  firstWord: number;
  lastWord: number;
}

export class ScriptLayout {
  tops: number[] = [];
  lefts: number[] = [];
  widths: number[] = [];
  lineOf: number[] = [];
  lines: LineBox[] = [];
  contentHeight = 0;

  /** Re-measure after render, resize or font change. `content` holds spans with data-w attributes. */
  measure(content: HTMLElement): void {
    const spans = content.querySelectorAll<HTMLElement>("[data-w]");
    const n = spans.length;
    this.tops = new Array(n);
    this.lefts = new Array(n);
    this.widths = new Array(n);
    this.lineOf = new Array(n);
    this.lines = [];
    let line: LineBox | null = null;
    spans.forEach((el) => {
      const i = Number(el.dataset.w);
      const top = el.offsetTop;
      const h = el.offsetHeight;
      this.tops[i] = top;
      this.lefts[i] = el.offsetLeft;
      this.widths[i] = el.offsetWidth;
      if (!line || Math.abs(top - line.top) > h * 0.5) {
        line = { top, bottom: top + h, firstWord: i, lastWord: i };
        this.lines.push(line);
      } else {
        line.lastWord = i;
        line.bottom = Math.max(line.bottom, top + h);
      }
      this.lineOf[i] = this.lines.length - 1;
    });
    this.contentHeight = content.scrollHeight;
  }

  wordTop(i: number): number {
    if (!this.tops.length) return 0;
    return this.tops[Math.max(0, Math.min(this.tops.length - 1, i))] ?? 0;
  }

  /**
   * Scroll offset for a fractional reading position: moves through each line in
   * proportion to the words read, so the text glides instead of jumping a line
   * at a time. Equals the line's top at its first word and the next line's top
   * after its last word.
   *
   * `headroomLines` is how much space sits above the reading line. With less
   * than a line (the small window under the camera) the text holds still while
   * a line is read and glides to the next one as its last word is spoken, so
   * the current line never slides out of view.
   */
  continuousTop(position: number, headroomLines = 1): number {
    if (!this.tops.length) return 0;
    const w = Math.max(0, Math.min(this.tops.length - 1, Math.floor(position)));
    const li = this.lineOf[w] ?? 0;
    const line = this.lines[li];
    if (!line) return this.wordTop(w);
    const count = line.lastWord - line.firstWord + 1;
    const next = this.lines[li + 1];
    const span = (next ? next.top : line.bottom) - line.top;
    if (headroomLines >= 1) return line.top + Math.max(0, Math.min(1, (position - line.firstWord) / count)) * span;
    const t = Math.max(0, Math.min(1, (position - (line.lastWord + 0.45)) / 0.55));
    return line.top + t * t * (3 - 2 * t) * span;
  }

  /**
   * Map a gaze point (viewport pixels) to the nearest script word. Webcam gaze
   * is only reliable to about a line, so we pick the line first, then
   * interpolate across it by x.
   */
  wordAtPoint(px: number, py: number, viewport: DOMRect, scrollTop: number, mirrored: boolean): number | null {
    if (!this.lines.length) return null;
    if (px < viewport.left - 40 || px > viewport.right + 40 || py < viewport.top - 40 || py > viewport.bottom + 40) return null;
    const y = py - viewport.top + scrollTop;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i]!;
      const mid = (l.top + l.bottom) / 2;
      const d = Math.abs(mid - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const line = this.lines[best]!;
    let x = px - viewport.left;
    if (mirrored) x = viewport.width - x;
    let wordIdx = line.firstWord;
    for (let w = line.firstWord; w <= line.lastWord; w++) {
      if ((this.lefts[w] ?? 0) <= x) wordIdx = w;
    }
    return wordIdx;
  }
}
