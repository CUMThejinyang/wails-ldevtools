## ADDED Requirements

### Requirement: 端口列表枚举

系统 MUST 在用户进入 `ports` 页面时能够枚举当前 Windows 主机上所有 TCP / UDP 监听与连接记录，包含 IPv4 和 IPv6，并返回每条记录的 `{protocol, family, localAddr, localPort, remoteAddr, remotePort, state, pid, processName, exePath}` 字段。枚举 SHALL 基于 Windows API `GetExtendedTcpTable` / `GetExtendedUdpTable`，禁止通过解析 `netstat` 命令输出实现。

#### Scenario: 首次进入页面展示端口
- **WHEN** 用户点击侧边栏"端口占用"进入 `ports` 页面
- **THEN** 页面自动触发一次 `bridge.listPorts`
- **AND** 表格显示至少所有 `LISTEN` 状态的 TCP 端口（包括系统服务）
- **AND** 每行包含进程名与 PID

#### Scenario: 枚举失败
- **WHEN** `bridge.listPorts` 返回错误
- **THEN** 页面顶部显示红色 `Alert`，描述错误原因
- **AND** 表格保留上一次成功的数据（若存在），否则显示 `EmptyState`

#### Scenario: 非 Windows 平台
- **WHEN** 程序在非 Windows 平台运行
- **THEN** Sidebar 不渲染"端口占用"入口（或渲染禁用态并 Tooltip "仅支持 Windows"）

### Requirement: 搜索与过滤

系统 SHALL 在前端提供搜索框 + 协议 / 地址族 / 状态过滤器，过滤结果通过 `useMemo` 在客户端即时计算。搜索关键字为纯数字时 MUST 匹配 `localPort` 或 `pid`（整数相等或子串），为字符串时 MUST 匹配 `processName` 或 `exePath`（大小写不敏感子串）。

#### Scenario: 按端口号搜索
- **GIVEN** 表格中存在监听 8080 端口的记录
- **WHEN** 用户在搜索框输入 `8080`
- **THEN** 表格仅显示 `localPort === 8080` 或包含 "8080" 的 PID 行

#### Scenario: 按进程名搜索
- **GIVEN** 表格中有 `chrome.exe` 与 `Chrome.exe` 记录
- **WHEN** 用户输入 `chrome`
- **THEN** 两者均被匹配（大小写不敏感）

#### Scenario: 协议过滤
- **WHEN** 用户将协议过滤设为 `TCP`
- **THEN** 表格仅显示 `protocol === 'TCP'` 的行
- **AND** UDP 状态过滤控件被禁用

#### Scenario: 搜索无结果
- **WHEN** 搜索关键字无任何匹配
- **THEN** 表格显示 `EmptyState`，提示 "无匹配记录"

### Requirement: 自动轮询

系统 SHALL 提供自动轮询开关，可选 `关闭 / 2s / 5s` 三档，默认 `关闭`。轮询由前端 `setInterval` 驱动，MUST 在以下场景暂停或清除：页面 unmount、Sidebar 切出、`document.visibilityState === 'hidden'`。用户偏好 MUST 通过 `bridge.savePortViewerPrefs` 持久化。

#### Scenario: 启用 2 秒轮询
- **WHEN** 用户将自动刷新设为 2s
- **THEN** 每 2 秒调用一次 `bridge.listPorts`
- **AND** 刷新过程中保留旧数据，仅顶部显示进度指示

#### Scenario: 切出页面暂停轮询
- **GIVEN** 轮询已启用为 5s
- **WHEN** 用户点击 Sidebar 切换到其它模块
- **THEN** `setInterval` 被清除
- **AND** 切回 `ports` 时轮询恢复

#### Scenario: 窗口最小化暂停轮询
- **GIVEN** 轮询已启用
- **WHEN** 应用窗口被最小化，`document.visibilityState === 'hidden'`
- **THEN** 轮询暂停；窗口恢复后自动恢复

### Requirement: 管理员检测

系统 SHALL 在启动时调用 Windows `IsUserAnAdmin` 获取当前进程是否具备管理员权限，并通过 `bridge.isElevated` 暴露给前端。前端 MUST 在工具栏右侧根据该值展示对应标识：`true` 显示 "🛡 管理员模式"，`false` 不显示。

#### Scenario: 非管理员启动
- **WHEN** 用户以普通用户身份启动 DevTools
- **THEN** `bridge.isElevated()` 返回 `false`
- **AND** 工具栏不显示管理员标识

