# VoiceReader

VoiceReader 是一个 macOS menu bar 文字转语音工具。它优先读取前台 App 中的 Selected Text；如果没有可用选区，再回退到 Clipboard Text。语音由用户自己的 MiniMax 账号生成，Reading History 和 Favorites 保存在本机。

## 功能

- macOS menu bar app：菜单中可播放、打开 Reader Window、进入 History/Favorites/Settings、退出应用。
- Reader Window：主页、Reading History、Favorites、Settings 四个主视图。
- Reading Target：全局触发时优先读取 Selected Text，失败或为空时使用 Clipboard Text。
- Playback Session：通过 MiniMax TTS 流式生成语音；同一时间只保留一个活动播放。
- Playback Overlay：当前 Reading Target 播放时显示忽略鼠标输入的非激活浮层，用波形和只读近似进度确认播放状态。
- Reading History：本机保存全文、来源、语言摘要、时长估算和创建时间，不保存生成音频。
- Favorites：从 Reading History 创建，独立于普通历史保留。
- Voice 选择：按 Reading Segment 做语言检测，并为不同语言选择 Preferred Voice 或 Default Voice。

## 使用

```bash
make install
make package-mac
make smoke-packaged
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
make install
bun run typecheck
bun run test
bun run test:dist
bun run build
bun run start
```

常用脚本：

- `bun run typecheck`：运行 TypeScript 类型检查。
- `bun run docs:adr`：从 ADR frontmatter 显式重建并写入 `docs/adr/CATALOG.md`。
- `bun run check:adr`：只读校验 ADR metadata、关系完整性与 Catalog freshness；不会修改文件。
- `bun run test`：运行快速 Vitest source-level 测试和 jsdom React UI 测试。
- `bun run test:watch`：以 watch 模式运行 Vitest，适合本地迭代。
- `bun run test:dist`：构建后检查精确 `dist/` runtime manifest、三个 production preload、HTML/CSP、资源关系和 native addon；已手动 `bun run build` 后可用 `bun run test:dist -- --no-build` 复用构建产物。
- `bun run build`：类型检查后，把 Electron main、三个 preload 和三个 renderer 的可发布运行产物构建到 `dist/`。
- `bun run start`：从当前 `dist/` 启动 Electron app；首次运行前需要先 `bun run build`。
- `bun run test:electron`：在真实 Electron 41 中加载 Selected Text addon 并读写临时 `node:sqlite` 数据库。
- `make package-mac`：用自有 packager 构建 ARM64 `VoiceReader.app` 与 DMG，验证最终 app 的 metadata、资源、Build Product、架构和签名 requirement，并挂载验证 DMG 内容；不安装应用。
- `make smoke-packaged`：先按 production Release Identity 验证最终 `.app`，再用四个隔离 userData 启动它，验证 fresh、历史三表、无版本四表到精确 SQLite v1 的迁移与数据保留、future-version fail-closed，以及 packaged addon。
- `make deploy`：执行完整门禁，安全替换并验证 `/Applications/VoiceReader.app`；VoiceReader 正在运行时会拒绝部署且不会自动结束进程。
- `make verify`：从 frozen install 开始，完成 ADR Catalog 只读检查、依赖脚本审计、一次包含 typecheck 的 clean build、Electron runtime probe、Vitest 和 Build Product checks。

仓库要求 Bun `1.3.14` 和 Node `>=24 <25`，推荐 Node `24.18.0`。macOS 上构建 Selected Text 原生采集模块和打包 app 需要 Xcode Command Line Tools。

本地发布产物位于 `release/mac/VoiceReader.app` 和 `release/mac/VoiceReader-<package version>-arm64.dmg`；DMG 版本来自根 `package.json`。`make deploy` 的 smoke 始终使用临时数据目录，不读取或修改正常的 Reading History、Favorites、Settings、Error Log 或 MiniMax API Key；替换失败时会恢复或保留旧应用并报告恢复路径。

## 项目文档

- [技术栈](docs/TECH_STACK.md)
- [贡献指南](docs/CONTRIBUTING.md)
- [产品说明](PRODUCT.md)
- [领域词汇](CONTEXT.md)
- [macOS MVP PRD](docs/prd/macos-voicereader-mvp.md)
- [ADR Catalog](docs/adr/CATALOG.md)：先查看决策状态与关系，再阅读具体 ADR。
- [Linear issue tracker 说明](docs/agents/issue-tracker.md)

## 当前计划

- Canonical PRD: `docs/prd/macos-voicereader-mvp.md`
- Linear PRD: [VoiceReader macOS MVP](https://linear.app/devbox-zhang/document/prd-voicereader-macos-mvp-4789a0b07559)
- Issues: [Linear `reader` project](https://linear.app/devbox-zhang/project/reader-41eb054cdf91)

旧 Chrome extension PRD 保留为历史文档，不再作为 active implementation workflow。
