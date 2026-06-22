import { describe, expect, it } from "vitest";

import { createReadingSegments, normalizeReadableText } from "../../src/shared/segments.js";

describe("Reading Segment creation", () => {
  it("normalizes readable text spacing without changing paragraph boundaries", () => {
    expect(normalizeReadableText("First paragraph.  \n\n\nSecond paragraph with more text.")).toBe(
      "First paragraph.\n\nSecond paragraph with more text."
    );
  });

  it("splits long English text for fast startup and playback limits", () => {
    const segments = createReadingSegments(
      Array.from({ length: 80 }, (_, index) => `Sentence ${index}.`).join(" ")
    );

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.language === "en")).toBe(true);
    expect(segments.every((segment) => segment.text.length <= 900)).toBe(true);
    expect(segments[0]?.text.length).toBeLessThanOrEqual(240);
  });

  it("splits Chinese text on natural sentence boundaries", () => {
    const chineseSentence = "这是一句用于验证中文分段边界的长句子，它需要在自然标点处切分，而不是在句子的中间被硬切断。";
    const segments = createReadingSegments(Array.from({ length: 30 }, () => chineseSentence).join(""));

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.text.length <= 900)).toBe(true);
    expect(segments[0]?.text.length).toBeLessThanOrEqual(240);
    expect(segments.every((segment) => segment.text.endsWith("。"))).toBe(true);
    expect(segments.every((segment) => segment.language === "zh")).toBe(true);
  });

  it("hard-splits unpunctuated text while preserving content", () => {
    const chineseSegments = createReadingSegments("长".repeat(1900));
    expect(chineseSegments.length).toBeGreaterThan(1);
    expect(chineseSegments.every((segment) => segment.text.length <= 900)).toBe(true);
    expect(chineseSegments[0]?.text.length).toBeLessThanOrEqual(240);

    const englishText = "a".repeat(1900);
    const englishSegments = createReadingSegments(englishText);
    expect(englishSegments.length).toBeGreaterThan(1);
    expect(englishSegments.map((segment) => segment.text).join("")).toBe(englishText);
  });
});
