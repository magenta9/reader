# PRD: VoiceReader macOS MVP

Intended triage label: `ready-for-agent`

## Problem Statement

VoiceReader 是一个 macOS menu bar 文字转语音工具。用户希望在任意应用中选中文本或复制文本后，通过全局快捷键或菜单栏入口快速朗读当前 Reading Target，并能在本机按时间回看曾经朗读过的全文历史和单独保存的收藏。

Chrome 扩展不再是后续主线。VoiceReader 的 MVP 聚焦 macOS Selected Text / Clipboard Text reading、全局快捷键、系统级播放浮层、本地历史、收藏和本地设置。

## Product Direction

VoiceReader 使用 Electron + React + TypeScript 重构为 macOS app。应用驻留 menu bar，同时显示 Dock 图标；首次启动显示主窗口，后续启动默认隐藏到 menu bar。关闭主窗口只隐藏窗口，不退出应用；退出只能通过菜单栏菜单。

用户界面使用中文，产品名显示为 `VoiceReader`。主窗口参考 Typeless 的结构和操作方式，但不复制品牌元素：左侧导航、内容面板、历史记录/收藏分栏和简洁设置页。界面跟随 macOS 系统外观。

## Core Concepts

- **Selected Text**: 用户显式触发 Play 时，前台 macOS app 中当前选中的非空纯文本。
- **Clipboard Text**: 用户显式触发 Play 且没有可用 Selected Text 时，当前剪切板里的非空纯文本。
- **Reading Target**: 本次要朗读的文本；macOS MVP 中来源来自 Selected Text 或 Clipboard Text。
- **Reading Target Acquisition**: 一次 Play intent 对前台 app 的准备、Selected Text / Clipboard Text 解析与临时剪切板恢复事务；重叠触发时由第一个已接受 trigger 占有。
- **Reading History**: 本机保存的过去 Reading Targets，按时间倒序查看，不保存音频。
- **Favorite Record**: 从 Reading History Record 创建、并与 Reading History 独立维护的收藏记录。
- **Favorites**: 本机保存的 Favorite Records 集合，按收藏时间倒序查看。
- **Playback Session**: 一次从 Reading Target 到语音播放的尝试；同一时间只有一个，新的播放替换旧的。支持开始和停止，不支持暂停/继续。
- **Playback Overlay**: 当前 Reading Target 播放时出现的系统级浮层。History Replay 不使用系统级浮层。
- **History Replay**: 从历史详情发起的重播，播放整条历史全文，不新增历史记录。
- **Favorite Replay**: 从收藏详情发起的重播，播放整条收藏全文，不新增历史记录。

## User Stories

1. 作为 macOS 用户，我想选中文本后按全局快捷键播放；如果没有选中文本，则播放剪切板文本，这样不用打开浏览器扩展或手动粘贴到别的工具。
2. 作为 macOS 用户，我想通过菜单栏菜单点击播放当前 Reading Target，这样忘记快捷键时也能使用。
3. 作为 macOS 用户，我想播放中按 Esc 停止，这样可以在任意应用中快速取消。
4. 作为 macOS 用户，我想播放中看到一个不抢焦点的系统级波形浮层，这样知道 VoiceReader 正在工作。
5. 作为 macOS 用户，我想查看历史记录，这样可以回看过去朗读过的文本。
6. 作为 macOS 用户，我想控制历史保留期限，这样剪切板全文不会无限保存。
7. 作为 macOS 用户，我想重新播放历史记录，但不希望它重复写入历史。
8. 作为 macOS 用户，我想把历史记录添加到收藏，这样重要文本不会被普通历史清理影响。
9. 作为 macOS 用户，我想查看、重播、复制和删除收藏，这样可以单独维护长期保存的文本。
10. 作为 macOS 用户，我想使用自己的 MiniMax API key，这样 VoiceReader 使用我自己的订阅。
11. 作为 macOS 用户，我想选择 Voice、Speech Rate 和 Model，这样可以调整朗读体验。
12. 作为 macOS 用户，我想 VoiceReader 登录后自动启动可选，这样常用时可以随时按快捷键使用。

## Navigation and Window Behavior

主窗口左侧导航为：

