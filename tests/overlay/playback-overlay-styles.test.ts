import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overlayStyles = readFileSync(
  new URL("../../src/overlay/styles.css", import.meta.url),
  "utf8"
);

describe("Playback Overlay styles", () => {
  it("keeps the transparent window exterior free of an outward pill shadow", () => {
    const pillRule = overlayStyles.match(/\.overlay-pill\s*\{(?<body>[^}]*)\}/s)?.groups?.body;
    expect(pillRule).toBeDefined();

    const boxShadow = pillRule?.match(/box-shadow:\s*(?<value>[^;]+);/)?.groups?.value.trim();
    expect(boxShadow === undefined || boxShadow === "none" || /\binset\b/.test(boxShadow)).toBe(true);
  });
});
