import { memo, type ReactNode } from "react";
import type { ParsedScript } from "@promptsense/core";

interface Props {
  script: ParsedScript;
  onWordClick?: (index: number) => void;
}

/**
 * Renders the script once; live highlighting is applied by toggling classes
 * on the word spans directly, so speech updates never re-render this tree.
 */
export const ScriptText = memo(function ScriptText({ script, onWordClick }: Props) {
  const blocks: ReactNode[] = [];
  let para: ReactNode[] = [];
  let paraIndex = -1;
  let sectionIndex = -1;

  const flush = () => {
    if (para.length) blocks.push(<p className="para" key={`p${blocks.length}`}>{para}</p>);
    para = [];
  };

  for (const w of script.words) {
    if (w.section !== sectionIndex) {
      flush();
      sectionIndex = w.section;
      const title = script.sections[w.section]?.title;
      if (title) blocks.push(<div className="section-title" key={`s${w.section}`}>{title}</div>);
    }
    if (w.paragraph !== paraIndex) {
      flush();
      paraIndex = w.paragraph;
    }
    for (const cue of w.cues) para.push(<span className="cue" key={`c${w.index}${cue}`}>{cue}</span>);
    para.push(
      <span
        key={w.index}
        data-w={w.index}
        className={w.emphasis ? "w emph" : "w"}
        onClick={onWordClick ? () => onWordClick(w.index) : undefined}
      >
        {w.display}
      </span>,
      " ",
    );
  }
  flush();
  return <>{blocks}</>;
});

/** Apply spoken/current/hard classes by diffing against the previous state. */
export class WordHighlighter {
  private spans: HTMLElement[] = [];
  private current = -1;
  private hard: number | null = null;

  attach(content: HTMLElement): void {
    this.spans = [];
    content.querySelectorAll<HTMLElement>("[data-w]").forEach((el) => {
      this.spans[Number(el.dataset.w)] = el;
    });
    this.current = -1;
    this.hard = null;
  }

  update(current: number, hard: number | null): void {
    if (current !== this.current) {
      const lo = Math.min(current, this.current);
      const hi = Math.max(current, this.current);
      for (let i = Math.max(0, lo); i <= hi && i < this.spans.length; i++) {
        this.spans[i]?.classList.toggle("spoken", i < current);
      }
      if (this.current >= 0) this.spans[this.current]?.classList.remove("current");
      this.spans[current]?.classList.add("current");
      this.current = current;
    }
    if (hard !== this.hard) {
      if (this.hard !== null) this.spans[this.hard]?.classList.remove("hard");
      if (hard !== null) this.spans[hard]?.classList.add("hard");
      this.hard = hard;
    }
  }
}
