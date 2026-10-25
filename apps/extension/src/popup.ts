import { DEFAULT_EFFECTS, type EffectSettings } from "./pipeline";

declare const __JOTR_SITE__: string;

const form = document.querySelector<HTMLFormElement>("#settings")!;

document.querySelector("#open")!.addEventListener("click", () => {
  void chrome.tabs.create({ url: `${__JOTR_SITE__}/app` });
  window.close();
});

chrome.storage.sync.get(DEFAULT_EFFECTS, (raw) => {
  const s = raw as EffectSettings;
  (form.elements.namedItem("enabled") as HTMLInputElement).checked = s.enabled;
  (form.elements.namedItem("shield") as HTMLInputElement).checked = s.shield;
  (form.elements.namedItem("eyeContact") as HTMLInputElement).checked = s.eyeContact;
  (form.elements.namedItem("strength") as HTMLInputElement).value = String(Math.round(s.strength * 100));
});

form.addEventListener("input", () => {
  const settings: EffectSettings = {
    enabled: (form.elements.namedItem("enabled") as HTMLInputElement).checked,
    shield: (form.elements.namedItem("shield") as HTMLInputElement).checked,
    eyeContact: (form.elements.namedItem("eyeContact") as HTMLInputElement).checked,
    strength: Number((form.elements.namedItem("strength") as HTMLInputElement).value) / 100,
  };
  chrome.storage.sync.set(settings);
});
