# 技术栈

VoiceReader 当前主线是 macOS Electron app。代码以 TypeScript 为中心，UI 使用 React，构建由自定义 Node 脚本和 esbuild 驱动。

## 运行形态

- macOS menu bar app：Electron main process 负责应用生命周期、Tray/Menu、Reader Window、Playback Overlay、全局快捷键和本地数据。
- Reader Window：React + TypeScript 渲染主页、History、Favorites、Settings。
- Playback Overlay：独立 renderer 页面，用于当前 Reading Target 的播放反馈。
- Preload bridge：通过 context isolation 暴露受控 IPC API；renderer 不直接使用 Node API。
- 原生 macOS Selected Text 采集：`src/native/selection-copy-macos.mm` 构建为 Node native addon，main process 在 macOS 上加载。

## 主要依赖

- Electron `^41.5.1`
- React `^19.2.6`
- React DOM `^19.2.6`
- TypeScript `^5.9.3`
- esbuild `^0.28.1`
- Node.js 22+ runtime APIs，包括 `node:sqlite`

仓库使用 `pnpm-workspace.yaml`，本地开发默认用 `pnpm install` 安装依赖。

## 代码结构

```text
src/
├── main/        Electron main process、数据存储、MiniMax 账号、播放控制
├── preload/     context-isolated bridge
├── renderer/    Reader Window React UI 和音频播放队列
├── overlay/     Playback Overlay React UI
├── shared/      domain contracts、MiniMax、语言、Voice、Reading Segment
└── native/      macOS Selected Text 采集 native addon
```

重要入口：

- `src/main/main.ts`：应用启动、窗口、menu bar、IPC、全局快捷键。
- `src/renderer/main.tsx`：Reader Window UI。
- `src/overlay/main.tsx`：Playback Overlay UI。
- `src/shared/app-contracts.ts`：跨进程类型和 bridge contract。
- `src/main/data/app-data-store.ts`：SQLite 本地数据。
- `scripts/build.mjs`：TypeScript emit、native addon、esbuild bundle、静态资源复制。
- `scripts/run-core-tests.mjs`：构建后执行核心行为测试。
- `scripts/package-mac.mjs`：生成 `release/mac/VoiceReader.app` 并做 ad-hoc codesign。

## 本地数据

Electron 启动时把 `userData` 设置到：

```text
~/Library/Application Support/VoiceReader
```

主要 SQLite 文件：

```text
~/Library/Application Support/VoiceReader/voicereader.sqlite
```

本地会保存 Settings、MiniMax API Key、Voice 缓存、Reading History、Favorites 和 Error Log。Reading History 与 Favorites 会保存完整 Reading Target 文本；不会保存生成音频或 MiniMax 原始响应。

## 构建产物

- `dist/`：开发构建输出。
- `release/mac/VoiceReader.app`：本地 macOS app 打包产物。
- `.tmp/`：本地临时验证产物。

这些目录不应提交。

## 验证命令

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify
pnpm package:mac
```

`pnpm test` 会先运行构建，再加载 `dist/` 中的模块执行核心测试。macOS 上 `pnpm build` 和 `pnpm package:mac` 依赖 Xcode Command Line Tools 中的 `xcrun`、`clang++`、`sips`、`qlmanage` 和 `codesign`。

