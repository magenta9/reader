# 贡献指南

VoiceReader 使用本地 Markdown issue tracker 管理当前工作。提交代码前先确认改动对应的 PRD、issue 或明确的用户请求。

## 开始开发

```bash
pnpm install
pnpm verify
```

如果只需要快速检查某一类问题，可以单独运行：

```bash
pnpm typecheck
pnpm test
pnpm test:watch
pnpm build
pnpm test:dist
```

`pnpm test` 运行快速 Vitest source-level 和 jsdom React UI 测试；`pnpm test:watch` 用于本地迭代；`pnpm test:dist` 检查构建产物和跨进程边界合同。完整提交前默认运行 `pnpm verify`，它会依次执行 typecheck、Vitest、build 和 dist contract checks。

本地运行 app：

```bash
pnpm build
pnpm start
```

本地打包 macOS app：

```bash
pnpm package:mac
open release/mac/VoiceReader.app
```

## 选择任务

当前主线工作在：

- PRD：`.scratch/voicereader-macos/PRD.md`
- Issues：`.scratch/voicereader-macos/issues/`
- Canonical PRD：`docs/prd/macos-voicereader-mvp.md`

Issue 文件使用 `Status:` 记录状态；标签含义见 `docs/agents/triage-labels.md`。新增或拆分任务时，遵循 `docs/agents/issue-tracker.md` 的本地 Markdown 约定。

## 编码约定

- 使用 TypeScript strict mode，避免引入 `any` 和未建模的跨进程对象。
- 共享类型优先放在 `src/shared/`，跨 renderer/main 的 contract 优先更新 `src/shared/app-contracts.ts`。
- Renderer 只能通过 preload bridge 调用受控能力，不直接使用 Node 或 Electron main API。
- 用户可见文案默认使用中文；领域概念使用 `CONTEXT.md` 中定义的术语。
- 涉及产品行为、隐私边界、本地持久化或架构选择时，先检查 `docs/adr/` 是否已有决策。
- 不提交 `dist/`、`release/`、`.tmp/`、`node_modules/` 或本机数据文件。

## 提交流程

1. 从最新主线创建短分支，分支名建议使用 `feat/`、`fix/`、`docs/`、`refactor/` 等前缀。
2. 阅读相关 PRD、issue、`CONTEXT.md` 和 ADR。
3. 实现改动，并尽量让每个 commit 只覆盖一个清晰目的。
4. 运行适合改动范围的验证。一般文档改动至少检查链接和命令是否仍然准确；代码改动默认运行 `pnpm verify`。
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
- 新增跨进程能力已更新 shared contract、preload bridge 和调用方。
- 本地数据结构变更有兼容旧数据的处理。
- 已运行并记录相关验证命令。
- 没有提交构建产物、密钥、SQLite 数据库或临时文件。
