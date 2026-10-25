import type { SpeechProviderId } from "../lib/settings";
import { DeepgramProvider } from "./deepgram";
import { FakeSpeechProvider } from "./fakeProvider";
import type { SpeechProvider, SpeechProviderOptions } from "./types";
import { WebSpeechProvider } from "./webSpeech";

export * from "./types";

export function createSpeechProvider(id: SpeechProviderId, options: SpeechProviderOptions): SpeechProvider | null {
  if (window.__promptsenseFakeSpeech) return new FakeSpeechProvider();
  switch (id) {
    case "webspeech":
      return new WebSpeechProvider(options);
    case "deepgram":
      return new DeepgramProvider(options);
    default:
      return null;
  }
}
