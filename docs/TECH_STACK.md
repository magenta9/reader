# 技术栈

VoiceReader 当前主线是 macOS Electron app。代码以 TypeScript 为中心，UI 使用 React，构建由自定义 Node 脚本和 esbuild 驱动。

## 运行形态

- macOS menu bar app：Electron main process 负责应用生命周期、Tray/Menu、Reader Window、Playback Renderer、Playback Overlay、全局快捷键和本地数据。
- Reader Window：React + TypeScript 渲染主页、History、Favorites、Settings。
- Electron main process：拥有当前 Playback Session 和命名 Feedback Surface 路由；MiniMax 生成结束只封口音频队列，只有当前 session 的 Audio Outcome 才产生用户可见终态。所有完成、失败、停止和替换路径通过同一个 main-owned terminal notification 同步释放 Stop Shortcut。
- MiniMax Speech Audio adapter：在 Electron main process 内拥有区域 endpoint fallback、HTTP、JSON/SSE、final aggregate 去重与 hex 解码；只向 Playback 交付经过验证的非空 MP3 bytes，resolve 保证至少产生一个 chunk。
- Playback Renderer：启动时创建并保持隐藏的独立 renderer，负责音频队列、浏览器音频播放和 Playback Overlay amplitude，并以带 Playback Session identity 的显式 Audio Outcome 回报真实播放完成或失败；它不承载可见 UI，也不直接决定用户可见终态。
- Playback 跨进程合同：main 用 `endSessionAudio` 表示不会再追加音频；renderer 只回报 `completed` / `failed` Audio Outcome。Renderer audio command 与 Reader feedback 使用方向明确且互不重名的 IPC channel；合同不暴露 renderer idle，也不允许 renderer 直接完成 Playback Overlay。
- Playback Overlay：独立 renderer 页面，用于当前 Reading Target 的播放反馈。
- Preload bridge：Reader Window、Playback Renderer、Playback Overlay 各自使用构建期固定的最小 preload artifact；role-scoped executable contract 同时生成 renderer bridge 与 main wiring，renderer 不直接使用 Node API，也不通过 URL 推断权限。
- Settings 写入合同：Reader Window 只获得 Speech Rate、Model、Launch at Login、Shortcut、MiniMax/Voice 与 History Retention 的语义命令；main-owned 状态不能通过通用 settings patch 跨进程改写。
- 原生 macOS Selected Text 采集：`src/native/selection-copy-macos.mm` 构建为 Node native addon，main process 在 macOS 上加载。

## 主要依赖

- Electron `41.10.1`
- React `^19.2.6`
- React DOM `^19.2.6`
- TypeScript `^5.9.3`
- esbuild `^0.28.1`
- Node.js 24 runtime APIs，包括 `node:sqlite`

仓库是单 package 项目，使用 Bun `1.3.14`、文本 `bun.lock` 和 Isolated linker；宿主 Node 支持范围是 `>=24 <25`，推荐 `24.18.0`。

## 代码结构

```text
src/
├── main/        Electron main process、数据存储、MiniMax 账号、播放控制
├── preload/     context-isolated bridge
├── renderer/    Reader Window React UI
├── playback-renderer/ 隐藏的音频播放 runtime 和队列
├── overlay/     Playback Overlay React UI
├── shared/      domain contracts、MiniMax、语言、Voice、Reading Segment
└── native/      macOS Selected Text 采集 native addon
```

重要入口：

