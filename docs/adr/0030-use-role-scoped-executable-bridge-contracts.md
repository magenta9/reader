# Use Role-scoped Executable Bridge Contracts

VoiceReader will declare each cross-process capability once as a role-scoped executable bridge contract. The contract binds the public method name, fixed IPC channel, invoke/event direction, arguments, result, and owning runtime role. Reader Window、Playback Renderer 与 Playback Overlay 组成显式 allow-list；同一原始 channel 只有在方向不同且语义明确时才可复用，例如 renderer→main 的 Overlay Metric command 与 main→Overlay 的 metric event。

Renderer preload 与 Electron main handler/event wiring 都从同一 contract 生成。Production 使用三个构建期固定的 preload entrypoint，每个窗口只加载所属角色 artifact；不得根据 URL、pathname、implementation shape 或任意 channel 字符串推断权限。Electron transports 只适配 IPC 机制，main implementation 继续拥有 Launch at Login、Shortcut、MiniMax、History、Favorites、Playback Session 与 Overlay 等业务行为。需要 sender identity 的调用通过 typed before-invoke context hook 处理，不把 Electron event 暴露给 renderer contract。

新增或修改跨进程能力时，先更新现有 role contract 与共享 payload/interface，再实现 main-owned behavior，并通过 executable loopback 和 production preload VM probe 验证参数、结果、错误、事件顺序、精确 unsubscribe 与角色不可见能力。Source-level Vitest 负责 contract/implementation 行为；dist contract tests 只保留构建后的三角色执行、最小权限、Settings semantic commands 与 Playback lifecycle 等外部证据，不镜像逐文件 source metadata。

该迁移不改变现有 channel、payload、method、UI 或本地数据 schema。回滚应按 contract→event migration→invoke migration→registry expansion 的逆序执行，不需要数据迁移。
