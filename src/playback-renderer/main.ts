import { getPlaybackRendererBridge } from "../shared/voice-reader-bridge.js";
import { mountPlaybackAudio } from "./audio-player.js";

const disposePlaybackAudio = mountPlaybackAudio(getPlaybackRendererBridge());

window.addEventListener("beforeunload", disposePlaybackAudio, { once: true });
