import { buildReport, parseScript, type CoachReport } from "@promptsense/core";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatedNumber, ScoreRing } from "../components/Animated";
import { formatDuration, pct } from "../lib/format";
import { recordings } from "../lib/recordings";
import { sessions, type StoredSession } from "../lib/storage";
import { downloadBlob, extensionFor } from "../recording/recorder";

export function ReportPage() {
  const { id = "" } = useParams();
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    void sessions.get(id).then((s) => setSession(s ?? null));
  }, [id]);

  const report = useMemo(() => (session ? buildReport(session.record) : null), [session]);
  const script = useMemo(() => (session ? parseScript(session.record.scriptSource) : null), [session]);

  if (session === undefined) return <main className="page muted">Loading…</main>;
  if (!session || !report || !script)
    return (
      <main className="page">
        <h1>Session not found</h1>
        <Link to="/app">Back</Link>
      </main>
    );

  const blob = recordings.get(session.id);
  const stumbleTokens = new Set(report.stumbles.map((s) => s.token));
  const spokenTokens = new Set(session.record.tokenTimings.map((t) => t.token));
  const durationMs = session.record.durationMs || 1;

  const exportJson = () => {
    downloadBlob(new Blob([JSON.stringify(session.record)], { type: "application/json" }), `promptsense-session-${session.id}.json`);
  };

  return (
    <main className="page" data-testid="report">
      <div className="row">
        <div className="grow">
          <div className="muted" style={{ fontSize: "0.8rem", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 650 }}>Coach report</div>
          <h1 style={{ marginBottom: 4 }}>{session.scriptTitle}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {new Date(session.startedAt).toLocaleString()} · {formatDuration(report.durationSec)}
          </p>
        </div>
        <ScoreRing score={report.score} />
      </div>

      <div className="row" style={{ margin: "8px 0 20px" }}>
        <Link className="btn primary" to={`/prompt/${session.scriptId}`}>
          Try again
        </Link>
        {blob && (
          <button className="btn" onClick={() => downloadBlob(blob, `promptsense-${session.id}.${extensionFor(blob.type)}`)}>
            Download video
          </button>
        )}
        <button className="btn" onClick={exportJson}>
          Export data (JSON)
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm("Delete this session?")) void sessions.remove(session.id).then(() => history.back());
          }}
        >
          Delete
        </button>
      </div>

      <div className="tiles">
        <Tile label="Pace" value={report.wpm ? `${report.wpm}` : "—"} sub="words / min" />
        <Tile label="Fillers" value={`${report.fillers.count}`} sub={`${report.fillers.perMinute}/min`} />
        <Tile label="Stumbles" value={`${report.stumbles.length}`} sub={`${report.pauses.length} long pauses`} />
        <Tile label="Eye contact" value={pct(report.eyeContactPct)} sub={`${report.lookAways} look-aways`} />
        <Tile label="Posture" value={report.posture ? `${report.posture.score}` : "—"} sub={report.posture ? `tilt ${report.posture.tiltDeg.toFixed(1)}°` : "no camera"} />
        <Tile label="Stillness" value={report.fidget ? `${report.fidget.score}` : "—"} sub="fidgeting score" />
        <Tile label="Coverage" value={pct(report.coverage * 100)} sub={`${report.wordsSpoken} words`} />
        <Tile label="Off script" value={pct(report.offScriptPct)} sub="of updates" />
      </div>

      <h2>Tips</h2>
      <ul>
        {report.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <h2>Timeline</h2>
      <StumbleTimeline report={report} durationMs={durationMs} risk={session.record.stumbleRisk} />
      <PredictionSummary report={report} />

      <h2>Pace over time</h2>
      <PaceChart points={report.wpmTimeline} />

      <h2>Script review</h2>
      <p className="muted">Red marks where a stumble was detected; grey words were not heard.</p>
      <div className="card script-review">
        {script.words.map((w) => {
          const tokens = Array.from({ length: w.tokenEnd - w.tokenStart }, (_, i) => w.tokenStart + i);
          const stumbled = tokens.some((t) => stumbleTokens.has(t));
          const spoken = tokens.some((t) => spokenTokens.has(t));
          return (
            <span key={w.index} className={stumbled ? "stumble" : spoken ? "" : "unspoken"}>
              {w.display}{" "}
            </span>
          );
        })}
      </div>
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  // Numbers count up; text values ("—") are shown as they are.
  const m = /^(\d+(?:\.\d+)?)(%?)$/.exec(value);
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{m ? <AnimatedNumber value={Number(m[1])} format={(n) => `${Math.round(n)}${m[2]}`} /> : value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function StumbleTimeline({ report, durationMs, risk }: { report: CoachReport; durationMs: number; risk: Array<{ t: number; warning: boolean }> }) {
  // Warning zones from the live predictor, so you can see whether it fired before each stumble.
  const zones: Array<[number, number]> = [];
  let start: number | null = null;
  for (const r of risk) {
    if (r.warning && start === null) start = r.t;
    if (!r.warning && start !== null) {
      zones.push([start, r.t]);
      start = null;
    }
  }
  if (start !== null) zones.push([start, durationMs]);
  return (
    <div>
      <div className="timeline-bar" role="img" aria-label={`${report.stumbles.length} stumbles over ${formatDuration(durationMs / 1000)}`}>
        {zones.map(([a, b]) => (
          <div key={a} className="warnzone" style={{ left: `${(a / durationMs) * 100}%`, width: `${((b - a) / durationMs) * 100}%` }} />
        ))}
        {report.stumbles.map((s) => (
          <div key={`${s.t}${s.kind}`} className={`mark ${s.kind}`} style={{ left: `${(s.t / durationMs) * 100}%` }} title={`${formatDuration(s.t / 1000)} · ${s.kind} · “${s.word}”`} />
        ))}
      </div>
      <div className="row muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>
        <span>
          <span className="chip bad"><span className="dot" />restart</span>
        </span>
        <span className="chip warn">
          <span className="dot" />
          hesitation
        </span>
        <span className="chip">
          <span className="dot" style={{ background: "#a371f7" }} />
          filler
        </span>
        <span className="chip">
          <span className="dot" style={{ background: "rgba(210,153,34,.5)" }} />
          predicted risk
        </span>
      </div>
    </div>
  );
}

function PredictionSummary({ report }: { report: CoachReport }) {
  const p = report.prediction;
  if (!p.warnings && !report.stumbles.length) return null;
  return (
    <p className="muted">
      Stumble prediction: {p.warnings} warnings, {p.hits} followed by a stumble
      {p.recall !== null ? ` · caught ${Math.round(p.recall * 100)}% of stumbles in advance` : ""}
      {p.meanLeadSec !== null ? ` · average lead ${p.meanLeadSec.toFixed(1)} s` : ""}.
    </p>
  );
}

function PaceChart({ points }: { points: Array<{ t: number; wpm: number }> }) {
  if (points.length < 2) return <p className="muted">Not enough data.</p>;
  const w = 600;
  const h = 160;
  const max = Math.max(200, ...points.map((p) => p.wpm));
  const x = (i: number) => 30 + (i / (points.length - 1)) * (w - 40);
  const y = (v: number) => h - 20 - (v / max) * (h - 30);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.wpm).toFixed(1)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Words per minute over time">
      <rect x={30} y={y(160)} width={w - 40} height={y(140) - y(160)} fill="rgba(63,185,80,0.12)" />
      {[0, 100, 200].map((v) => (
        <g key={v}>
          <line x1={30} x2={w - 10} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={0} y={y(v) + 4} fontSize="11" fill="var(--text-muted)">
            {v}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      {points.map((p, i) => (
        <circle key={p.t} cx={x(i)} cy={y(p.wpm)} r={3} fill="var(--accent)">
          <title>{`${formatDuration(p.t / 1000)}: ${p.wpm} wpm`}</title>
        </circle>
      ))}
    </svg>
  );
}
