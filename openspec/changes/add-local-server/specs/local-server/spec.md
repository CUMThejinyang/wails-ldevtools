## ADDED Requirements

### Requirement: 服务生命周期

系统 SHALL 维护一个单例 HTTP 服务。`Start(cfg)` MUST 同步返回：`net.Listen` 成功后 listener 交给 goroutine 处理请求，主线程立即返回；`Stop()` MUST 执行优雅关闭（`http.Server.Shutdown`），超时 10 秒后 fallback 强制关闭。同一时刻 MUST 只允许一个服务实例运行，重复 `Start` 在运行中时 MUST 返回错误 `"服务已在运行"`。应用退出（`App.shutdown`）时 SHALL 调用 `Stop()` 做 best-effort 关闭（3 秒超时）。

#### Scenario: 正常启动与停止
- **WHEN** 用户填好配置点击"启动"
- **THEN** `net.Listen` 绑定对应端口
- **AND** 前端页面状态变为"运行中"
- **AND** `http://127.0.0.1:<port>` 在浏览器可访问

#### Scenario: 启动时端口已占用
- **GIVEN** 端口 8080 已被其它进程占用
- **WHEN** 用户点击启动
- **THEN** 返回错误 `"端口 8080 已被占用，请更换或检查占用进程"`
- **AND** 服务状态保持 `stopped`

#### Scenario: 重复启动
- **GIVEN** 服务已在运行
- **WHEN** 再次调用 `StartServer`
- **THEN** 返回错误 `"服务已在运行"`

#### Scenario: 应用退出时关闭
- **GIVEN** 服务正在运行
- **WHEN** 用户关闭 DevTools 窗口
- **THEN** `App.shutdown` 调用 `Service.Stop()`，3 秒内关闭 listener
- **AND** 应用退出

### Requirement: 配置校验

`Start(cfg)` 前 MUST 做以下校验，任一失败立即返回错误，不尝试部分启动：

1. `Root` 存在
2. `SingleFile = true` 时 `Root` 是文件；`SingleFile = false` 时 `Root` 是目录
3. `Port` 在 `[1024, 65535]`
4. Auth 启用时 `AuthUser` 和 `AuthPass` 非空
5. `net.Listen(port)` 成功

#### Scenario: 根目录不存在
- **WHEN** 用户选择了不存在的路径并启动
- **THEN** 返回错误 `"根目录不存在"`

#### Scenario: 单文件模式选了目录
- **GIVEN** `SingleFile = true` 且 Root 是一个目录
- **WHEN** 用户启动
- **THEN** 返回错误 `"单文件模式要求根路径为文件"`

#### Scenario: 认证启用但密码空
- **GIVEN** `AuthEnabled = true` 且 `AuthPass = ""`
- **WHEN** 用户启动
- **THEN** 返回错误 `"认证用户名/密码不能为空"`

### Requirement: 绑定范围与暴露提示

系统 SHALL 支持两种绑定模式：
- `BindLocal = true`：绑定 `127.0.0.1`，仅本机可访问。
- `BindLocal = false`：绑定 `0.0.0.0`，局域网可访问。

前端 MUST 在运行中显著位置展示当前暴露范围标签：仅本机为绿色，LAN 为黄色 `"⚠ 局域网可访问"`；认证启用时追加 `"🛡 已启用基础认证"`。

#### Scenario: 仅本机模式
- **GIVEN** `BindLocal = true`
- **WHEN** 服务启动成功
- **THEN** LAN 设备访问 `http://<LAN_IP>:<port>` 连接拒绝
- **AND** UI 显示绿色 "🔒 仅本机" 标签

#### Scenario: LAN 模式
- **GIVEN** `BindLocal = false`
- **WHEN** 服务启动成功
- **THEN** UI 显示黄色 "⚠ 局域网可访问" 标签
- **AND** LAN IP 列表展示所有可达地址

### Requirement: LAN IP 枚举

系统 MUST 通过 `net.Interfaces()` 枚举所有网卡，过滤保留：非 loopback、UP、IPv4、非链路本地（`169.254.*`）。前端 SHALL 展示 `127.0.0.1` + 所有过滤后 IP，每条一行；每条 MUST 提供"复制"、"二维码 Popover"、"在浏览器打开"三个操作。

#### Scenario: 多网卡场景
- **GIVEN** 机器同时接有有线网 `192.168.1.42` 与 Wi-Fi `192.168.2.10`
- **WHEN** 服务启动
- **THEN** 地址列表包含 `127.0.0.1`、`192.168.1.42`、`192.168.2.10` 三条

#### Scenario: 二维码 Popover
- **WHEN** 用户点击某地址旁的"二维码"图标
- **THEN** Popover 展示该 URL 的二维码
- **AND** 二维码尺寸不小于 180×180

#### Scenario: 禁用网络适配器
- **GIVEN** 用户禁用了所有网卡
- **WHEN** 服务启动（LAN 模式）
- **THEN** 地址列表仅包含 `127.0.0.1`
- **AND** 页面显示提示 "未检测到可用局域网地址，如需 LAN 访问请检查网络连接"

### Requirement: 文件服务模式

系统 MUST 支持三种访问模式：

1. **目录模式（默认）**：`http.FileServer(http.Dir(root))` 默认行为，支持目录页与文件下载。
2. **SPA 模式**（`SpaMode = true`）：对不存在的路径返回 `<root>/<indexName>`（默认 `index.html`），HTTP 200。
3. **单文件模式**（`SingleFile = true`）：仅响应 `/` 与 `/<basename>`，返回文件并设置 `Content-Disposition: attachment`；其它路径返回 404。

