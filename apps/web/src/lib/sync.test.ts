import { describe, expect, it } from "vitest";
import type { RemoteScript } from "./api";
import type { StoredScript } from "./storage";
import { planSync } from "./sync";

const local = (p: Partial<StoredScript> = {}): StoredScript => ({ id: "a", title: "t", source: "s", createdAt: "2026-01-01", updatedAt: "2026-01-02", remoteVersion: 1, ...p });
const remote = (p: Partial<RemoteScript> = {}): RemoteScript => ({ id: "a", title: "t", source: "s", updatedAt: "2026-01-02", version: 1, deleted: false, ...p });

describe("planSync", () => {
  it("pushes new local scripts and pulls new remote ones", () => {
    expect(planSync(local({ remoteVersion: undefined }), undefined)).toBe("push");
    expect(planSync(undefined, remote())).toBe("pull");
    expect(planSync(undefined, remote({ deleted: true }))).toBe("none");
  });
  it("does nothing when both sides are unchanged", () => {
    expect(planSync(local(), remote())).toBe("none");
  });
  it("pushes local edits and pulls remote edits", () => {
    expect(planSync(local({ updatedAt: "2026-01-03" }), remote())).toBe("push");
    expect(planSync(local(), remote({ version: 2, updatedAt: "2026-01-04" }))).toBe("pull");
  });
  it("resolves conflicts by last writer", () => {
    expect(planSync(local({ updatedAt: "2026-01-05" }), remote({ version: 2, updatedAt: "2026-01-04" }))).toBe("push");
    expect(planSync(local({ updatedAt: "2026-01-03" }), remote({ version: 2, updatedAt: "2026-01-04" }))).toBe("pull");
  });
  it("propagates deletions", () => {
    expect(planSync(local({ deleted: true }), remote())).toBe("delete-remote");
    expect(planSync(local(), remote({ deleted: true }))).toBe("purge-local");
    expect(planSync(local({ deleted: true }), undefined)).toBe("purge-local");
  });
});
