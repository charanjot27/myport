import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDevices } from "../lib/media";
import { DEFAULT_SETTINGS, updateSettings, useSettings, type Settings } from "../lib/settings";
import { webSpeechSupported } from "../speech/webSpeech";

export function SettingsPage() {
  const s = useSettings();
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });

  useEffect(() => {
    void listDevices().then(setDevices).catch(() => undefined);
  }, []);

  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => updateSettings({ [k]: v } as Partial<Settings>);

  return (
    <main className="page" style={{ maxWidth: 780 }}>
      <h1>
        <span className="gradient-text">Settings</span>
      </h1>

      <section className="card settings-section">
        <h2 style={{ marginTop: 0 }}>Speech</h2>
      <div className="field">
        <label htmlFor="speech">Speech recognition</label>
        <select id="speech" value={s.speechProvider} onChange={(e) => set("speechProvider")(e.target.value as Settings["speechProvider"])}>
          <option value="webspeech">Browser built-in (free{webSpeechSupported() ? "" : ", not available in this browser"})</option>
          <option value="deepgram">Deepgram cloud (Pro, most accurate, needs the API)</option>
          <option value="none">Off (fixed-speed or manual scrolling only)</option>
        </select>
        <span className="hint">
          Browser recognition in Chrome sends audio to Google. Cloud recognition streams audio to Deepgram through a short-lived token. Video never leaves your device.
        </span>
      </div>
      <div className="field">
        <label htmlFor="lang">Language</label>
        <select id="lang" value={s.language} onChange={(e) => set("language")(e.target.value)}>
          {["en-US", "en-GB", "en-IN", "en-AU", "hi-IN", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja-JP"].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>

      </section>
      <section className="card settings-section">
        <h2 style={{ marginTop: 0 }}>Text under the camera</h2>
      <div className="field">
        <label htmlFor="layout">Layout</label>
        <select id="layout" value={s.layout} onChange={(e) => set("layout")(e.target.value as Settings["layout"])}>
          <option value="camera">A few lines right under my camera (recommended)</option>
          <option value="full">Full-screen text</option>
        </select>
        <span className="hint">Keeping the text next to the lens makes you look at the viewer.</span>
      </div>
      <div className="field">
        <label htmlFor="campos">Camera position: {Math.round(s.cameraPlacement.x * 100)}% across, {s.cameraPlacement.edge} edge</label>
        <input id="campos" type="range" min={5} max={95} value={Math.round(s.cameraPlacement.x * 100)} onChange={(e) => set("cameraPlacement")({ ...s.cameraPlacement, x: Number(e.target.value) / 100 })} />
        <label className="check">
          <input type="checkbox" checked={s.cameraPlacement.edge === "bottom"} onChange={(e) => set("cameraPlacement")({ ...s.cameraPlacement, edge: e.target.checked ? "bottom" : "top" })} />
          <span>My camera is below the screen</span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="lines">Visible lines: {s.focusLines}</label>
        <input id="lines" type="range" min={1} max={8} value={s.focusLines} onChange={(e) => set("focusLines")(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="colw">Column width: {Math.round(s.columnWidth * 100)}% of the screen</label>
        <input id="colw" type="range" min={20} max={90} value={Math.round(s.columnWidth * 100)} onChange={(e) => set("columnWidth")(Number(e.target.value) / 100)} />
        <span className="hint">Narrower keeps your eyes closer to the lens; wider fits more words per line.</span>
      </div>
      <div className="field">
        <label htmlFor="bright">Text brightness: {Math.round(s.textBrightness * 100)}%</label>
        <input id="bright" type="range" min={20} max={100} value={Math.round(s.textBrightness * 100)} onChange={(e) => set("textBrightness")(Number(e.target.value) / 100)} />
        <span className="hint">
          {s.reflectionCheck
            ? `Reflection check on ${new Date(s.reflectionCheck.at).toLocaleDateString()} chose ${Math.round(s.reflectionCheck.level * 100)}%.`
            : "Run the setup tour to measure the brightest level that doesn't reflect in your eyes or glasses."}{" "}
          <Link to="/welcome">Run setup tour</Link>
        </span>
      </div>
      <Toggle
        label="Auto brightness: adapt the text to room light and keep checking that it doesn't reflect in your eyes or glasses (a brief, subtle dimming pulse about every 30 s)"
        value={s.autoBrightness}
        onChange={set("autoBrightness")}
      />
      <div className="field">
        <label htmlFor="tone">Text colour</label>
        <select id="tone" value={s.textTone} onChange={(e) => set("textTone")(e.target.value as Settings["textTone"])}>
          <option value="warm">Warm (less glare, recommended)</option>
          <option value="neutral">Neutral white</option>
        </select>
      </div>

      </section>
      <section className="card settings-section">
        <h2 style={{ marginTop: 0 }}>Prompter</h2>
      <div className="field">
        <label htmlFor="font">Text size: {s.fontSize}px</label>
        <input id="font" type="range" min={18} max={120} value={s.fontSize} onChange={(e) => set("fontSize")(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="width">Line width: {s.lineWidth} characters</label>
        <input id="width" type="range" min={16} max={70} value={s.lineWidth} onChange={(e) => set("lineWidth")(Number(e.target.value))} />
        <span className="hint">Shorter lines keep your eyes near the camera.</span>
      </div>
      <div className="field">
        <label htmlFor="line">Reading line: {Math.round(s.readingLine * 100)}% from the top</label>
        <input id="line" type="range" min={5} max={60} value={Math.round(s.readingLine * 100)} onChange={(e) => set("readingLine")(Number(e.target.value) / 100)} />
      </div>
      <div className="field">
        <label htmlFor="speed">Fixed scroll speed: {s.fixedSpeed}px/s</label>
        <input id="speed" type="range" min={10} max={160} value={s.fixedSpeed} onChange={(e) => set("fixedSpeed")(Number(e.target.value))} />
      </div>
      <Toggle label="Mirror text (for beam-splitter teleprompter glass)" value={s.mirror} onChange={set("mirror")} />
      <Toggle label="Pause when I look away" value={s.pauseOnLookAway} onChange={set("pauseOnLookAway")} />
      <Toggle label="Stumble assist: slow down and highlight hard words before I reach them" value={s.stumbleAssist} onChange={set("stumbleAssist")} />
      <Toggle label="Hand gestures: open palm = pause, ✌ = next section, ☝ = rewind sentence, 👍 = resume, 👎 = previous section" value={s.gestureControl} onChange={set("gestureControl")} />
      <Toggle label="Show camera preview (full-screen layout only; a bright preview reflects in glasses)" value={s.showCamera} onChange={set("showCamera")} />

      </section>
      <section className="card settings-section">
        <h2 style={{ marginTop: 0 }}>Recording</h2>
      <Toggle label="Corneal reflection shield: blur the reflection of the prompter in your eyes" value={s.cornealShield} onChange={set("cornealShield")} />
      <Toggle
        label="Eye-contact correction while reading (needs gaze calibration; glances and pauses stay natural)"
        value={s.eyeContact}
        onChange={set("eyeContact")}
        disabled={!s.gazeModel}
      />
      <p className="muted">
        Gaze calibration: {s.gazeModel ? "done" : "not done"} · <Link to="/calibrate">{s.gazeModel ? "recalibrate" : "calibrate now"}</Link>
        {s.gazeModel && (
          <>
            {" · "}
            <button className="btn small" onClick={() => updateSettings({ gazeModel: null })}>
              Clear
            </button>
          </>
        )}
      </p>

      </section>
      <section className="card settings-section">
        <h2 style={{ marginTop: 0 }}>Devices</h2>
      <div className="field">
        <label htmlFor="cam">Camera</label>
        <select id="cam" value={s.cameraId} onChange={(e) => set("cameraId")(e.target.value)}>
          <option value="">Default</option>
          {devices.cameras.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="mic">Microphone</label>
        <select id="mic" value={s.micId} onChange={(e) => set("micId")(e.target.value)}>
          <option value="">Default</option>
          {devices.mics.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
        <span className="hint">Device names appear after you grant camera/microphone permission once.</span>
      </div>

      </section>
      <section className="card settings-section">
        <h2 style={{ marginTop: 0 }}>Appearance</h2>
      <div className="field">
        <label htmlFor="theme">Theme</label>
        <select id="theme" value={s.theme} onChange={(e) => set("theme")(e.target.value as Settings["theme"])}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      </section>
      <section className="card settings-section">
        <h2 style={{ marginTop: 0 }}>Account & data</h2>
      <div className="field">
        <label htmlFor="api">PromptSense API URL</label>
        <input id="api" type="url" placeholder="https://api.example.com or /api" value={s.apiUrl} onChange={(e) => set("apiUrl")(e.target.value.trim())} />
        <span className="hint">Optional. Enables sign-in, script sync, cloud speech and signed liveness checks.</span>
      </div>
      <Toggle label="I want to contribute anonymised research sessions (see the privacy page)" value={s.researchConsent} onChange={set("researchConsent")} />
      <p className="muted">
        <Link to="/privacy">Privacy & data</Link>
      </p>
      <button className="btn" onClick={() => confirm("Reset all settings?") && updateSettings({ ...DEFAULT_SETTINGS })}>
        Reset settings
      </button>
      </section>
    </main>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check" style={{ marginBottom: 10, opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
