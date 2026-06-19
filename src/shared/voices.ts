import { detectLanguage } from "./language.js";
import type { DetectedLanguage, MiniMaxVoice } from "./types.js";

const LANGUAGE_ALIASES: Array<[DetectedLanguage, RegExp]> = [
  ["zh", /chinese|mandarin|cantonese|中文|普通话|粤语/i],
  ["en", /english|american|british|英语/i],
  ["ja", /japanese|日本|日语/i],
  ["ko", /korean|한국|韩语|韓語/i]
];

export const COMMON_MINIMAX_VOICES: MiniMaxVoice[] = [
  {
    voice_id: "male-qn-qingse",
    display_name: "Qingse Male",
    language: "zh"
  },
  {
    voice_id: "English_expressive_narrator",
    display_name: "English Expressive Narrator",
    language: "en"
  }
];

export function normalizeMiniMaxVoices(payload: unknown): MiniMaxVoice[] {
  const roots = collectArrays(payload);
  const seen = new Set<string>();
  const voices: MiniMaxVoice[] = [];

  for (const item of roots.flat()) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const voiceId =
      stringValue(record.voice_id) ??
      stringValue(record.voiceId) ??
      stringValue(record.id) ??
      stringValue(record.voice);
    if (!voiceId || seen.has(voiceId)) continue;

    const displayName =
      stringValue(record.voice_name) ??
      stringValue(record.name) ??
      stringValue(record.display_name) ??
      voiceId;
    const description = Array.isArray(record.description)
      ? record.description.join(" ")
      : stringValue(record.description) ?? "";

    voices.push({
      voice_id: voiceId,
      display_name: displayName,
      language: inferVoiceLanguage(`${voiceId} ${displayName} ${description}`),
      raw: item
    });
    seen.add(voiceId);
  }

  return voices;
}

export function mergeVoiceLists(...lists: MiniMaxVoice[][]): MiniMaxVoice[] {
  const seen = new Set<string>();
  const merged: MiniMaxVoice[] = [];

  for (const voice of lists.flat()) {
    if (!voice.voice_id || seen.has(voice.voice_id)) continue;
    merged.push(voice);
    seen.add(voice.voice_id);
  }
  return merged;
}

export function inferVoiceLanguage(text: string): DetectedLanguage {
  for (const [language, pattern] of LANGUAGE_ALIASES) {
    if (pattern.test(text)) return language;
  }
  return detectLanguage(text);
}

export function voicesForLanguage(
  voices: MiniMaxVoice[],
  language: DetectedLanguage
): MiniMaxVoice[] {
  const direct = voices.filter((voice) => voice.language === language);
  if (direct.length) return direct;
  if (language === "en") return voices.filter((voice) => voice.language === "latin");
  return [];
}

export function selectVoiceId(
  voices: MiniMaxVoice[],
  preferred: Partial<Record<DetectedLanguage, string>>,
  language: DetectedLanguage
): string | undefined {
  const preferredId = preferred[language];
  if (preferredId) return preferredId;

  return voicesForLanguage(voices, language)[0]?.voice_id ?? voices[0]?.voice_id;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function collectArrays(value: unknown): unknown[][] {
  if (Array.isArray(value)) return [value];
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const arrays: unknown[][] = [];
  for (const key of ["voices", "voice_list", "system_voice", "voice_cloning", "voice_generation"]) {
    if (Array.isArray(record[key])) arrays.push(record[key] as unknown[]);
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === "object") arrays.push(...collectArrays(child));
  }
  return arrays;
}
