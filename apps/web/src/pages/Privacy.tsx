export function PrivacyPage() {
  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <h1>Privacy & data</h1>
      <p>JOTR is built so your camera never needs to leave your device.</p>
      <h2>What stays on your device</h2>
      <ul>
        <li>Camera video. Face, eye and hand tracking run in your browser. Recordings are saved only when you download them.</li>
        <li>Your scripts and session reports, stored in your browser, unless you sign in and choose to sync.</li>
        <li>Your gaze calibration.</li>
      </ul>
      <h2>What can leave your device</h2>
      <ul>
        <li>
          <strong>Microphone audio for speech recognition.</strong> Browser recognition in Chrome is processed by Google. Cloud recognition (Pro) streams audio to
          Deepgram. Choose “Off” in Settings to keep audio local (voice-following is then unavailable).
        </li>
        <li>
          <strong>Synced data</strong> (signed-in users): script text and session summaries (scores and counts, not transcripts).
        </li>
        <li>
          <strong>Liveness checks</strong> (signed-in users): the average skin colour of two small cheek patches over about 6 seconds. No images.
        </li>
        <li>
          <strong>Research sessions</strong>, only if you opt in and mark a session as research: gaze coordinates, head pose, word timings and transcript.
          No images or audio. You can withdraw consent and request deletion at any time.
        </li>
      </ul>
      <h2>What we never do</h2>
      <ul>
        <li>Store or upload video or audio recordings.</li>
        <li>Analyse other people's faces or emotions.</li>
        <li>Sell or share your data for advertising.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can export or delete your account data from the Account page at any time. For questions, contact the operator of this JOTR deployment.
      </p>
    </main>
  );
}
