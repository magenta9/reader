import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getReaderWindowBridge, getRendererAudioBridge } from "../shared/voice-reader-bridge.js";
import { ReaderWindowApp } from "./App.js";
import "./styles.css";

const readerBridge = getReaderWindowBridge();
const audioBridge = getRendererAudioBridge();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ReaderWindowApp audioBridge={audioBridge} readerBridge={readerBridge} />
  </StrictMode>
);
