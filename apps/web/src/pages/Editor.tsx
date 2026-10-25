import { estimateDuration, parseScript } from "@promptsense/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatDuration } from "../lib/format";
import { scripts, type StoredScript } from "../lib/storage";

export function EditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [script, setScript] = useState<StoredScript | null | undefined>(undefined);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number>(0);

  useEffect(() => {
    void scripts.get(id).then((s) => setScript(s && !s.deleted ? s : null));
  }, [id]);

  const parsed = useMemo(() => parseScript(script?.source ?? ""), [script?.source]);
  const hard = useMemo(
    () =>
      [...new Set(parsed.words.filter((w) => w.difficulty >= 0.55).map((w) => w.display.replace(/[^\p{L}\p{N}'-]/gu, "")))]
        .filter(Boolean)
        .slice(0, 40),
    [parsed],
  );

  const update = (patch: Partial<StoredScript>) => {
    if (!script) return;
    const next = { ...script, ...patch, updatedAt: new Date().toISOString() };
    setScript(next);
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void scripts.put(next).then(() => setSaved(true));
    }, 400);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (script === undefined) return <main className="page muted">Loading…</main>;
  if (script === null)
    return (
      <main className="page">
        <h1>Script not found</h1>
        <Link to="/app">Back to scripts</Link>
      </main>
    );

  return (
    <main className="page editor">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          type="text"
          aria-label="Title"
          value={script.title}
          onChange={(e) => update({ title: e.target.value })}
          style={{ fontSize: "1.3rem", fontWeight: 650, flex: 1, minWidth: 200 }}
        />
        <span className="muted" aria-live="polite">
          {saved ? "Saved" : "Saving…"}
        </span>
        <button
          className="btn primary"
          disabled={!parsed.words.length}
          onClick={() => {
            void scripts.put(script).then(() => navigate(`/prompt/${script.id}`));
          }}
        >
          Start prompting
        </button>
      </div>
      <textarea
        aria-label="Script"
        value={script.source}
        placeholder={"# Section title\nWrite what you'll say. Use [pause] for cues and *word* for emphasis."}
        onChange={(e) => update({ source: e.target.value })}
        spellCheck
      />
      <div className="tiles" style={{ marginTop: 14 }}>
        <div className="tile">
          <div className="label">Words</div>
          <div className="value">{parsed.words.length}</div>
        </div>
        <div className="tile">
          <div className="label">Est. time</div>
          <div className="value">{formatDuration(estimateDuration(parsed))}</div>
          <div className="sub">at 150 wpm</div>
        </div>
        <div className="tile">
          <div className="label">Sections</div>
          <div className="value">{parsed.sections.filter((s) => s.wordEnd > s.wordStart).length}</div>
        </div>
        <div className="tile">
          <div className="label">Sentences</div>
          <div className="value">{parsed.sentenceCount}</div>
        </div>
      </div>
      {hard.length > 0 && (
        <>
          <h2>Words you might trip on</h2>
          <p className="muted">JOTR watches these more closely and highlights them when you approach.</p>
          <div className="hard-list">
            {hard.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
        </>
      )}
      <h2>Formatting</h2>
      <ul className="muted">
        <li>
          <code># Title</code> starts a section (not read aloud). Gestures and keys jump between sections.
        </li>
        <li>
          <code>[pause]</code>, <code>[smile]</code>: cues are shown but never expected in your speech.
        </li>
        <li>
          <code>*word*</code> marks emphasis. A blank line starts a new paragraph.
        </li>
      </ul>
    </main>
  );
}
