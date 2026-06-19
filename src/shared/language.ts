import type { DetectedLanguage } from "./types.js";

const SCRIPT_RANGES: Record<DetectedLanguage, RegExp> = {
  zh: /[\u4e00-\u9fff]/g,
  ja: /[\u3040-\u30ff]/g,
  ko: /[\uac00-\ud7af]/g,
  en: /[A-Za-z]/g,
  latin: /[A-Za-zÀ-ÖØ-öø-ÿ]/g,
  unknown: /$a/
};

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function detectLanguage(text: string): DetectedLanguage {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return "unknown";

  const ja = countMatches(compact, SCRIPT_RANGES.ja);
  const ko = countMatches(compact, SCRIPT_RANGES.ko);
  const zh = countMatches(compact, SCRIPT_RANGES.zh);
  const latin = countMatches(compact, SCRIPT_RANGES.latin);
  const ascii = countMatches(compact, SCRIPT_RANGES.en);
  const total = compact.length;

  if (ja / total >= 0.08) return "ja";
  if (ko / total >= 0.08) return "ko";
  if (zh / total >= 0.18) return "zh";
  if (ascii / Math.max(latin, 1) >= 0.85 && ascii / total >= 0.35) return "en";
  if (latin / total >= 0.35) return "latin";
  return "unknown";
}

export function languageLabel(language: DetectedLanguage): string {
  switch (language) {
    case "zh":
      return "Chinese";
    case "en":
      return "English";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "latin":
      return "Latin";
    default:
      return "Unknown";
  }
}
