import { describe, expect, it } from "vitest";

import { detectLanguage } from "../../src/shared/language.js";

describe("detectLanguage", () => {
  it("classifies supported language groups and unknown text", () => {
    expect(detectLanguage("这是一个中文段落，用来测试语音阅读。")).toBe("zh");
    expect(detectLanguage("This is an English paragraph for reading aloud.")).toBe("en");
    expect(detectLanguage("これは日本語の文章です。")).toBe("ja");
    expect(detectLanguage("이 문장은 한국어입니다.")).toBe("ko");
    expect(detectLanguage("ééééé abc")).toBe("latin");
    expect(detectLanguage("12345 !!!")).toBe("unknown");
  });
});