#### Scenario: 管理员启动
- **WHEN** 用户右键 "以管理员身份运行" 启动 DevTools
- **THEN** `bridge.isElevated()` 返回 `true`
- **AND** 工具栏右侧显示 "🛡 管理员模式" 标签

### Requirement: 单项 Kill 进程

系统 SHALL 对任一端口条目提供 Kill 操作。`isElevated === true` 时 MUST 直接通过 `os.Process.Kill()` 终止；`isElevated === false` 时 MUST 通过 `ShellExecuteW` 以 `runas` 动词拉起 `taskkill.exe /F /PID <pid>`。

#### Scenario: 管理员模式下 kill 用户进程
- **GIVEN** 应用以管理员身份运行
- **WHEN** 用户点击某行的 "Kill" 按钮
- **THEN** 弹出确认框显示 `"即将结束进程 <name> (PID <pid>)"`
- **AND** 确认后进程被直接终止，列表自动刷新

#### Scenario: 非管理员模式下 kill 系统进程
- **GIVEN** 应用以普通用户身份运行
- **WHEN** 用户 kill 一个系统服务进程
- **THEN** 系统弹出 UAC 对话框
- **AND** 用户点击"是"后，`taskkill` 执行成功，列表自动刷新

#### Scenario: 用户取消 UAC
- **GIVEN** UAC 对话框已弹出
- **WHEN** 用户点击 UAC 的"否"
- **THEN** 前端显示 `message.info('已取消权限请求')`（非错误色）
- **AND** 列表不刷新，目标进程不受影响

#### Scenario: 目标进程已退出
- **WHEN** 用户点击 Kill 时该 PID 已不存在
- **THEN** 返回错误 `"目标进程已不存在"`
- **AND** 前端显示 `message.warning`，并自动刷新列表

### Requirement: 批量 Kill 进程

系统 SHALL 支持多选多个端口条目后执行批量 Kill。批量 kill MUST 聚合为一次 `cmd.exe /c taskkill /F /PID a /PID b ...` 调用，仅弹 **一次** UAC 对话框。PID 列表长度超过 200 时 MUST 自动分批。

#### Scenario: 批量 kill 5 个进程
- **GIVEN** 用户多选了 5 条记录（对应 5 个 PID）
- **WHEN** 用户点击 "批量 Kill" 并确认
- **THEN** 仅弹一次 UAC
- **AND** 所有 5 个进程在一次 taskkill 调用中被终止

#### Scenario: 批量 kill 部分失败
- **GIVEN** 5 个 PID 中有 2 个已退出
- **WHEN** 批量 kill 完成
- **THEN** 前端显示 `3 成功 / 2 失败`
- **AND** 失败列表可通过 Popover 展开查看

#### Scenario: 超大批量分批
- **GIVEN** 用户多选了 450 条记录
- **WHEN** 批量 kill
- **THEN** Go 层分为 200 + 200 + 50 共 3 批执行
- **AND** 仅弹 1 次 UAC（每批都是同一次 runas 子进程？取决于实现，允许 ≤ 3 次）

### Requirement: 浏览器快速打开

系统 SHALL 维护 HTTP 常见端口白名单。当一行满足 `protocol === 'TCP' && state === 'LISTEN' && port ∈ whitelist` 时：行末 "在浏览器打开" 图标按钮 MUST 可点击；行 MUST 支持双击快速打开。其它端口双击 MUST 无响应。点击后 Go 层 SHALL 通过 `ShellExecute` 调用系统默认浏览器打开 `http://127.0.0.1:<port>`。

#### Scenario: 双击 8080 端口打开浏览器
- **GIVEN** 8080 端口处于 LISTEN 状态
- **WHEN** 用户双击该行
- **THEN** 系统默认浏览器打开 `http://127.0.0.1:8080`

#### Scenario: 双击非白名单端口
- **GIVEN** 某进程监听 55342 端口（非白名单）
- **WHEN** 用户双击该行
- **THEN** 无任何响应

#### Scenario: 双击 ESTABLISHED 连接
- **GIVEN** 某连接状态为 ESTABLISHED
- **WHEN** 用户双击该行
- **THEN** 无响应

### Requirement: 用户偏好持久化

系统 SHALL 在 `~/.devtools/config.json` 中保存 `portViewer` 字段，包含 `{ pollInterval, protocol, family, states }`，字段随用户操作即时保存。搜索关键字与表格排序 SHALL NOT 持久化。

#### Scenario: 偏好跨启动保留
- **GIVEN** 用户将协议过滤设为 TCP、轮询设为 5s
- **WHEN** 重启 DevTools 并进入 `ports` 页面
- **THEN** 协议过滤仍为 TCP
- **AND** 轮询仍为 5s