- `主页`
- `历史记录`
- `收藏`
- `设置`

主窗口默认打开 `主页`；从菜单栏的 `历史记录`、`收藏` 或 `设置` 入口打开时直接跳到对应页。默认窗口尺寸为 `1100x760`，最小尺寸为 `900x620`。

VoiceReader 不允许多主窗口。重复打开只恢复并聚焦同一个窗口。Dock 图标点击或 app 激活时恢复主窗口，显示上次所在页或主页。

## Menu Bar Menu

菜单栏图标使用单色 template icon，不显示播放状态。菜单项为：

- `播放`
- `打开 VoiceReader`
- `历史记录`
- `收藏`
- `设置`
- `退出`

点击 `播放` 后菜单立即关闭。无文本、非文本、API key 未配置、API key 未验证或无可用 Voice 时静默跳过，不显示浮层。

Menu Bar Play 在命令发生时立即捕获当前前台 app，不隐藏 VoiceReader，也不在捕获前等待。Reader Window 内的 Play 会先隐藏 VoiceReader、等待 300ms 再捕获，并让先前 app 保持前台；Activation Shortcut 会等待 350ms，让用户完成按键释放后再捕获。

## Home

主页只保留：

- `播放` 主按钮
- Voice 选择
- 配置状态

主页不显示当前 Selected Text 或 Clipboard Text 全文，不显示历史列表，不显示播放进度。Home 可以在 Play 附近显示短句状态，用于说明开始读取、启动结果或配置阻塞；当前 Reading Target 播放过程的主要视觉反馈仍是系统级 Playback Overlay。

`播放` 始终可见。配置未完成时按钮 disabled，并在配置状态区域说明原因。Home 应在 Play 附近提供与当前阻塞原因一致的轻量恢复动作，例如去设置 API Key、验证连接或刷新 Voice。快捷键和菜单栏 Play 在配置未完成时静默跳过。

Voice 选择放在 Play 附近。默认展示中文 Voice，并支持语言组切换：

- `中文`
- `英文`
- `日文`
- `韩文`
- `其他拉丁语`
- `未知`

Voice 选择沿用现有逻辑：每个 Reading Segment 检测语言，优先使用该语言的 Preferred Voice，没有时使用 Default Voice。用户在 Home 选择某语言 Voice 时，保存为该语言的 Preferred Voice。

## Playback Controls

默认 Activation Shortcut 为 `Control+Command+R`，设置页允许用户修改。`Cmd+Shift+R` 是旧默认值，现有用户配置会迁移到新默认值以避免常见应用快捷键冲突。

Stop Shortcut 固定为 Esc，不提供配置。Esc 只在 Playback Session 活跃时全局生效。

播放中触发新的 Play 或 Activation Shortcut 时，立即停止当前 Playback Session，并用最新 Reading Target 开始新的 Playback Session。

同一时间只允许一个 Reading Target Acquisition。捕获事务尚未完成时，来自 Reader Window、Menu Bar 或 Activation Shortcut 的重叠触发复用第一个已接受 trigger 的结果，只创建一个 Playback Session；当前 Playback Session 已开始后的新 Play 仍按上一段的替换规则处理。

播放中只允许取消，不支持暂停或继续。取消后若要再播放，需要重新从头开始。Esc 是用户主动停止，不写 Error Log，也不改变 Reading History Record。Playback Overlay 不提供停止按钮。

取消或新播放替换时必须尽快 abort 当前 MiniMax streaming，并清空待播放音频。

MiniMax streaming 成功必须至少产生一个经过验证的非空 MP3 byte chunk。成功 JSON/SSE 中缺少音频、空音频、奇数长度或非十六进制 audio payload 均视为安全的 MiniMax runtime failure，不得把 Playback Session 呈现为成功，也不得展示 Reading Target、API key 或原始响应。

## Playback Overlay

当前 Reading Target 播放时，Play 找到有效 Selected Text 或 Clipboard Text 后立即显示系统级 Playback Overlay。准备阶段显示较弱波形，首个真实音频指标到达后切换为 active 波形和只读估算进度。完成、失败或主动停止时分别短暂显示绿勾、红叉或停止方块，再淡出。

