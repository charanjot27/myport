import { useState } from "react";
import { Link } from "react-router-dom";
import { api, apiConfigured } from "../lib/api";
import { login, logout, refreshUser, useAuth } from "../lib/auth";
import { updateSettings } from "../lib/settings";
import { downloadBlob } from "../recording/recorder";

export function AccountPage() {
  const user = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!apiConfigured()) {
    return (
      <main className="page">
        <h1>Account</h1>
        <p>
          Accounts need the PromptSense API. Set its URL in <Link to="/settings">Settings</Link>. Everything else works without an account.
        </p>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password, mode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const billing = async (path: "/billing/checkout" | "/billing/portal") => {
    try {
      const { url } = await api<{ url: string }>(path, { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setConsent = async (consent: boolean) => {
    await api("/research/consent", { method: "POST", json: { consent } });
    updateSettings({ researchConsent: consent });
    await refreshUser();
  };

  if (user) {
    return (
      <main className="page" style={{ maxWidth: 640 }}>
        <h1>Account</h1>
        <p>
          Signed in as <strong>{user.email}</strong> · plan: <strong>{user.plan === "pro" ? "Pro" : "Free"}</strong>
        </p>
        {error && <div className="alert error">{error}</div>}
        <div className="row">
          {user.plan === "pro" ? (
            <button className="btn" onClick={() => void billing("/billing/portal")}>
              Manage subscription
            </button>
          ) : (
            <button className="btn primary" onClick={() => void billing("/billing/checkout")}>
              Upgrade to Pro
            </button>
          )}
          <button className="btn" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
        <h2>Pro includes</h2>
        <ul className="muted">
          <li>Cloud speech recognition (more accurate, names and jargon from your script are boosted)</li>
          <li>Signed “verified live” attestations</li>
          <li>Script sync across devices and session history</li>
        </ul>
        <h2>Research</h2>
        <label className="check">
          <input type="checkbox" checked={user.researchConsent} onChange={(e) => void setConsent(e.target.checked)} />
          <span>
            Allow uploading research sessions I mark explicitly. These contain gaze and timing features, never video or audio. See <Link to="/privacy">privacy</Link>.
          </span>
        </label>
        <h2>Your data</h2>
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              const data = await api<unknown>("/account/export");
              downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "promptsense-account-export.json");
            }}
          >
            Export my data
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm("Permanently delete your account and all synced data? Local scripts on this device are kept.")) return;
              await api("/account", { method: "DELETE" });
              await logout();
            }}
          >
            Delete account
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 420 }}>
      <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
      <form onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === "register" && <span className="hint">At least 10 characters.</span>}
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy}>
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button type="button" className="btn" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Create an account instead" : "I already have an account"}
          </button>
        </div>
      </form>
    </main>
  );
}
