# 技术栈

VoiceReader 当前主线是 macOS Electron app。代码以 TypeScript 为中心，UI 使用 React，构建由自定义 Node 脚本和 esbuild 驱动。

## 运行形态

- macOS menu bar app：Electron main process 组合各运行时；Reader App Shell 独占 Tray/Menu、Reader Window、应用激活、close-to-hide、退出清理、Dock presence、导航顺序与 Reader feedback，Playback Renderer 与 Playback Overlay 保持独立生命周期。
- Reader Window：React + TypeScript 渲染主页、History、Favorites、Settings。
- Electron main process：拥有当前 Playback Session 和命名 Feedback Surface 路由；MiniMax 生成结束只封口音频队列，只有当前 session 的 Audio Outcome 才产生用户可见终态。所有完成、失败、停止和替换路径通过同一个 main-owned terminal notification 同步释放 Stop Shortcut。
- Reading Target Acquisition：main-owned `ReadingTargetAcquirer.acquire(trigger)` 独占 Reader Window 隐藏/300ms、Menu Bar 命令时捕获、Activation Shortcut 350ms、Selected Text 优先、Clipboard Text fallback、临时剪切板快照恢复和安全错误记录；Playback Command Controller 只负责首 trigger single-flight 与 Playback Session 编排。
- MiniMax Speech Audio adapter：在 Electron main process 内拥有区域 endpoint fallback、HTTP、JSON/SSE、final aggregate 去重与 hex 解码；只向 Playback 交付经过验证的非空 MP3 bytes，resolve 保证至少产生一个 chunk。
- Playback Renderer：启动时创建并保持隐藏的独立 renderer，负责音频队列、浏览器音频播放和 Playback Overlay amplitude，并以带 Playback Session identity 的显式 Audio Outcome 回报真实播放完成或失败；它不承载可见 UI，也不直接决定用户可见终态。
- Playback 跨进程合同：main 用 `endSessionAudio` 表示不会再追加音频；renderer 只回报 `completed` / `failed` Audio Outcome。Renderer audio command 与 Reader feedback 使用方向明确且互不重名的 IPC channel；合同不暴露 renderer idle，也不允许 renderer 直接完成 Playback Overlay。
- Playback Overlay：独立 renderer 页面，用于当前 Reading Target 的播放反馈。
- Preload bridge：Reader Window、Playback Renderer、Playback Overlay 各自使用构建期固定的最小 preload artifact；role-scoped executable contract 同时生成 renderer bridge 与 main wiring，renderer 不直接使用 Node API，也不通过 URL 推断权限。
- Home Workspace：Reader Window 每次进入 Home 都创建一个 renderer-owned workspace。它原子聚合 Settings 与 MiniMax credential readiness，独占访问代际、语言/Voice 派生、Preferred Voice latest-intent lane、恢复命令、Reading Target 启动/跳过短反馈与 pending 状态；React view 只订阅不可变 snapshot、发送语义 intent，并把 recovery 结果适配为路由导航。Playback Session 活动态与终态仍由 main-owned Feedback Surface 路由处理。
- Settings Workspace：Reader Window 每次进入 Settings 都创建一个 renderer-owned workspace。它独占核心/辅助读取、访问态、校验与确认、反馈以及确定性写入 lane；React view 只订阅不可变 snapshot、发送语义 intent，并负责键盘事件与焦点等 DOM 适配。核心 Settings 读取失败会关闭全部写入，MiniMax credential、Error Log count 与 Reading History count 各自独立降级。
- Settings 写入合同：Reader Window 只获得 Speech Rate、Model、Launch at Login、Shortcut、MiniMax/Voice 与 History Retention 的语义命令；main-owned 状态不能通过通用 settings patch 跨进程改写。
- Launch at Login Commands：main-owned command owner 独占已保存偏好到 macOS Login Item 的启动同步，以及用户命令中“先更新 Login Item、再持久化并返回权威 Settings”的现有顺序。Composition root 与 Reader Window bridge 只创建或委托该 owner；失败继续按依赖原样传播，不隐式补偿。
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

