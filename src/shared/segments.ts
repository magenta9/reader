import { detectLanguage } from "./language.js";
import type { ReadingSegment } from "./types.js";

const FIRST_SEGMENT_MAX_LENGTH = 240;
const MIN_SEGMENT_LENGTH = 120;
const MAX_SEGMENT_LENGTH = 900;
const SENTENCE_BOUNDARY = /[。！？!?；;.!?]/;

export function normalizeReadableText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function createReadingSegments(text: string): ReadingSegment[] {
  const normalized = normalizeReadableText(text);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const roughSegments: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    if (!buffer) {
      buffer = paragraph;
    } else if (buffer.length < MIN_SEGMENT_LENGTH) {
      buffer = `${buffer}\n\n${paragraph}`;
    } else {
      roughSegments.push(buffer);
      buffer = paragraph;
    }
  }
  if (buffer) roughSegments.push(buffer);

  return splitRoughSegmentsForPlayback(roughSegments)
    .map((segmentText, index) => ({
      id: `segment-${index + 1}`,
      text: segmentText,
      language: detectLanguage(segmentText)
    }));
}

function splitRoughSegmentsForPlayback(roughSegments: string[]): string[] {
  if (!roughSegments.length) return [];
  const [firstSegment, ...remainingSegments] = roughSegments;
  return [
    ...splitFirstSegmentForFastStart(firstSegment),
    ...remainingSegments.flatMap((segment) => splitLongSegment(segment, MAX_SEGMENT_LENGTH))
  ];
}

function splitFirstSegmentForFastStart(text: string): string[] {
  if (text.length <= FIRST_SEGMENT_MAX_LENGTH) return [text];
  const sentences = splitIntoSentences(text);
  const leading = takeLeadingSentences(sentences, FIRST_SEGMENT_MAX_LENGTH);
  if (leading.text) {
    const rest = joinTextSequence(sentences.slice(leading.count));
    return [leading.text, ...splitLongSegment(rest, MAX_SEGMENT_LENGTH)];
  }
  const startupSegment = text.slice(0, FIRST_SEGMENT_MAX_LENGTH).trimEnd();
  const rest = text.slice(FIRST_SEGMENT_MAX_LENGTH).trimStart();
  return [startupSegment, ...splitLongSegment(rest, MAX_SEGMENT_LENGTH)];
}

function splitLongSegment(text: string, maxLength: number): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const sentences = splitIntoSentences(text);

  const parts: string[] = [];
  let buffer = "";

  for (const sentence of sentences.length ? sentences : [text]) {
    if (!buffer) {
      buffer = sentence;
      continue;
    }

    const candidate = joinTextParts(buffer, sentence);
    if (candidate.length <= maxLength) {
      buffer = candidate;
    } else {
      parts.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer) parts.push(buffer);

  return parts.flatMap((part) => hardSplit(part, maxLength));
}

function takeLeadingSentences(sentences: string[], maxLength: number): { count: number; text: string } {
  let count = 0;
  let text = "";
  for (const sentence of sentences) {
    const next = joinTextParts(text, sentence);
    if (count && next.length > maxLength) break;
    if (sentence.length > maxLength) break;
    count += 1;
    text = next;
  }
  return { count, text };
}

function splitIntoSentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!SENTENCE_BOUNDARY.test(char)) continue;

    let end = index + 1;
    while (end < text.length && /["'”’）)\]}】》]/.test(text[end])) {
      end += 1;
    }

    const sentence = text.slice(start, end).trim();
    if (sentence) parts.push(sentence);
    start = end;
  }

  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

function joinTextParts(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  return needsJoinSpace(left, right) ? `${left} ${right}` : `${left}${right}`;
}

function joinTextSequence(parts: string[]): string {
  let text = "";
  for (const part of parts) {
    text = joinTextParts(text, part);
  }
  return text;
}

function needsJoinSpace(left: string, right: string): boolean {
  const last = left[left.length - 1] ?? "";
  const first = right[0] ?? "";
  if (/\s/.test(last) || /\s/.test(first)) return false;
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(last)) return false;
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(first)) return false;
  return true;
}

function hardSplit(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const parts: string[] = [];
  for (let start = 0; start < text.length; start += maxLength) {
    parts.push(text.slice(start, start + maxLength).trim());
  }
  return parts.filter(Boolean);
}
