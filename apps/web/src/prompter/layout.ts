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