Playback Overlay 是单独的 Electron BrowserWindow：

- 会话开始时固定在鼠标所在显示器底部中央；会话内不再跟随鼠标跨屏移动
- 不抢焦点
- 不拦截鼠标，前台 App 保持可操作
- 不显示任何文本
- 只显示真实振幅驱动的波形
- 不显示关闭按钮或停止按钮
- 播放时常驻显示低对比的胶囊式估算进度填充；进度不可拖动或跳转
- 不显示播放进度文字

Overlay 波形由真实音频驱动。播放 renderer 从 active audio stream 提取轻量归一化 amplitude 与 13 个频段能量，以受限频率发送给 overlay renderer；overlay 在本地以快起慢落的方式平滑插值，避免离散指标造成跳动。Overlay 不接收或保存原始音频。

估算进度允许不准确。播放完成时可补到 100% 后快速淡出。

History Replay 不显示系统级 Playback Overlay。

## History

History 页面使用分栏布局：

- 左侧：按时间分组的历史列表
- 右侧：选中记录详情

窄窗口可退化为列表到详情。进入 History 默认选中最新记录；无记录时显示空状态。

历史分组为：

- `今天`
- `昨天`
- `本周`
- `更早`

每组内部按 `createdAt` 倒序。MVP 不做搜索。

每条历史列表项展示：

- 时间
- preview
- estimated duration
- language summary

preview 取全文第一段或第一行，压缩空白，最多约 120 字符。不使用 AI 摘要。estimated duration 用文本长度粗估，显示近似值，例如 `~2 min`。

详情页展示全文，并支持：

- 重新播放整条记录
- 复制
- 添加收藏
- 删除单条

历史记录不可编辑，不支持选中部分播放。添加收藏入口放在历史详情动作区，按钮文案为 `添加收藏`；每次添加都会创建一条新的 Favorite Record，即使这条历史记录或相同全文之前已经收藏过。添加后留在历史页，并可以短暂反馈 `已添加`，但不显示阻止再次添加的 `已收藏` 状态。删除单条需要轻量二次确认；删除后选中下一条最近记录，没有记录则显示空状态。

History Replay 使用当前 Preferred Voice、当前 Speech Rate 和当前 Model。History Replay 不新增 Reading History Record，不更新时间，不显示系统级 Playback Overlay；播放反馈只在历史详情区域显示，并复用真实振幅波形组件。Esc 仍然可以全局停止 History Replay。

## Favorites

Favorites 页面使用与 History 相同的分栏布局：

- 左侧：按收藏时间分组的收藏列表
- 右侧：选中收藏详情

窄窗口可退化为列表到详情。进入 Favorites 默认选中最新收藏；无收藏时显示空状态。

收藏分组为：

- `今天`
- `昨天`
- `本周`
- `更早`

每组内部按收藏时间倒序。MVP 不做搜索，不提供清空收藏，不显示收藏数量 badge，也不在 Settings 显示收藏数量。无收藏时列表空状态显示 `暂无收藏`，详情提示 `在历史记录详情中添加收藏后，会显示在这里。`

每条收藏列表项展示：

- 收藏时间
- preview
- estimated duration
- language summary

详情页展示全文，并支持：

- 重新播放整条收藏
- 复制
- 删除

收藏不可编辑，不支持选中部分播放；复制只复制全文，不包含收藏时间或原朗读时间。收藏详情同时显示收藏时间和原朗读时间。删除收藏不需要二次确认；删除后选中下一条更旧的收藏，没有下一条则选中上一条更新的收藏，没有收藏则显示空状态。Favorite Replay 使用当前 Preferred Voice、当前 Speech Rate 和当前 Model。Favorite Replay 不新增 Reading History Record，不显示系统级 Playback Overlay；播放反馈只在收藏详情区域显示，并复用真实振幅波形组件。Esc 仍然可以全局停止 Favorite Replay。

## Reading History Persistence

Reading History 保存本机全文历史，不保存音频。每条 Reading History Record 包含：

- `id`
- `createdAt`
- `text`
- `preview`
- `durationEstimate`
- `languageSummary`
- `source=selected_text | clipboard`

