import { buildReport, type SessionRecord } from "@promptsense/core";
import { api, type RemoteScript } from "./api";
import { currentUser } from "./auth";
import { scripts, type StoredScript } from "./storage";

export type SyncAction = "pull" | "push" | "delete-remote" | "purge-local" | "none";

/**
 * Decide what to do with one script. Last writer wins by `updatedAt`; the
 * server version tells us whether the server copy changed since we last saw it.
 */
export function planSync(local: StoredScript | undefined, remote: RemoteScript | undefined): SyncAction {
  if (!local && !remote) return "none";
  if (!local) return remote!.deleted ? "none" : "pull";
  if (!remote) return local.deleted ? "purge-local" : "push";
  if (remote.deleted) return "purge-local";
  const serverChanged = local.remoteVersion !== remote.version;
  if (local.deleted) return serverChanged && remote.updatedAt > local.updatedAt ? "pull" : "delete-remote";
  if (serverChanged) return remote.updatedAt >= local.updatedAt ? "pull" : "push";
  return local.updatedAt > remote.updatedAt ? "push" : "none";
}

/** Two-way script sync. Local-first: the app works offline and sync is a best-effort mirror. */
export async function syncScripts(): Promise<{ pushed: number; pulled: number }> {
  if (!currentUser()) return { pushed: 0, pulled: 0 };
  const remote = (await api<{ scripts: RemoteScript[] }>("/scripts")).scripts;
  const local = await scripts.all();
  const localById = new Map(local.map((s) => [s.id, s]));
  const remoteById = new Map(remote.map((s) => [s.id, s]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  let pushed = 0;
  let pulled = 0;

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    switch (planSync(l, r)) {
      case "pull":
        await scripts.put({ id, title: r!.title, source: r!.source, createdAt: l?.createdAt ?? r!.updatedAt, updatedAt: r!.updatedAt, remoteVersion: r!.version });
        pulled++;
        break;
      case "push": {
        const res = await api<{ version: number }>(`/scripts/${id}`, {
          method: "PUT",
          json: { title: l!.title, source: l!.source, updatedAt: l!.updatedAt },
        });
        await scripts.put({ ...l!, remoteVersion: res.version });
        pushed++;
        break;
      }
      case "delete-remote":
        await api(`/scripts/${id}`, { method: "DELETE" });
        await scripts.purge(id);
        pushed++;
        break;
      case "purge-local":
        await scripts.purge(id);
        break;
      case "none":
        break;
    }
  }
  return { pushed, pulled };
}

/** Upload the summary of a finished session (metrics only). */
export async function uploadSessionSummary(record: SessionRecord): Promise<void> {
  if (!currentUser()) return;
  const r = buildReport(record);
  await api("/sessions", {
    method: "POST",
    json: {
      id: record.id,
      scriptId: record.scriptId,
      startedAt: record.startedAt,
      durationMs: record.durationMs,
      summary: {
        score: r.score,
        wpm: r.wpm,
        fillers: r.fillers.count,
        stumbles: r.stumbles.length,
        eyeContactPct: r.eyeContactPct,
        coverage: r.coverage,
      },
    },
  });
}

/** Upload a full research record. Only called when the user has consented. */
export async function uploadResearchRecord(record: SessionRecord): Promise<void> {
  const u = currentUser();
  if (!u?.researchConsent) throw new Error("Research consent is required before uploading.");
  await api("/research/sessions", { method: "POST", json: { record } });
}
