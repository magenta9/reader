export interface ModelOption {
  id: string;
  label: string;
  detail: string;
}

export const DEFAULT_MODEL = "speech-2.8-turbo";

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "speech-2.8-turbo", label: "2.8 Turbo", detail: "low latency default" },
  { id: "speech-2.8-hd", label: "2.8 HD", detail: "higher quality" },
  { id: "speech-2.6-turbo", label: "2.6 Turbo", detail: "stable low latency" },
  { id: "speech-2.6-hd", label: "2.6 HD", detail: "stable higher quality" },
  { id: "speech-02-turbo", label: "02 Turbo", detail: "legacy low latency" },
  { id: "speech-02-hd", label: "02 HD", detail: "legacy high quality" },
  { id: "speech-01-turbo", label: "01 Turbo", detail: "legacy" },
  { id: "speech-01-hd", label: "01 HD", detail: "legacy" }
];

export const SPEECH_RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;
