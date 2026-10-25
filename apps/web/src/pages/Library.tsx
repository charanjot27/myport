import { buildReport, detectScriptLanguage, estimateDuration, parseScript } from "@promptsense/core";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useSettings } from "../lib/settings";
import { LANGUAGE_SAMPLES, newId, SAMPLE_SCRIPT, scripts, sessions, type StoredScript, type StoredSession } from "../lib/storage";
import { syncScripts } from "../lib/sync";
import { formatDuration } from "../lib/format";
import { MiniScore, PageHeader, relativeTime } from "../components/ui";
import { Icon } from "./landing-icons";

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

  const takes = recent.length;
  const best = recent.reduce((m, r) => Math.max(m, buildReport(r.record).score), 0);

  return (
    <main className="page">
      <PageHeader
        eyebrow="Library"
        title={
          <>
            Your <span className="gradient-text">scripts</span>
          </>
        }
        actions={
          <>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              {Icon.upload} Import .txt / .md
            </button>
            <button className="btn primary" onClick={() => void create("Untitled script", "")}>
              {Icon.plus} New script
            </button>
          </>
        }
      >
        Write once, then just talk. Your words stay right under the camera and follow your voice, in English, हिन्दी or ਪੰਜਾਬੀ.
      </PageHeader>
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

      {items && items.length > 0 && (
        <div className="stat-strip" aria-label="Summary">
          <span>
            <b>{items.length}</b> {items.length === 1 ? "script" : "scripts"}
          </span>
          <span>
            <b>{takes}</b> recent {takes === 1 ? "take" : "takes"}
          </span>
          {takes > 0 && (
            <span>
              best score <b>{best}</b>
            </span>
          )}
        </div>
      )}
      {syncMsg && <div className="alert ok">{syncMsg}</div>}
      {!settings.gazeModel && (
        <div className="banner">
          <span className="banner-icon">{Icon.eye}</span>
          <span>
            <b>Turn on stumble prediction.</b> A 30-second gaze calibration lets JOTR see where your eyes are on the script.
          </span>
          <Link to="/calibrate" className="btn small" viewTransition>
            Calibrate
          </Link>
        </div>
      )}

      {items === null ? (
        <div className="script-grid" aria-busy>
          {[0, 1, 2].map((k) => (
            <div key={k} className="script-card skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="orb" aria-hidden />
          <h3>No scripts yet</h3>
          <p className="muted">Start with a sample to see how voice-following works.</p>
          <button className="btn primary" onClick={() => void create("Sample: Welcome to JOTR", SAMPLE_SCRIPT)}>
            Try the sample script
          </button>
          <div className="sample-langs">
            <span className="muted">Or try it in</span>
            {LANGUAGE_SAMPLES.map((l) => (
              <button key={l.label} className="btn small" onClick={() => void create(l.title, l.source)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="script-grid">
          {items.map((s, k) => {
            const parsed = parseScript(s.source);
            const lang = LANG_TAG[detectScriptLanguage(s.source)];
            return (
              <article className="script-card" key={s.id} data-testid="script-card" style={{ ["--i" as string]: k }}>
                <div className="script-card-top">
                  <span className={`lang-tag ${lang.cls}`}>{lang.label}</span>
                  <span className="muted small">{relativeTime(s.updatedAt)}</span>
                </div>
                <h3>{s.title || "Untitled"}</h3>
                <p className="script-preview" lang={lang.lang}>
                  {parsed.words.slice(0, 48).map((w) => w.display).join(" ") || "Empty script. Click Edit to write it."}
                </p>
                <div className="script-card-foot">
                  <span className="script-stats">
                    {parsed.words.length} words · ~{formatDuration(estimateDuration(parsed))}
                  </span>
                  <div className="script-actions">
                    <Link className="btn ghost small" to={`/edit/${s.id}`}>
                      Edit
                    </Link>
                    <button className="btn ghost small danger" onClick={() => void remove(s.id)}>
                      Delete
                    </button>
                    <Link className="btn primary small play" to={`/prompt/${s.id}`}>
                      {Icon.play} Start
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
          <button className="script-card new" onClick={() => void create("Untitled script", "")} style={{ ["--i" as string]: items.length }}>
            <span className="new-plus">{Icon.plus}</span>
            <b>New script</b>
            <span className="muted small">Write, paste or import a .txt / .md</span>
          </button>
        </div>
      )}

      {recent.length > 0 && (
        <section className="sessions">
          <div className="section-head">
            <h2>Recent sessions</h2>
            <span className="muted small">Your coach report for every take</span>
          </div>
          <ul className="session-list">
            {recent.map((s, k) => (
              <li key={s.id} style={{ ["--i" as string]: k }}>
                <Link to={`/report/${s.id}`} className="session-row" aria-label={`Report for ${s.scriptTitle}`}>
                  <MiniScore score={buildReport(s.record).score} />
                  <span className="session-title">
                    {s.scriptTitle}
                    {s.research && <span className="chip">research</span>}
                  </span>
                  <span className="muted">{relativeTime(s.startedAt)}</span>
                  <span className="session-len">{formatDuration(s.durationMs / 1000)}</span>
                  <span className="session-go">
                    Report {Icon.arrow}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

const LANG_TAG = {
  hi: { label: "हिन्दी", cls: "hi", lang: "hi" },
  pa: { label: "ਪੰਜਾਬੀ", cls: "pa", lang: "pa" },
  latin: { label: "EN", cls: "en", lang: undefined },
  other: { label: "Other", cls: "en", lang: undefined },
} as const;