History Record 在 Play 找到有效 Reading Target 后、调用 MiniMax 前创建。即使后续 MiniMax 失败，该记录仍保留。MiniMax 成功/失败状态不写入 History Record。

重复播放同一 Reading Target source 和全文时，若 5 分钟内完全相同，则复用最近记录，不新增重复记录。超过 5 分钟后再次播放同一 Reading Target，可以创建新记录。

History Record 只保存原始全文和展示元数据，不保存 Reading Segments。重播时重新分段和语言检测。

历史保留期限选项：

- `7 天`
- `1 个月`
- `3 个月`
- `永久`

默认 `1 个月`。保留期限变化立即生效，缩短期限会立即删除超期记录。应用启动时、保留期限变化时、新增历史记录后都可以自动清理超期记录。

设置页提供 `Clear Reading History`，使用页内确认，不用系统 modal。清空或删除 Reading History 不影响已经创建的 Favorite Records。MVP 不做导出或备份。

## Favorites Persistence

Favorites 保存本机全文收藏，不保存音频。Favorite Record 只能从 Reading History Record 创建；第一版不从当前正在朗读的 Reading Target 直接收藏。

每条 Favorite Record 包含：

- `id`
- `favoritedAt`
- `sourceCreatedAt`
- `text`
- `preview`
- `durationEstimate`
- `languageSummary`
- `source=selected_text | clipboard`

Favorite Record 复制创建时所需的全文和展示元数据，不只保存指向 Reading History Record 的引用。删除单条历史、清空历史或历史保留期限清理，都不删除 Favorite Records。删除收藏只删除当前这一条 Favorite Record；相同 source 和全文的其他 Favorite Records 仍然保留。

## Settings

设置页分组为：

- `账户与连接`
- `快捷键`
- `朗读`
- `历史记录`
- `通用`

`账户与连接` 包含：

- MiniMax API key 输入
- 连接验证
- Voice 列表刷新
- 安全错误提示

MiniMax API key 由用户自带，本地保存。必须验证成功后才能播放。验证 API key 时刷新 Voice 列表；Settings 提供手动刷新。播放时不刷新 Voice list。

API key 未配置、未验证或验证失败时，Play/快捷键静默跳过。Home 和 Settings 显示配置状态。验证失败不写 Error Log；Settings 显示安全的具体原因，例如 `Invalid API key`、`Network error`、`MiniMax returned no voices`，不展示原始响应、请求头或 API key。

Voice 列表刷新失败但本地已有可用 Voice 缓存时，允许播放。刷新失败只在 Settings 显示，不写 Error Log。没有可用 Voice 时，Play 静默跳过。

`快捷键` 包含：

- Activation Shortcut 录制与注册状态
- 默认 `Control+Command+R`

快捷键注册失败只在 Settings 显示，让用户更换快捷键；不写 Error Log。Menu Bar Play 仍可用。

`朗读` 包含：

- Speech Rate
- Model

Speech Rate 范围为 `0.5x - 3.0x`，步进 `0.1x`，默认 `1.0x`。Speech Rate 应用到本地播放速度，不传给 MiniMax 重新生成。

Model 是全局默认配置，放 Settings。默认 `speech-2.8-turbo`。设置页提供内置常用模型列表和高级自定义 model id。自定义 Model 不做可用性验证；播放失败时按运行时失败处理并写 Error Log。

`历史记录` 包含：

- History retention
- Clear Reading History
- 本地隐私说明

隐私说明应明确：

- 历史全文只保存在本机
- 收藏全文只保存在本机
- 不保存音频
- 当前朗读文本会发送给 MiniMax 生成语音

`通用` 包含：

- Launch at Login
- Error Log 数量和 Clear

Launch at Login 默认关闭。Error Log 最多保留最近 100 条，Settings 只显示数量和清空按钮，不展示详细 Diagnostics。

## Local Data and Security

VoiceReader 使用 SQLite 存储本地 Reading History、Favorites、设置元数据、Error Log 和 MiniMax API key，数据库位于 Electron app data 目录。SQLite 不加密。MiniMax API key 直接保存到 SQLite，不使用 Electron `safeStorage` 或 macOS Keychain，避免钥匙串访问提示。

MVP 不做数据库导出或备份。

