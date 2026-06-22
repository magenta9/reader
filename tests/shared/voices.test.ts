import { describe, expect, it } from "vitest";

import {
  COMMON_MINIMAX_VOICES,
  mergeVoiceLists,
  normalizeMiniMaxVoices,
  selectVoiceId,
  voicesForLanguage
} from "../../src/shared/voices.js";

describe("MiniMax Voice helpers", () => {
  it("normalizes MiniMax voices and infers language groups", () => {
    const voices = normalizeMiniMaxVoices({
      system_voice: [
        { voice_id: "Chinese_Male_1", description: ["Chinese (Mandarin)"] },
        { voice_id: "English_Female_1", description: ["English"] }
      ]
    });

    expect(voices.map((voice) => [voice.voice_id, voice.language])).toEqual([
      ["Chinese_Male_1", "zh"],
      ["English_Female_1", "en"]
    ]);
  });

  it("selects Preferred Voice, custom Voice ID, and Default Voice", () => {
    const voices = normalizeMiniMaxVoices({
      system_voice: [
        { voice_id: "Chinese_Male_1", description: ["Chinese (Mandarin)"] },
        { voice_id: "English_Female_1", description: ["English"] }
      ]
    });

    expect(selectVoiceId(voices, { zh: "Chinese_Male_1" }, "zh")).toBe("Chinese_Male_1");
    expect(selectVoiceId(voices, { zh: "custom-voice-id" }, "zh")).toBe("custom-voice-id");
    expect(selectVoiceId(voices, {}, "en")).toBe("English_Female_1");
    expect(voicesForLanguage(voices, "zh")[0]?.voice_id).toBe("Chinese_Male_1");
  });

  it("merges Voice lists without duplicating common voices", () => {
    const merged = mergeVoiceLists(COMMON_MINIMAX_VOICES, COMMON_MINIMAX_VOICES);

    expect(merged.filter((voice) => voice.voice_id === COMMON_MINIMAX_VOICES[0]?.voice_id)).toHaveLength(1);
  });
});