- `src/main/main.ts`：薄 composition root，创建数据、Playback、Reader App Shell 与 IPC adapters 并启动应用，不直接持有 Reader Window 或 Tray 状态。
- `src/main/reader-app-shell-controller.ts`：Reader Window、ordered route、Menu command、生命周期、presence 与 Reader feedback 的产品语义 owner；Menu Play 映射为 `menu_bar` acquisition trigger。
- `src/main/reading-target/reading-target-acquirer.ts`：Reading Target Acquisition owner，通过一个 trigger-aware interface 隐藏触发准备、Selected Text / Clipboard Text 解析与剪切板恢复事务。
- `src/main/electron-reader-app-shell.ts`：Reader App Shell 的生产 Electron adapter，封装 BrowserWindow 配置、Tray/Menu、app events、Dock icon 和 Reader role event transport。
- `src/renderer/main.tsx`：Reader Window 运行时入口，负责真实 bridge lookup 和 root rendering。
- `src/renderer/App.tsx`：可注入 fake bridge 的 Reader Window React UI；Home 与 Settings 只作为对应 workspace 的渲染、语义 intent、导航与 DOM/focus adapter。
- `src/renderer/home-workspace.ts`：路由访问作用域的 Home workflow owner，提供不可变 snapshot、原子准备状态、确定性命令 lane，并隔离 StrictMode replay 和跨访问迟到响应。
- `src/renderer/settings-workspace.ts`：路由访问作用域的 Settings workflow owner，提供不可变 snapshot、分级资源状态与 semantic intents，并隔离 StrictMode replay 和跨访问迟到响应。
- `src/playback-renderer/main.ts`：隐藏 Playback Renderer 入口，挂载音频事件与播放队列。
- `src/playback-renderer/audio-player.ts`：音频队列、Playback Overlay amplitude，以及 completed/failed Audio Outcome 的产生。
- `src/overlay/main.tsx`：Playback Overlay 运行时入口，负责真实 bridge lookup 和 root rendering。
- `src/overlay/App.tsx`：可注入 fake bridge 的 Playback Overlay React UI。
- `src/shared/app-contracts.ts`：跨进程应用数据 payload 类型。
- `src/shared/speech-audio-stream.ts`：Playback-facing、供应商无关的 Speech Audio Stream port。
- `src/shared/bridge-contracts/`：跨 renderer/main 的固定 channel 名称与共享 timing 常量。
- `src/shared/role-bridge-contracts.ts`：三类 runtime 的 executable endpoint registry、参数/结果类型与显式 role allow-list。
- `src/shared/role-bridge-registry.ts`：从同一 declaration 生成 renderer bridge、main handlers/events，并提供 duplicate/missing/role/direction 防护；transport 只交付合同参数，不向业务 implementation 泄漏 Electron sender context。
- `src/main/app-role-bridges.ts`：把 main-owned business implementations 注册到三个 production roles；Electron transport 不拥有业务规则。
- `src/preload/reader-window.ts`、`playback-renderer.ts`、`playback-overlay.ts`：三个构建期固定角色的 preload 入口。
- `src/shared/minimax.ts`：MiniMax Voice API 与 production Speech Audio Stream adapter；第三方 wire format 不越过此边界。
- `src/main/data/app-data-schema.ts`：SQLite App Data v1 精确合同、已知历史分类、原子 migration 与 fail-closed 规则。
- `src/main/data/app-data-store.ts`：通过唯一的 `AppDataStore.open(path)` seam 打开版本化 SQLite，并在 migration commit 后执行 Reading History retention。
- `src/main/data/playback-preferences-commands.ts`：main-owned Speech Rate / Model 命令与窄化持久化能力。
- `src/main/data/launch-at-login-commands.ts`：main-owned Launch at Login 启动同步与语义命令 owner；公开接口使用窄化 Login Item / Settings store 端口，source interface tests 负责调用顺序与失败传播。
- `scripts/build.mjs`：TypeScript no-emit typecheck、native addon、esbuild bundle、静态资源复制。
- `vitest.config.ts`：Vitest source-level 测试和 jsdom React UI 测试配置。
- `scripts/run-dist-contract-tests.mjs`：构建后检查 `dist/` 产物和跨进程边界合同。
- `scripts/electron-runtime.mjs`：在真实 Electron 中验证 `node:sqlite` 和 Selected Text addon。
- `scripts/release-identity.mjs`：从根 `package.json` 校验并派生不可变 macOS Release Identity，独占版本、app/DMG 名称、bundle/helper identifiers、bundle layout 与签名 expectation。
- `scripts/local-release-transaction.mjs`：独占本地 package/deploy/install 的仓库级排他锁、隔离 candidate、publication/application swap 资源身份、所有权清理与 fail-closed 恢复边界。
- `scripts/adr-catalog.mjs`：从 ADR flat frontmatter 校验状态与关系并确定性生成 `docs/adr/CATALOG.md`；frontmatter 是唯一机器权威，catalog 只是提交的派生读取入口。
- `scripts/package-mac.mjs`：在 Local Release Transaction workspace 中用自有 packager 消费一个 Release Identity snapshot，生成 ARM64 `VoiceReader.app` 和 DMG；直接验证 app metadata、resources、Build Product、架构和签名 requirement，并挂载检查 DMG 内的唯一 app；publication 通过 transaction-owned staging/backup 提交或回滚。
- `scripts/verify-mac-app.mjs`：独立消费 Release Identity 与最终 `.app`，不读取 packager 实现或从 artifact 反推 expected identity。
- `scripts/packaged-smoke.mjs`：先按同一 Release Identity 验证最终 artifact，再以隔离 userData 执行 fresh、三表 legacy、无版本 current 和 future negative 矩阵，验证精确 SQLite v1、数据保留、兼容规范化与 addon readiness。
- `scripts/deploy-mac.mjs`：在同一个 Local Release Transaction 中串联验证、workspace 打包、显式 candidate smoke、故障安全 publication、transaction-owned 应用替换和 installed smoke。

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

