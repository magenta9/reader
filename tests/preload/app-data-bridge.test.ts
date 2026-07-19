import { describe, expect, it, vi } from "vitest";

import { createAppDataBridge } from "../../src/preload/bridge-adapters/app-data.js";
import { APP_DATA_CHANNELS } from "../../src/shared/bridge-contracts.js";

describe("createAppDataBridge", () => {
  it("serializes Speech Rate and Model semantic commands", async () => {
    const settings = { speechRate: 1.6, model: "speech-2.8-hd" };
    const invoke = vi.fn(async () => settings);
    const bridge = createAppDataBridge({
      invoke,
      on: vi.fn(),
      off: vi.fn()
    });

    await expect(bridge.setSpeechRate(1.6)).resolves.toBe(settings);
    expect(invoke).toHaveBeenNthCalledWith(1, APP_DATA_CHANNELS.setSpeechRate, 1.6);

    await expect(bridge.setModel("speech-2.8-hd")).resolves.toBe(settings);
    expect(invoke).toHaveBeenNthCalledWith(2, APP_DATA_CHANNELS.setModel, "speech-2.8-hd");
  });
});
