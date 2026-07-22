import { describe, expect, it } from "vitest";

import {
  defineProductionRuntimeRoleBindings,
  defineProductionRuntimeRoleIdentities,
  getProductionRuntimeRoleBinding,
  productionRuntimeRoleBindings,
  resolveProductionRuntimeRoleBinding
} from "../../src/shared/production-runtime-role-bindings.js";

const secureWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false
};

describe("Production Runtime Role Binding", () => {
  it("owns the complete production role matrix behind one interface", () => {
    expect(productionRuntimeRoleBindings).toEqual([
      {
        role: "reader-window",
        preloadSource: "src/preload/reader-window.ts",
        preloadArtifact: "preload/reader-window.cjs",
        documentArtifact: "renderer/index.html",
        globalName: "voiceReader",
        webPreferences: secureWebPreferences
      },
      {
        role: "playback-renderer",
        preloadSource: "src/preload/playback-renderer.ts",
        preloadArtifact: "preload/playback-renderer.cjs",
        documentArtifact: "playback-renderer/index.html",
        globalName: "voiceReader",
        webPreferences: { ...secureWebPreferences, backgroundThrottling: false }
      },
      {
        role: "playback-overlay",
        preloadSource: "src/preload/playback-overlay.ts",
        preloadArtifact: "preload/playback-overlay.cjs",
        documentArtifact: "overlay/index.html",
        globalName: "voiceReader",
        webPreferences: secureWebPreferences
      }
    ]);

    expect(getProductionRuntimeRoleBinding("playback-overlay").preloadArtifact).toBe(
      "preload/playback-overlay.cjs"
    );
    expect(
      resolveProductionRuntimeRoleBinding("reader-window", (artifact) => `/app/${artifact}`)
    ).toMatchObject({
      preloadEntry: "/app/preload/reader-window.cjs",
      documentEntry: "/app/renderer/index.html"
    });
  });

  it("rejects incomplete, unsafe, duplicate, or unknown production identities", () => {
    const valid = productionRuntimeRoleBindings.map((binding) => ({
      ...binding,
      webPreferences: { ...binding.webPreferences }
    }));

    expect(() => defineProductionRuntimeRoleBindings(valid.slice(0, 2))).toThrow(
      "missing role playback-overlay"
    );
    expect(() =>
      defineProductionRuntimeRoleBindings([
        valid[0],
        { ...valid[1], role: "reader-window" },
        valid[2]
      ])
    ).toThrow("duplicate role reader-window");
    expect(() =>
      defineProductionRuntimeRoleBindings([
        { ...valid[0], role: "browser" },
        valid[1],
        valid[2]
      ])
    ).toThrow("unknown role browser");
    expect(() =>
      defineProductionRuntimeRoleBindings([
        { ...valid[0], preloadArtifact: "../reader-window.cjs" },
        valid[1],
        valid[2]
      ])
    ).toThrow("unsafe preloadArtifact");
    expect(() =>
      defineProductionRuntimeRoleBindings([
        valid[0],
        { ...valid[1], preloadArtifact: valid[0].preloadArtifact },
        valid[2]
      ])
    ).toThrow("duplicate preloadArtifact preload/reader-window.cjs");
    expect(() =>
      defineProductionRuntimeRoleBindings([
        {
          ...valid[0],
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
          }
        },
        valid[1],
        valid[2]
      ])
    ).toThrow("unsafe webPreferences");
  });

  it("keeps preload and document artifacts attached to their production roles", () => {
    expect(
      productionRuntimeRoleBindings.map(({ role, preloadArtifact, documentArtifact }) => ({
        role,
        preloadArtifact,
        documentArtifact
      }))
    ).toEqual([
      {
        role: "reader-window",
        preloadArtifact: "preload/reader-window.cjs",
        documentArtifact: "renderer/index.html"
      },
      {
        role: "playback-renderer",
        preloadArtifact: "preload/playback-renderer.cjs",
        documentArtifact: "playback-renderer/index.html"
      },
      {
        role: "playback-overlay",
        preloadArtifact: "preload/playback-overlay.cjs",
        documentArtifact: "overlay/index.html"
      }
    ]);
  });

  it("accepts the source-free runtime identity manifest used by the packaged main process", () => {
    const identities = productionRuntimeRoleBindings.map(({ preloadSource: _preloadSource, ...identity }) => identity);

    expect(defineProductionRuntimeRoleIdentities(identities)).toEqual(identities);
    expect(
      resolveProductionRuntimeRoleBinding(
        "playback-renderer",
        (artifact) => `/product/${artifact}`,
        defineProductionRuntimeRoleIdentities(identities)
      )
    ).toMatchObject({
      preloadEntry: "/product/preload/playback-renderer.cjs",
      documentEntry: "/product/playback-renderer/index.html"
    });
  });
});
