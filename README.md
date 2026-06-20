# VoiceReader

VoiceReader 是一个 macOS menu bar 文字转语音工具。它优先读取前台 App 中的 Selected Text；如果没有可用选区，再回退到 Clipboard Text。语音由用户自己的 MiniMax 账号生成，Reading History 和 Favorites 保存在本机。

## 功能

- macOS menu bar app：菜单中可播放、打开 Reader Window、进入 History/Favorites/Settings、退出应用。
- Reader Window：主页、Reading History、Favorites、Settings 四个主视图。
- Reading Target：全局触发时优先读取 Selected Text，失败或为空时使用 Clipboard Text。
- Playback Session：通过 MiniMax TTS 流式生成语音；同一时间只保留一个活动播放。
- Playback Overlay：当前 Reading Target 播放时显示非激活浮层，用波形和悬停进度确认播放状态。
- Reading History：本机保存全文、来源、语言摘要、时长估算和创建时间，不保存生成音频。
- Favorites：从 Reading History 创建，独立于普通历史保留。
- Voice 选择：按 Reading Segment 做语言检测，并为不同语言选择 Preferred Voice 或 Default Voice。

## 使用

```bash
pnpm install
pnpm package:mac
open release/mac/VoiceReader.app
```

首次使用时：

1. 打开 `release/mac/VoiceReader.app`。
2. 进入 Settings，填入 MiniMax API Key 并验证连接。
3. 刷新 Voice 列表，按语言选择需要的 Preferred Voice。
4. 确认 Activation Shortcut，默认是 `Control+Command+R`。
5. 在任意 macOS App 中选中文本并触发 Activation Shortcut；没有可读取选区时，VoiceReader 会尝试读取当前 Clipboard Text。

播放过程中按 `Escape` 可停止当前 Playback Session。关闭 Reader Window 只会隐藏窗口，应用仍会留在 menu bar 中。

本机数据默认保存到 `~/Library/Application Support/VoiceReader/voicereader.sqlite`。Reading History 会保存完整 Reading Target 文本；生成音频和 MiniMax 原始响应不会保存。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

常用脚本：

- `pnpm typecheck`：运行 TypeScript 类型检查。
- `pnpm test`：先构建，再运行核心 Node 测试。
- `pnpm build`：把 Electron main、preload、renderer、overlay 和共享模块构建到 `dist/`。
- `pnpm start`：从当前 `dist/` 启动 Electron app；首次运行前需要先 `pnpm build`。
- `pnpm package:mac`：构建并打包本地 macOS app 到 `release/mac/VoiceReader.app`。
- `pnpm verify`：依次运行 typecheck、test、build。

macOS 上构建 Selected Text 原生采集模块和打包 app 需要 Xcode Command Line Tools。

## 项目文档

- [技术栈](docs/TECH_STACK.md)
- [贡献指南](docs/CONTRIBUTING.md)
- [产品说明](PRODUCT.md)
- [领域词汇](CONTEXT.md)
- [macOS MVP PRD](docs/prd/macos-voicereader-mvp.md)
- [ADR](docs/adr/)
- [本地 issue tracker 说明](docs/agents/issue-tracker.md)

## 当前计划

- Canonical PRD: `docs/prd/macos-voicereader-mvp.md`
- Local PRD: `.scratch/voicereader-macos/PRD.md`
- Issues: `.scratch/voicereader-macos/issues/`

旧 Chrome extension PRD 保留为历史文档，不再作为 active implementation workflow。
