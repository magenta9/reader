# VoiceReader

一个自己用的 macOS menu bar 文字转语音工具。VoiceReader 的当前主线是 Electron + React + TypeScript app：用户显式触发播放时读取当前剪切板纯文本，通过 MiniMax TTS 生成语音，并在本机保存可回看的 Reading History。

## 功能

- macOS Electron app shell
- Menu Bar Menu：播放、打开 VoiceReader、历史记录、设置、退出
- 单主窗口：主页、历史记录、设置
- 关闭窗口只隐藏应用，Dock 或菜单栏可恢复同一个窗口
- 当前剪切板文本是后续播放主入口
- Reading Segment 级别语言检测和 Voice 选择
- MiniMax TTS、Playback Overlay、Reading History 等能力按 `.scratch/voicereader-macos/issues/` 顺序实现

## 开发

```bash
pnpm install
npm run typecheck
npm run test
npm run build
npm run package:mac
npm run start
```

构建产物在 `dist/`。本地 macOS app 打包产物在 `release/mac/VoiceReader.app`。当前本地 issue tracker 在 `.scratch/voicereader-macos/`。

## 当前计划

- Canonical PRD: `docs/prd/macos-voicereader-mvp.md`
- Local PRD: `.scratch/voicereader-macos/PRD.md`
- Issues: `.scratch/voicereader-macos/issues/`

旧 Chrome extension PRD 保留为历史文档，不再作为 active implementation workflow。
