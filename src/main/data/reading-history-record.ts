import { randomUUID } from "node:crypto";
import type { HistoryRetention, ReadingHistoryRecord } from "../../shared/app-contracts.js";
import type { DetectedLanguage, ReadingSegment } from "../../shared/types.js";

export interface ReadingHistoryInput {
  text: string;
  segments: ReadingSegment[];
  createdAt?: number;
}

export const READING_HISTORY_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export function createReadingHistoryRecord(input: ReadingHistoryInput): ReadingHistoryRecord {
  const createdAt = input.createdAt ?? Date.now();
  return {
    id: randomUUID(),
    createdAt,
    text: input.text,
    preview: createReadingHistoryPreview(input.text),
    durationEstimateSeconds: estimateReadingDurationSeconds(input.text),
    languageSummary: summarizeReadingSegmentLanguages(input.segments),
    source: "clipboard"
  };
}

export function createReadingHistoryPreview(text: string): string {
  const firstBlock = text.split(/\n+/).find((part) => part.trim()) ?? text;
  const normalized = firstBlock.trim().replace(/\s+/g, " ");
  return normalized.length > 120 ? `${normalized.slice(0, 119)}…` : normalized;
}

export function estimateReadingDurationSeconds(text: string): number {
  const cjkCount = Array.from(text).filter((char) => /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(char)).length;
  const wordCount = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g)?.length ?? 0;
  const cjkSeconds = (cjkCount / 280) * 60;
  const wordSeconds = (wordCount / 170) * 60;
  return Math.max(1, Math.ceil(cjkSeconds + wordSeconds));
}

export function summarizeReadingSegmentLanguages(segments: ReadingSegment[]): string {
  const ordered: DetectedLanguage[] = ["zh", "en", "ja", "ko", "latin", "unknown"];
  const seen = new Set(segments.map((segment) => segment.language));
  const labels = ordered.filter((language) => seen.has(language)).map(readingHistoryLanguageLabel);
  return labels.length ? labels.join(" / ") : "未知";
}

export function readingHistoryRetentionCutoff(now: number, retention: HistoryRetention): number | undefined {
  if (retention === "forever") return undefined;
  if (retention === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (retention === "3m") return now - 90 * 24 * 60 * 60 * 1000;
  return now - 30 * 24 * 60 * 60 * 1000;
}

function readingHistoryLanguageLabel(language: DetectedLanguage): string {
  if (language === "zh") return "中文";
  if (language === "en") return "英文";
  if (language === "ja") return "日文";
  if (language === "ko") return "韩文";
  if (language === "latin") return "其他拉丁语";
  return "未知";
}
