import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getPlaybackOverlayBridge } from "../shared/voice-reader-bridge.js";
import { PlaybackOverlayApp } from "./App.js";
import "./styles.css";

const overlayBridge = getPlaybackOverlayBridge();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PlaybackOverlayApp overlayBridge={overlayBridge} />
  </StrictMode>
);
