import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getReaderWindowBridge } from "../shared/voice-reader-bridge.js";
import { ReaderWindowApp } from "./App.js";
import "./styles.css";

const readerBridge = getReaderWindowBridge();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ReaderWindowApp readerBridge={readerBridge} />
  </StrictMode>
);
