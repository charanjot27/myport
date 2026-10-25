import { detectStumbles, type SessionRecord, type StumbleKind } from "@promptsense/core";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { formatDuration } from "../lib/format";
import { sessions, type StoredSession } from "../lib/storage";
import { uploadResearchRecord } from "../lib/sync";
import { downloadBlob } from "../recording/recorder";

type Label = NonNullable<SessionRecord["labels"]>[number];

/**
 * Research labelling tool. Stumbles are pre-detected automatically; a person
 * confirms, rejects or adds labels. Confirmed labels are the ground truth for
 * training the stumble predictor (ml/).
 */
export function LabelPage() {
  const [list, setList] = useState<StoredSession[]>([]);
  const [selected, setSelected] = useState<StoredSession | null>(null);
  const [status, setStatus] = useState("");
  const user = useAuth();

  const reload = async () => setList((await sessions.list()).filter((s) => s.research));
  useEffect(() => {
    void reload();
  }, []);

  const candidates = useMemo(() => (selected ? detectStumbles(selected.record) : []), [selected]);
  const labels = selected?.record.labels ?? [];

  const save = async (next: Label[]) => {
    if (!selected) return;
    const updated = { ...selected, record: { ...selected.record, labels: next.sort((a, b) => a.t - b.t) } };
    await sessions.put(updated);
    setSelected(updated);
    await reload();
  };

  const labelAt = (t: number) => labels.find((l) => Math.abs(l.t - t) < 300);
  const setLabel = (t: number, kind: StumbleKind | "none", token?: number) => {
    const rest = labels.filter((l) => Math.abs(l.t - t) >= 300);
    void save([...rest, { t, kind, ...(token !== undefined ? { token } : {}) }]);
  };

  const exportAll = () => {
    const lines = list.map((s) => JSON.stringify(s.record)).join("\n");
    downloadBlob(new Blob([lines], { type: "application/x-ndjson" }), `promptsense-research-${new Date().toISOString().slice(0, 10)}.jsonl`);
  };

  const uploadAll = async () => {
    setStatus("Uploading…");
    try {
      for (const s of list) await uploadResearchRecord(s.record);
      setStatus(`Uploaded ${list.length} sessions.`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <main className="page">
      <h1>Research sessions</h1>
      <p className="muted">
        Sessions recorded with “Save as a research session”. Confirm or reject each detected stumble, add any that were missed, then export the dataset for
        training (<code>ml/</code>) or upload it to the study server.
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn" disabled={!list.length} onClick={exportAll}>
          Export dataset (.jsonl)
        </button>
        {user?.researchConsent && (
          <button className="btn" disabled={!list.length} onClick={() => void uploadAll()}>
            Upload to study server
          </button>
        )}
        <span className="muted">{status}</span>
      </div>
      {!list.length && <p className="muted">No research sessions yet. Enable research in Settings, then tick “Save as a research session” before starting.</p>}
      <table className="list">
        <tbody>
          {list.map((s) => (
            <tr key={s.id} style={{ background: selected?.id === s.id ? "var(--bg-raised)" : undefined }}>
              <td>{s.scriptTitle}</td>
              <td>{new Date(s.startedAt).toLocaleString()}</td>
              <td>{formatDuration(s.durationMs / 1000)}</td>
              <td>{s.record.labels?.length ?? 0} labels</td>
              <td>
                <button className="btn small" onClick={() => setSelected(s)}>
                  Label
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <>
          <h2>Detected stumbles</h2>
          <table className="list">
            <thead>
              <tr>
                <th>Time</th>
                <th>Kind</th>
                <th>Word</th>
                <th>Your label</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const l = labelAt(c.t);
                return (
                  <tr key={`${c.t}${c.kind}`}>
                    <td>{formatDuration(c.t / 1000)}</td>
                    <td>{c.kind}</td>
                    <td>{c.word}</td>
                    <td className="row">
                      <button className={`btn small${l && l.kind !== "none" ? " primary" : ""}`} onClick={() => setLabel(c.t, c.kind, c.token)}>
                        Stumble
                      </button>
                      <button className={`btn small${l?.kind === "none" ? " primary" : ""}`} onClick={() => setLabel(c.t, "none", c.token)}>
                        Not a stumble
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2>Transcript</h2>
          <p className="muted">Click a line to mark a missed stumble at that moment.</p>
          <div className="card" style={{ maxHeight: 360, overflow: "auto" }}>
            {selected.record.transcript
              .filter((x) => x.isFinal)
              .map((x) => (
                <div key={x.t} className="row" style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="muted" style={{ width: 56 }}>
                    {formatDuration(x.t / 1000)}
                  </span>
                  <span className="grow">{x.text}</span>
                  <select
                    aria-label="Label"
                    value={labelAt(x.t)?.kind ?? ""}
                    onChange={(e) => e.target.value && setLabel(x.t, e.target.value as StumbleKind)}
                    style={{ width: "auto" }}
                  >
                    <option value="">—</option>
                    <option value="restart">restart</option>
                    <option value="hesitation">hesitation</option>
                    <option value="filler">filler</option>
                    <option value="misread">misread</option>
                  </select>
                </div>
              ))}
          </div>
        </>
      )}
    </main>
  );
}
