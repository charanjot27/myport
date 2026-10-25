import { DEFAULT_EFFECTS, type EffectSettings } from "./pipeline";

/**
 * Isolated-world content script: reads settings from chrome.storage and
 * forwards them (plus the extension's asset URL) to the MAIN-world injector.
 */
const MESSAGE = "promptsense:effects";
const assetBase = chrome.runtime.getURL("mediapipe").replace(/\/$/, "");

function send(settings: EffectSettings) {
  window.postMessage({ type: MESSAGE, settings, assetBase }, window.location.origin);
}

chrome.storage.sync.get(DEFAULT_EFFECTS, (s) => send(s as EffectSettings));
chrome.storage.onChanged.addListener(() => {
  chrome.storage.sync.get(DEFAULT_EFFECTS, (s) => send(s as EffectSettings));
});