- `src/main/main.ts`：应用启动、窗口、menu bar、IPC、全局快捷键。
- `src/renderer/main.tsx`：Reader Window 运行时入口，负责真实 bridge lookup 和 root rendering。
- `src/renderer/App.tsx`：可注入 fake bridge 的 Reader Window React UI。
- `src/playback-renderer/main.ts`：隐藏 Playback Renderer 入口，挂载音频事件与播放队列。
- `src/playback-renderer/audio-player.ts`：音频队列、Playback Overlay amplitude，以及 completed/failed Audio Outcome 的产生。
- `src/overlay/main.tsx`：Playback Overlay 运行时入口，负责真实 bridge lookup 和 root rendering。
- `src/overlay/App.tsx`：可注入 fake bridge 的 Playback Overlay React UI。
- `src/shared/app-contracts.ts`：跨进程应用数据 payload 类型。
- `src/shared/speech-audio-stream.ts`：Playback-facing、供应商无关的 Speech Audio Stream port。
- `src/shared/bridge-contracts/`：跨 renderer/main 的固定 channel 名称与共享 timing 常量。
- `src/shared/role-bridge-contracts.ts`：三类 runtime 的 executable endpoint registry、参数/结果类型与显式 role allow-list。
- `src/shared/role-bridge-registry.ts`：从同一 declaration 生成 renderer bridge、main handlers/events，并提供 duplicate/missing/role/direction 防护。
- `src/main/app-role-bridges.ts`：把 main-owned business implementations 注册到三个 production roles；Electron transport 不拥有业务规则。
- `src/preload/reader-window.ts`、`playback-renderer.ts`、`playback-overlay.ts`：三个构建期固定角色的 preload 入口。
- `src/shared/minimax.ts`：MiniMax Voice API 与 production Speech Audio Stream adapter；第三方 wire format 不越过此边界。
- `src/main/data/app-data-schema.ts`：SQLite App Data v1 精确合同、已知历史分类、原子 migration 与 fail-closed 规则。
- `src/main/data/app-data-store.ts`：通过唯一的 `AppDataStore.open(path)` seam 打开版本化 SQLite，并在 migration commit 后执行 Reading History retention。
- `src/main/data/playback-preferences-commands.ts`：main-owned Speech Rate / Model 命令与窄化持久化能力。
- `scripts/build.mjs`：TypeScript emit、native addon、esbuild bundle、静态资源复制。
- `vitest.config.ts`：Vitest source-level 测试和 jsdom React UI 测试配置。
- `scripts/run-dist-contract-tests.mjs`：构建后检查 `dist/` 产物和跨进程边界合同。
- `scripts/electron-runtime.mjs`：在真实 Electron 中验证 `node:sqlite` 和 Selected Text addon。
- `scripts/package-mac.mjs`：用自有 packager 生成并验证 ARM64 `VoiceReader.app` 和 DMG。
- `scripts/packaged-smoke.mjs`：以隔离 userData 对最终 packaged app 执行 fresh、三表 legacy、无版本 current 和 future negative 矩阵，验证精确 SQLite v1、数据保留、兼容规范化与 addon readiness。
- `scripts/deploy-mac.mjs`：串联验证、打包、candidate smoke、安全替换和 installed smoke。

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

App Data schema 当前版本为 v1，物理结构与引入版本管理前的四表 schema 相同。应用只接受空库、仓库历史中的三表 schema、无版本四表 schema 或精确 v1；未知或未来版本会在数据清理前拒绝启动，不会自动重建、备份或修复数据库。

## 构建产物

- `dist/`：开发构建输出。
- `release/mac/VoiceReader.app`：本地 ARM64 macOS app 打包产物。
- `release/mac/VoiceReader-0.1.0-arm64.dmg`：本地 ARM64 DMG。
- `.tmp/`：本地临时验证产物。

这些目录不应提交。

## 验证命令

```bash
bun run typecheck
bun run test
bun run test:watch
bun run build
bun run test:dist
bun run test:electron
make verify
make package-mac
make smoke-packaged
make deploy
```

`bun run test` 是快速 Vitest 命令，直接覆盖 source-level 行为测试和 jsdom React UI 测试；`bun run test:watch` 用于本地迭代。`bun run test:dist` 默认先构建再检查 build-output 合同，范围包括三个 production preload 的可执行 role isolation、Settings semantic commands、Playback lifecycle、HTML/CSS、native addon、资源复制与 package-script assumptions；它不镜像逐 handler/adapter 的源码结构。已运行 `bun run build` 后可用 `bun run test:dist -- --no-build` 复用当前 `dist/`。`make verify` 从 frozen install 开始执行依赖脚本审计、两轮 clean build、Electron runtime probe、typecheck、Vitest 和 dist contract checks。`make package-mac` 是 artifact-only；`make smoke-packaged` 使用四个独立临时 userData 运行 fresh/legacy/current/future 数据库矩阵，并在清理前验证 exact v1 contract、sentinel data 与 future fail-closed；`make deploy` 拒绝覆盖运行中的 VoiceReader，并通过 staging/backup/rollback 和 installed smoke 保护应用与用户数据。macOS 构建与发布依赖 Xcode Command Line Tools，以及系统自带的 `xcrun`、`clang++`、`sips`、`qlmanage`、`lipo`、`codesign`、`hdiutil` 和 `ditto`。
