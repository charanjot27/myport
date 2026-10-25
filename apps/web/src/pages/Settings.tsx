import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeader, Row, Slider, Switch } from "../components/ui";
import { LANGUAGES } from "../lib/languages";
import { listDevices } from "../lib/media";
import { DEFAULT_SETTINGS, updateSettings, useSettings, type Settings } from "../lib/settings";
import { webSpeechSupported } from "../speech/webSpeech";
import { ProIcon, type Hue, type ProIconName } from "./landing-icons";

const SECTIONS: Array<{ id: string; title: string; icon: ProIconName; hue: Hue }> = [
  { id: "speech", title: "Speech & language", icon: "voice", hue: "rose" },
  { id: "camera-text", title: "Text under the camera", icon: "glasses", hue: "sun" },
  { id: "prompter", title: "Prompter", icon: "pip", hue: "sky" },
  { id: "recording", title: "Recording", icon: "eye", hue: "mint" },
  { id: "devices", title: "Devices", icon: "camera", hue: "violet" },
  { id: "appearance", title: "Appearance", icon: "sparkles", hue: "violet" },
  { id: "account", title: "Account & data", icon: "lock", hue: "mint" },
];

export function SettingsPage() {
  const s = useSettings();
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });
  const [active, setActive] = useState(SECTIONS[0]!.id);

  useEffect(() => {
    void listDevices().then(setDevices).catch(() => undefined);
  }, []);

  // Highlight the section being read in the side menu.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    SECTIONS.forEach((x) => {
      const el = document.getElementById(x.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => updateSettings({ [k]: v } as Partial<Settings>);
  const pct = (v: number) => `${Math.round(v)}%`;

  return (
    <main className="page settings-page">
      <PageHeader eyebrow="Preferences" title="Settings">
        Everything is saved on this device as you change it.
      </PageHeader>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((x) => (
            <a key={x.id} href={`#${x.id}`} className={active === x.id ? "on" : ""} onClick={() => setActive(x.id)}>
              <ProIcon name={x.icon} hue={x.hue} size={20} />
              {x.title}
            </a>
          ))}
        </nav>

        <div className="settings-body">
          <Section id="speech">
            <Row label="Speech recognition" htmlFor="speech-provider" hint="Browser recognition in Chrome sends audio to Google. Cloud recognition streams audio to Deepgram. Video never leaves your device.">
              <select id="speech-provider" value={s.speechProvider} onChange={(e) => set("speechProvider")(e.target.value as Settings["speechProvider"])}>
                <option value="webspeech">Browser built-in (free{webSpeechSupported() ? "" : ", unavailable here"})</option>
                <option value="deepgram">Deepgram cloud (Pro)</option>
                <option value="none">Off (fixed speed or manual)</option>
              </select>
            </Row>
            <Row
              label="Language"
              htmlFor="lang"
              hint={
                <>
                  Write in English, हिन्दी, ਪੰਜਾਬੀ or Hinglish and mix them freely: “meeting” in your script follows “मीटिंग” or “ਮੀਟਿੰਗ” in your speech.
                  {s.speechProvider === "deepgram" && s.language === "pa-IN" ? " Deepgram has no Punjabi model, so Punjabi uses the browser recogniser." : ""}
                </>
              }
            >
              <select id="lang" value={s.language} onChange={(e) => set("language")(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
                {!LANGUAGES.some((l) => l.code === s.language) && <option value={s.language}>{s.language}</option>}
              </select>
            </Row>
          </Section>

          <Section id="camera-text">
            <Row label="Layout" htmlFor="layout" hint="Keeping the text next to the lens makes you look at the viewer.">
              <select id="layout" value={s.layout} onChange={(e) => set("layout")(e.target.value as Settings["layout"])}>
                <option value="camera">A few lines under my camera</option>
                <option value="full">Full-screen text</option>
              </select>
            </Row>
            <Slider label="Camera position" value={Math.round(s.cameraPlacement.x * 100)} min={5} max={95} format={(v) => `${v}% across`} onChange={(v) => set("cameraPlacement")({ ...s.cameraPlacement, x: v / 100 })} />
            <Switch label="My camera is below the screen" checked={s.cameraPlacement.edge === "bottom"} onChange={(v) => set("cameraPlacement")({ ...s.cameraPlacement, edge: v ? "bottom" : "top" })} />
            <Slider label="Visible lines" value={s.focusLines} min={1} max={8} onChange={set("focusLines")} />
            <Slider
              label="Column width"
              hint="Narrower keeps your eyes closer to the lens; wider fits more words per line."
              value={Math.round(s.columnWidth * 100)}
              min={20}
              max={90}
              format={(v) => `${v}% of screen`}
              onChange={(v) => set("columnWidth")(v / 100)}
            />
            <Slider
              label="Text brightness"
              hint={
                <>
                  {s.reflectionCheck
                    ? `Reflection check on ${new Date(s.reflectionCheck.at).toLocaleDateString()} chose ${Math.round(s.reflectionCheck.level * 100)}%.`
                    : "The setup tour measures the brightest level that doesn't reflect in your eyes or glasses."}{" "}
                  <Link to="/welcome">Run setup tour</Link>
                </>
              }
              value={Math.round(s.textBrightness * 100)}
              min={20}
              max={100}
              format={pct}
              onChange={(v) => set("textBrightness")(v / 100)}
            />
            <Switch
              label="Auto brightness"
              hint="Adapts the text to room light and keeps checking it doesn't reflect in your eyes or glasses (a brief, subtle dim about every 30 s)."
              checked={s.autoBrightness}
              onChange={set("autoBrightness")}
            />
            <Row label="Text colour" htmlFor="tone">
              <select id="tone" value={s.textTone} onChange={(e) => set("textTone")(e.target.value as Settings["textTone"])}>
                <option value="warm">Warm (less glare)</option>
                <option value="neutral">Neutral white</option>
              </select>
            </Row>
          </Section>

          <Section id="prompter">
            <Slider label="Text size" value={s.fontSize} min={18} max={120} format={(v) => `${v}px`} onChange={set("fontSize")} />
            <Slider label="Line width" hint="Shorter lines keep your eyes near the camera." value={s.lineWidth} min={16} max={70} format={(v) => `${v} characters`} onChange={set("lineWidth")} />
            <Slider label="Reading line" value={Math.round(s.readingLine * 100)} min={5} max={60} format={(v) => `${v}% from top`} onChange={(v) => set("readingLine")(v / 100)} />
            <Slider label="Fixed scroll speed" value={s.fixedSpeed} min={10} max={160} format={(v) => `${v} px/s`} onChange={set("fixedSpeed")} />
            <Switch label="Mirror text" hint="For beam-splitter teleprompter glass." checked={s.mirror} onChange={set("mirror")} />
            <Switch label="Mirror video" hint="Show your camera like a mirror on screen. The saved video is never flipped." checked={s.mirrorVideo} onChange={set("mirrorVideo")} />
            <Switch label="Pause when I look away" checked={s.pauseOnLookAway} onChange={set("pauseOnLookAway")} />
            <Switch label="Stumble assist" hint="Slows down and highlights hard words before you reach them." checked={s.stumbleAssist} onChange={set("stumbleAssist")} />
            <Switch label="Hand gestures" hint="Open palm = pause, ✌ = next section, ☝ = rewind sentence, 👍 = resume, 👎 = previous section." checked={s.gestureControl} onChange={set("gestureControl")} />
            <Switch label="Show camera preview" hint="Full-screen layout only; a bright preview reflects in glasses." checked={s.showCamera} onChange={set("showCamera")} />
          </Section>

          <Section id="recording">
            <Switch
              label="Camera behind the text"
              hint="While recording in the tab, see yourself full-screen behind the script, dimmed so it doesn't reflect in glasses."
              checked={s.cameraBehindText}
              onChange={set("cameraBehindText")}
            />
            <Switch label="Corneal reflection shield" hint="Blurs the reflection of the prompter in your eyes." checked={s.cornealShield} onChange={set("cornealShield")} />
            <Switch label="Eye-contact correction while reading" hint="Needs gaze calibration. Glances and pauses stay natural." checked={s.eyeContact} onChange={set("eyeContact")} disabled={!s.gazeModel} />
            <Row label="Gaze calibration" hint={s.gazeModel ? "Done. It keeps improving while you read." : "Not done yet. Takes about 8 seconds."}>
              <div className="row">
                <Link className="btn small" to="/calibrate">
                  {s.gazeModel ? "Recalibrate" : "Calibrate now"}
                </Link>
                {s.gazeModel && (
                  <button className="btn small ghost" onClick={() => updateSettings({ gazeModel: null })}>
                    Clear
                  </button>
                )}
              </div>
            </Row>
          </Section>

          <Section id="devices">
            <Row label="Camera" htmlFor="cam">
              <select id="cam" value={s.cameraId} onChange={(e) => set("cameraId")(e.target.value)}>
                <option value="">Default</option>
                {devices.cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Microphone" htmlFor="mic" hint="Device names appear after you allow camera and microphone once.">
              <select id="mic" value={s.micId} onChange={(e) => set("micId")(e.target.value)}>
                <option value="">Default</option>
                {devices.mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </Row>
          </Section>

          <Section id="appearance">
            <Row label="Theme">
              <div className="segmented" role="radiogroup" aria-label="Theme">
                {(["dark", "light"] as const).map((t) => (
                  <button key={t} role="radio" aria-checked={s.theme === t} className={s.theme === t ? "on" : ""} onClick={() => set("theme")(t)}>
                    {t === "dark" ? "Dark" : "Light"}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          <Section id="account">
            <Row label="JOTR API URL" htmlFor="api" hint="Optional. Enables sign-in, script sync, cloud speech and signed liveness checks.">
              <input id="api" type="url" placeholder="https://api.example.com or /api" value={s.apiUrl} onChange={(e) => set("apiUrl")(e.target.value.trim())} />
            </Row>
            <Switch
              label="Contribute anonymised research sessions"
              hint={
                <>
                  Helps train the stumble predictor. <Link to="/privacy">Privacy & data</Link>
                </>
              }
              checked={s.researchConsent}
              onChange={set("researchConsent")}
            />
            <Row label="Reset" hint="Back to the defaults. Your scripts and reports are kept.">
              <button className="btn small danger" onClick={() => confirm("Reset all settings?") && updateSettings({ ...DEFAULT_SETTINGS })}>
                Reset settings
              </button>
            </Row>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  const meta = SECTIONS.find((x) => x.id === id)!;
  return (
    <section id={id} className="settings-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <ProIcon name={meta.icon} hue={meta.hue} size={26} />
        {meta.title}
      </h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}
