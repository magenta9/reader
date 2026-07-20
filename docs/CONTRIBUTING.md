# 贡献指南

VoiceReader 使用 Linear 管理当前工作。提交代码前先确认改动对应的 PRD、issue 或明确的用户请求。

## 开始开发

```bash
make install
make verify
```

如果只需要快速检查某一类问题，可以单独运行：

```bash
bun run typecheck
bun run test
bun run test:watch
bun run build
bun run test:dist
```

`bun run test` 运行快速 Vitest source-level 和 jsdom React UI 测试；`bun run test:watch` 用于本地迭代；`bun run test:dist` 只检查构建产物、HTML/CSP/资源、native addon 与三个 production preload 的可执行角色合同。完整提交前默认运行 `make verify`，它会从 frozen install 开始执行依赖脚本审计、一次包含 typecheck 的 clean build、Electron runtime probe、Vitest 和 Build Product checks。

本地运行 app：

```bash
bun run build
bun run start
```

本地打包 macOS app：

```bash
make package-mac
make smoke-packaged
open release/mac/VoiceReader.app
```

完整本地部署：

```bash
make deploy
```

`make package-mac` 只生成 ARM64 `.app` 与 DMG，不修改 `/Applications`；它从根 `package.json` 加载并校验一个不可变 Release Identity snapshot，再验证最终 app 的 Info.plist、descriptor、图标、helper identifiers、精确 Build Product、架构与签名 requirement，并校验、只读挂载 DMG 后对其中唯一的 `VoiceReader.app` 重跑相同验证。`make smoke-packaged` 会先按 production Release Identity 复验最终 `.app`，再运行 fresh、历史三表、无版本四表和 future negative 数据库矩阵；正向场景在隐藏窗口模式下完成真实 Reader App Shell 初始化，并创建隐藏 Playback Overlay 以加载最终包内的 HTML 与 preload，随后才报告 readiness、验证 exact v1 schema 与数据保留，future 场景继续验证 fail-closed。`make deploy` 会先执行完整验证和 candidate smoke；如果 `/Applications/VoiceReader.app` 正在运行，它会要求开发者正常退出应用并拒绝继续，不会自动结束进程。替换采用 staging/backup 流程，installed smoke 失败时恢复旧应用；所有 smoke 都使用临时 userData，不接触正常的本机数据。

发布版本只在根 `package.json` 的 `version` 字段提升。不要同步编辑 packager、Info.plist、verifier 或文档中的版本常量；Release Identity 会派生 descriptor/plist 版本和 `release/mac/VoiceReader-<package version>-arm64.dmg`。版本变更后必须重新运行 `make verify`、`make package-mac` 与 `make smoke-packaged`，以最终 artifact seam 证明 metadata 与产物一致。

## 选择任务

当前主线工作在：

