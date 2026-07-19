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

`bun run test` 运行快速 Vitest source-level 和 jsdom React UI 测试；`bun run test:watch` 用于本地迭代；`bun run test:dist` 检查构建产物和跨进程边界合同。完整提交前默认运行 `make verify`，它会从 frozen install 开始执行依赖脚本审计、两轮 clean build、typecheck、Vitest 和 dist contract checks。

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

`make package-mac` 只生成并验证 ARM64 `.app` 与 DMG，不修改 `/Applications`。`make smoke-packaged` 会对最终 `.app` 运行 fresh、历史三表、无版本四表和 future negative 数据库矩阵；正向场景在隐藏窗口模式下完成真实 Reader App Shell 初始化后才报告 readiness，并验证 exact v1 schema 与数据保留，future 场景继续验证 fail-closed。`make deploy` 会先执行完整验证和 candidate smoke；如果 `/Applications/VoiceReader.app` 正在运行，它会要求开发者正常退出应用并拒绝继续，不会自动结束进程。替换采用 staging/backup 流程，installed smoke 失败时恢复旧应用；所有 smoke 都使用临时 userData，不接触正常的本机数据。

## 选择任务

当前主线工作在：

- PRD：[Linear: VoiceReader macOS MVP](https://linear.app/devbox-zhang/document/prd-voicereader-macos-mvp-4789a0b07559)
- Issues：[Linear `reader` project](https://linear.app/devbox-zhang/project/reader-41eb054cdf91)
- Canonical PRD：`docs/prd/macos-voicereader-mvp.md`

Issue 使用 Linear 原生状态和依赖关系；标签含义见 `docs/agents/triage-labels.md`。新增或拆分任务时，遵循 `docs/agents/issue-tracker.md` 的 Linear 约定。

## 编码约定

- 使用 TypeScript strict mode，避免引入 `any` 和未建模的跨进程对象。
- 共享类型优先放在 `src/shared/`；应用数据 payload 优先更新 `src/shared/app-contracts.ts`。跨 renderer/main 能力先更新 `src/shared/role-bridge-contracts.ts` 中已有角色的 endpoint，并复用 `src/shared/bridge-contracts/` 的 channel 常量与 `src/shared/app-contracts.ts` 的 payload 类型；不得另写一套 preload/main channel wiring。
- App Shell endpoint、Selection Capture sender 判断与 Reader feedback 必须委托 `ReaderAppShellController` 的语义接口；不得在 `main.ts` 或 handler dependency bag 重新持有 Reader Window、route、Tray 或 quit 状态。
- Renderer 只能通过 preload bridge 调用受控能力，不直接使用 Node 或 Electron main API。
- 用户可见文案默认使用中文；领域概念使用 `CONTEXT.md` 中定义的术语。
- 涉及产品行为、隐私边界、本地持久化或架构选择时，先检查 `docs/adr/` 是否已有决策。
- 不提交 `dist/`、`release/`、`.tmp/`、`node_modules/` 或本机数据文件。

## 提交流程

1. 从最新主线创建短分支，分支名建议使用 `feat/`、`fix/`、`docs/`、`refactor/` 等前缀。
2. 阅读相关 PRD、issue、`CONTEXT.md` 和 ADR。
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
- Reader Window、Menu Bar、导航、应用生命周期、presence、sender identity 与 Reader feedback 仍由 Reader App Shell 独占；相关 source 行为由 Shell/adapter 测试验证，dist contract 不镜像 Shell 源码结构。
- 本地数据结构变更通过 `AppDataStore.open(path)` 的版本化 lifecycle，有真实历史 SQLite fixture、原子 rollback 与 packaged upgrade smoke。
- 已运行并记录相关验证命令。
- 没有提交构建产物、密钥、SQLite 数据库或临时文件。