Error Log 是本地非内容日志，只记录运行时播放失败，不包含：

- 空剪切板跳过
- 空 Selected Text 跳过
- 非文本剪切板跳过
- API key 未配置跳过
- Selected Text
- Clipboard Text
- Reading Target
- 生成音频
- MiniMax 原始响应
- stack trace

Error Log 保存时间、错误类别和安全消息等非内容信息。Settings 只显示日志数量和清空按钮。

MiniMax/API/网络播放运行时失败写 Error Log。配置类问题不写 Error Log。

## Technical Decisions

- Electron + React + TypeScript。
- 直接重构为 Electron macOS app，不维护 Chrome 扩展作为一等目标。
- 删除不再使用的 Chrome extension 代码，而不是保留 unused Manifest V3 surfaces。
- 主进程负责 clipboard、globalShortcut、menu bar、窗口、overlay、SQLite、MiniMax streaming 和 IPC 协调。
- renderer 负责中文 UI 和音频播放。
- MiniMax streaming 放在 Electron main process，避免明文 API key 进入 renderer。
- main process 将 mp3 audio bytes 通过 IPC 流给 playback renderer。
- renderer 使用浏览器音频能力播放，不保存音频文件。
- Favorites 独立于 Reading History 保存，不使用历史记录引用作为唯一数据来源。
- 长文本沿用现有策略：当前段播放时预取/生成后续段；取消时 abort 并清空队列。
- app 默认显示 Dock 图标。
- 首次启动显示主窗口；后续启动默认隐藏到 menu bar。
- 使用本地 `hasCompletedOnboarding` 判断首次配置是否完成。完成 API key 验证和快捷键注册后置为 true。
- 不做单独 onboarding 流程页，使用 Home/Settings 的配置状态引导。

## Visual and Branding

产品名为 `VoiceReader`。窗口标题、菜单、打包名使用 `VoiceReader`。当前工程包名可以等 Electron 迁移时再统一。

VoiceReader 需要自己的图标。图标偏声音方向，使用 speaker/waveform 作为主形态，避免看起来像录音输入。Menu bar 使用单色 template icon；Dock/app 使用彩色图标。

不做播放开始/结束提示音。

## Out of Scope

- Chrome extension 继续维护
- Browser page extraction
- 自动监听剪切板变化
- 自动播放剪切板变化
- 搜索历史
- 历史导出/备份
- 历史文本编辑
- 历史局部播放
- 暂停/继续
- 自动更新
- 代码签名和公证
- 隐藏 Dock 图标设置
- 独立主题设置
- 系统通知式播放状态
- 保存生成音频
- SQLite 加密
- MiniMax 原始响应保存

## Testing Decisions

- Unit test Clipboard Text 读取边界：非空纯文本可读，空文本和非文本跳过。
- Unit test Reading History Record 创建时机：有效 Clipboard Text 后、MiniMax 调用前。
- Unit test 5 分钟去重规则。
- Unit test retention cleanup：启动、新增记录、保留期限变化。
- Unit test preview、durationEstimate、languageSummary 生成。
- Unit test History Replay 不新增历史、不更新时间。
- Unit test Favorite Record 从 Reading History Record 创建，允许重复收藏。
- Unit test 删除或清理 Reading History 不删除 Favorite Records。
- Unit test Favorite Replay 不新增历史、不更新时间。
- Unit test API key 未配置/未验证/无 Voice 静默跳过且不写 Error Log。
- Unit test MiniMax runtime failure 写 Error Log 且不包含内容。
- Unit test production MiniMax adapter：JSON/SSE、增量/final 去重、endpoint fallback、abort/backpressure、无音频与 malformed hex。
- Unit test Error Log 最多保留 100 条。
- Integration test Electron main IPC：Play、Stop、new Play replacement、abort streaming。
- Integration test overlay lifecycle：有效文本后依次进入准备与朗读，完成/失败/停止显示不同终态后淡出，Esc 与菜单栏均可停止。
- Integration test settings persistence：API key SQLite persistence、shortcut、Speech Rate、Model、retention、Launch at Login。
- UI verification should include Home, History list/detail, Favorites list/detail, Settings, Playback Overlay, and dark/light appearances.
