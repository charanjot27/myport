// Exposes the WebGL effects to the test page.
import { VideoProcessor } from "@promptsense/core/browser";
(window as unknown as { VideoProcessor: typeof VideoProcessor }).VideoProcessor = VideoProcessor;