- PRD：[Linear: VoiceReader macOS MVP](https://linear.app/devbox-zhang/document/prd-voicereader-macos-mvp-4789a0b07559)
- Issues：[Linear `reader` project](https://linear.app/devbox-zhang/project/reader-41eb054cdf91)
- Canonical PRD：`docs/prd/macos-voicereader-mvp.md`

Issue 使用 Linear 原生状态和依赖关系；标签含义见 `docs/agents/triage-labels.md`。新增或拆分任务时，遵循 `docs/agents/issue-tracker.md` 的 Linear 约定。

## 编码约定

- 使用 TypeScript strict mode，避免引入 `any` 和未建模的跨进程对象。
- 共享类型优先放在 `src/shared/`；应用数据 payload 优先更新 `src/shared/app-contracts.ts`。跨 renderer/main 能力先更新 `src/shared/role-bridge-contracts.ts` 中已有角色的 endpoint，并复用 `src/shared/bridge-contracts/` 的 channel 常量与 `src/shared/app-contracts.ts` 的 payload 类型；不得另写一套 preload/main channel wiring。
- App Shell endpoint、Menu Bar trigger 映射与 Reader feedback 必须委托 `ReaderAppShellController` 的语义接口；不得在 `main.ts` 或 handler dependency bag 重新持有 Reader Window、route、Tray 或 quit 状态。
- Reading Target Acquisition 的触发准备、Selected Text / Clipboard Text fallback、临时剪切板恢复与捕获时序必须通过 `ReadingTargetAcquirer.acquire(trigger)` 表达；不得恢复 bridge `beforeInvoke`、sender-focus 判断、无 trigger 调用或调用者自有 Selection Capture timer。
- Renderer Home 交互与工作流变更必须通过 `src/renderer/home-workspace.ts` 的不可变 snapshot 与 semantic intents 表达；`App.tsx` 不得重新持有 setup 读取、credential readiness、Preferred Voice 写入顺序、recovery/Reading Target 启动 pending 或启动/跳过短反馈协调。Playback Session 与 Feedback Surface 仍由 main process 独占。Workspace interface tests 负责访问代际和命令 lane，Reader Window tests 只补 DOM、StrictMode 与路由重入 tracer。
- Renderer Settings 交互与工作流变更必须通过 `src/renderer/settings-workspace.ts` 的 snapshot 与 semantic intents 表达；main 继续拥有语义命令和持久化权威。`App.tsx` 只负责渲染、DOM keyboard event 转换和 focus adapter，不得重新持有 authoritative Settings、bridge promise coordination、访问草稿、确认或反馈状态。
- Renderer 只能通过 preload bridge 调用受控能力，不直接使用 Node 或 Electron main API。
- 用户可见文案默认使用中文；领域概念使用 `CONTEXT.md` 中定义的术语。
- 涉及产品行为、隐私边界、本地持久化或架构选择时，先从 `docs/adr/CATALOG.md` 确认已有决策的状态与关系，再阅读具体 ADR。
- 不提交 `dist/`、`release/`、`.tmp/`、`node_modules/` 或本机数据文件。

## 提交流程

1. 从最新主线创建短分支，分支名建议使用 `feat/`、`fix/`、`docs/`、`refactor/` 等前缀。
2. 阅读相关 PRD、issue、`CONTEXT.md`，先从 `docs/adr/CATALOG.md` 确认决策状态与关系，再阅读相关 ADR。
3. 实现改动，并尽量让每个 commit 只覆盖一个清晰目的。
4. 运行适合改动范围的验证。一般文档改动至少检查链接和命令是否仍然准确；代码改动默认运行 `make verify`。
5. 更新对应 issue 的状态或评论，说明完成内容和验证结果。
6. 提交代码，commit message 建议使用 Conventional Commits，例如：

```text
docs: update usage and contribution docs
fix: keep favorite replay out of reading history
feat: add language-scoped voice preference
```

## Pull Request 清单

提交 PR 前确认：

- 改动和 issue/PRD 对齐。
- 用户可见行为、文案、隐私边界已经写清楚。
- 新增跨进程能力已更新已有 role-scoped executable contract、main-owned implementation 和调用方；loopback 验证行为，构建后的对应 preload VM probe 验证最小权限，且没有 URL/pathname 角色推断或手写 IPC 镜像。
- Reader Window、Menu Bar、导航、应用生命周期、presence 与 Reader feedback 仍由 Reader App Shell 独占；Reading Target Acquisition 独占 trigger preparation 和完整捕获事务，Playback Command Controller 只保留首 trigger single-flight 与 session 编排；相关 source 行为由 Acquisition、Shell/adapter 与入口 tracer 测试验证，dist contract 不镜像源码结构。
- Home 的准备快照、recovery 与 Reading Target 启动 intent single-flight、Preferred Voice latest-intent lane 及访问失效仍由 Home Workspace 独占；视图没有直接 bridge 异步协调，Workspace 与少量 DOM tracer 覆盖 ADR-0034 的合同。
- Settings 的核心与辅助资源仍按 ADR-0033 分级降级；连续、离散及校验/两阶段命令仍由 Settings Workspace 协调，视图没有直接 bridge 异步工作流或通用 settings patch。
- 本地数据结构变更通过 `AppDataStore.open(path)` 的版本化 lifecycle，有真实历史 SQLite fixture、原子 rollback 与 packaged upgrade smoke。
- 已运行并记录相关验证命令。
- 没有提交构建产物、密钥、SQLite 数据库或临时文件。