- `dist/`：唯一可发布 Build Product，只含 main、三个 preload、三个 renderer 的运行 bundle/HTML/CSS/source maps、图标资源与 macOS native addon；不含 TypeScript 内部模块树。
- `release/mac/VoiceReader.app`：本地 ARM64 macOS app 打包产物。
- `release/mac/VoiceReader-<package version>-arm64.dmg`：从根 `package.json` 的 version 派生的本地 ARM64 DMG。
- `.tmp/`：本地临时验证产物。
- `.local-release/`：git-ignored 的本地发布事务状态，包含排他锁、owner metadata 与隔离 candidate workspace；`make clean` 必须保留它，生产代码不得猜测性删除既有锁或其他事务资源。

这些目录不应提交。

## 验证命令

```bash
bun run docs:adr
bun run check:adr
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

`bun run docs:adr` 是唯一显式物化 ADR Catalog 的命令；它从 canonical frontmatter 重写派生文件。`bun run check:adr` 只读校验 metadata schema、状态/关系完整性、编号排序与 Catalog freshness，不会隐式修复文件；`make verify` 在 build/test 前运行同一检查并 fail closed。ADR lifecycle 是工程治理词汇，不进入产品领域 `CONTEXT.md`。

`bun run test` 是快速 Vitest 命令，直接覆盖 source-level 行为测试和 jsdom React UI 测试；Reading Target 捕获以 `ReadingTargetAcquirer.acquire(trigger)` 为最高行为 seam，入口 tracer 只证明 Reader、Menu 与 Shortcut 的 trigger 映射及首 trigger single-flight；Home/Settings workflow 的主要测试 seam 是各自 workspace interface，Reader Window 只保留 DOM、StrictMode 与路由重入 tracer。`bun run test:watch` 用于本地迭代。`bun run test:dist` 默认先构建再检查 Build Product，范围包括精确 runtime manifest、三个 production preload 的可执行 role isolation、Reader Window Settings/route tracer、HTML/CSP、native addon 与资源关系；它不读取源码或 package/verifier 脚本，也不重复 source-level 业务场景。已运行 `bun run build` 后可用 `bun run test:dist -- --no-build` 复用当前 `dist/`。`make verify` 从 frozen install 开始执行依赖脚本审计、一次包含 typecheck 的 clean build、Electron runtime probe、Vitest 和 Build Product checks；当它运行在 Local Release Transaction 内时，clean 只删除普通生成物并保留 `.local-release/` 锁与 candidate。`make package-mac` 先获取仓库级事务锁，从根 `package.json` 构建 fail-closed Release Identity snapshot，在隔离 workspace 生成并验证 `.app`/DMG，再通过 transaction-owned publication swap 提交到 `release/mac`；提升版本只修改根 metadata，DMG 名称随 snapshot 自动派生。`make smoke-packaged` 会先按同一 identity 复验最终 artifact，再使用四个独立临时 userData 运行 fresh/legacy/current/future 数据库矩阵；正向场景完成隐藏 Reader App Shell 初始化，并真实创建隐藏 Playback Overlay 以加载包内 HTML/preload，再验证 exact v1 contract 和 sentinel data，future 场景保持 fail-closed。`make deploy` 从 Release Identity 派生目标并拒绝覆盖运行中的 VoiceReader，以同一事务 candidate 完成 smoke、publication 和安装，并通过 owned staging/backup/rollback 与 installed smoke 保护上一份 release、应用和用户数据。macOS 构建与发布依赖 Xcode Command Line Tools，以及系统自带的 `xcrun`、`clang++`、`sips`、`qlmanage`、`lipo`、`codesign`、`hdiutil` 和 `ditto`。
