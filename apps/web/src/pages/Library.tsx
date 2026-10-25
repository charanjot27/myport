import { buildReport, estimateDuration, parseScript } from "@promptsense/core";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useSettings } from "../lib/settings";
import { newId, SAMPLE_SCRIPT, scripts, sessions, type StoredScript, type StoredSession } from "../lib/storage";
import { syncScripts } from "../lib/sync";
import { formatDuration } from "../lib/format";

export function LibraryPage() {
  const [items, setItems] = useState<StoredScript[] | null>(null);
  const [recent, setRecent] = useState<StoredSession[]>([]);
  const [syncMsg, setSyncMsg] = useState("");
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const user = useAuth();
  const settings = useSettings();

  const reload = async () => {
    setItems(await scripts.list());
    setRecent((await sessions.list()).slice(0, 8));
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!user) return;
    syncScripts()
      .then((r) => {
        if (r.pulled || r.pushed) setSyncMsg(`Synced: ${r.pulled} downloaded, ${r.pushed} uploaded.`);
        return reload();
      })
      .catch((e: Error) => setSyncMsg(`Sync failed: ${e.message}`));
  }, [user]);

  const create = async (title: string, source: string) => {
    const now = new Date().toISOString();
    const s: StoredScript = { id: newId(), title, source, createdAt: now, updatedAt: now };
    await scripts.put(s);
    navigate(`/edit/${s.id}`);
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    await create(file.name.replace(/\.(txt|md)$/i, ""), text);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this script? Session reports for it are kept.")) return;
    await scripts.remove(id);
    await reload();
  };

  return (
    <main className="page">
      <div className="hero">
        <div className="grow">
          <div className="eyebrow">JOTR</div>
          <h1 style={{ margin: 0 }}>
            Your <span className="gradient-text">scripts</span>
          </h1>
          <p>Speak naturally. Your words stay right under the camera, follow your voice and never glare in your glasses.</p>
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import .txt / .md
        </button>
        <button className="btn primary" onClick={() => void create("Untitled script", "")}>
          ＋ New script
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
          }}
        />
      </div>
      {syncMsg && <div className="alert ok">{syncMsg}</div>}
      {!settings.gazeModel && (
        <div className="alert">
          Tip: <Link to="/calibrate">calibrate your gaze</Link> (30 seconds) to turn on stumble prediction from where your eyes are on the script.
        </div>
      )}

      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <div className="orb" aria-hidden />
          <h3>No scripts yet</h3>
          <p className="muted">Start with a sample to see how voice-following works.</p>
          <button className="btn primary" onClick={() => void create("Sample: Welcome to JOTR", SAMPLE_SCRIPT)}>
            Try the sample script
          </button>
        </div>
      ) : (
        <div className="grid">
          {items.map((s) => {
            const parsed = parseScript(s.source);
            return (
              <div className="card interactive" key={s.id} data-testid="script-card">
                <h3>{s.title || "Untitled"}</h3>
                <p className="script-preview">{parsed.words.slice(0, 40).map((w) => w.display).join(" ") || "Empty script"}</p>
                <div className="meta">
                  <span className="chip">{parsed.words.length} words</span>
                  <span className="chip">~{formatDuration(estimateDuration(parsed))}</span>
                  <span className="chip">{new Date(s.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="row">
                  <Link className="btn primary small" to={`/prompt/${s.id}`}>
                    Start
                  </Link>
                  <Link className="btn small" to={`/edit/${s.id}`}>
                    Edit
                  </Link>
                  <button className="btn small danger" onClick={() => void remove(s.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h2>Recent sessions</h2>
          <table className="list">
            <thead>
              <tr>
                <th>Script</th>
                <th>When</th>
                <th>Length</th>
                <th>Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.scriptTitle}
                    {s.research && <span className="chip" style={{ marginLeft: 8 }}>research</span>}
                  </td>
                  <td>{new Date(s.startedAt).toLocaleString()}</td>
                  <td>{formatDuration(s.durationMs / 1000)}</td>
                  <td>{buildReport(s.record).score}</td>
                  <td>
                    <Link to={`/report/${s.id}`}>Report</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