`SpaMode` 与 `SingleFile` MUST 互斥：前端在一个启用时禁用另一个。

#### Scenario: SPA 模式 fallback
- **GIVEN** `SpaMode = true`，根目录含 `index.html`
- **WHEN** 浏览器访问 `/users/42/profile`（该路径在磁盘上不存在）
- **THEN** 响应 200 + `index.html` 内容

#### Scenario: SPA 模式 index 缺失
- **GIVEN** `SpaMode = true`，根目录没有 `index.html`
- **WHEN** 访问不存在的路径
- **THEN** 响应 404

#### Scenario: 单文件模式下载
- **GIVEN** `SingleFile = true`，Root 指向 `D:\dist\package.zip`
- **WHEN** 访问 `/` 或 `/package.zip`
- **THEN** 返回文件内容，Header `Content-Disposition: attachment; filename="package.zip"`

#### Scenario: 单文件模式其它路径
- **WHEN** 访问 `/other`
- **THEN** 返回 404

#### Scenario: 互斥开关
- **GIVEN** `SingleFile = true`
- **WHEN** 用户切换到 UI
- **THEN** `SPA 模式` 开关被禁用（灰色）

### Requirement: HTTP Basic 认证

系统 SHALL 支持可选的 HTTP Basic 认证。启用时所有请求 MUST 通过认证，否则返回 `401` + `WWW-Authenticate: Basic realm="DevTools"`。比较 MUST 使用 `subtle.ConstantTimeCompare` 防时序攻击。

#### Scenario: 未认证访问
- **GIVEN** 认证已启用，user=admin / pass=secret
- **WHEN** 客户端访问 `/` 未携带凭证
- **THEN** 响应 `401 Unauthorized` + `WWW-Authenticate: Basic realm="DevTools"`

#### Scenario: 正确凭证访问
- **WHEN** 客户端携带 `Authorization: Basic <base64(admin:secret)>` 访问
- **THEN** 响应 200 + 正常内容

#### Scenario: 错误凭证
- **WHEN** 客户端携带错误密码
- **THEN** 响应 401

### Requirement: 请求日志

系统 MUST 维护固定容量（200 条）的 ring buffer，每个 HTTP 请求 MUST 在完成后生成一条 `LogEntry { time, remoteAddr, method, path, status, bytes, durationMs }` 并写入缓冲区。每条日志 SHALL 通过 Wails `EventsEmit` 推送给前端。突发流量（100ms 内 > 10 条）时 Go 层 SHALL 合并成 `server:log_batch` 批量事件（每 100ms 最多发送一次）。前端 MUST 保留最多 200 条日志，溢出 FIFO 淘汰。

#### Scenario: 单请求日志
- **WHEN** 客户端访问 `/file.css` 返回 200
- **THEN** 前端表格末尾新增一行显示 `200 GET /file.css`

#### Scenario: 突发流量节流
- **GIVEN** 浏览器 100ms 内并发发起 50 个请求
- **WHEN** 服务端处理完成
- **THEN** 前端收到的事件 ≤ 1 次 batch
- **AND** 表格最终显示所有 50 条日志

#### Scenario: 页面切回保留日志
- **GIVEN** 服务已运行产生若干日志
- **WHEN** 用户切换 Sidebar 离开再回来
- **THEN** `LogTable` mount 时调用 `getServerLogs(200)` 初始化
- **AND** 显示最近 200 条日志

#### Scenario: 日志超过 200 条
- **GIVEN** ring buffer 已满 200 条
- **WHEN** 第 201 条请求完成
- **THEN** 最旧一条被覆盖
- **AND** 前端展示依然是 200 条

### Requirement: 运行中配置只读

服务运行中 MUST 禁止修改配置（根目录、端口、各种开关）。前端所有配置控件 MUST 置为 `disabled`，只有"停止"按钮可用。修改配置需先停止服务。

#### Scenario: 运行中编辑端口
- **GIVEN** 服务正在运行
- **WHEN** 用户尝试修改端口输入框
- **THEN** 输入框为禁用态不可编辑
- **AND** 显示 Tooltip "请先停止服务"

### Requirement: 配置持久化

系统 SHALL 将最近一次"保存为默认"的配置持久化到 `~/.devtools/config.json` 的 `localServer` 字段。启动时若该字段缺失，使用默认值 `{ port: 8080, bindLocal: false, indexName: "index.html" }`。密码字段 SHALL 明文保存，UI 须提示 "密码以明文保存在本地配置，请勿使用重要密码"。

#### Scenario: 跨启动保留配置
- **GIVEN** 用户设置了 port=9000、spaMode=true 并保存
- **WHEN** 重启 DevTools 并进入 `localserver` 页面
- **THEN** 端口输入框显示 9000
- **AND** SPA 模式开关为开

### Requirement: Sidebar 入口

系统 MUST 在 Sidebar 新增 `localserver` 入口（图标 + "本地服务" 标签）。入口 SHALL 在所有支持平台可见（Windows / macOS / Linux 均可用，Go `net/http` 跨平台）。

#### Scenario: 所有平台入口可见
- **WHEN** DevTools 在任一平台启动
- **THEN** Sidebar 展示"本地服务"入口
- **AND** 点击进入 `localserver` 页面
