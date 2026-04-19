## Context

这是第一个在 DevTools 里**长期在后台运行**的模块。和 Cleaner / Sync 的"启动任务 → 跑完 → 结束"不同，HTTP 服务是"启动 → 常驻 → 手动停"。这带来几个新工程问题：

1. **生命周期管理**：切换页面、切换主题、应用最小化都**不应该**影响服务；只有显式"Stop"或应用退出时才终止。
2. **状态可观测**：即便页面 unmount 后再 mount，前端也要能读到当前状态（运行中 / 端口 / 根目录 / 累计请求数）。
3. **请求日志的反压**：浏览器并发请求 100 个资源时，每条都 emit event 会冲击前端渲染；需要日志截断 + batch。
4. **安全心智**：绑定 `0.0.0.0` 会让同一 Wi-Fi 下所有设备都能访问，必须在 UI 上清楚展示"你正在暴露什么给谁"。

## Goals / Non-Goals

**Goals:**
- 30 秒内完成：选目录 → 点启动 → 扫 QR → 手机访问。
- LAN / 仅本机 / 单文件 / SPA / 基础认证 五个开关覆盖 90% 开发场景。
- 访问日志清晰，能看到"谁拉了什么"。
- 停止服务平滑，不会卡住 DevTools 主窗口。
- 跨平台可用（Go 标准库 `net/http` 原生跨平台；IP 枚举同）。

**Non-Goals:**
- 不做文件上传（安全风险大，MVP 不做）。
- 不做 HTTPS / TLS（自签证书体验差；需要时用 ngrok / Caddy 更合理）。
- 不做 WebSocket / 反向代理 / 路径 rewrite。
- 不做访问控制列表（IP 白名单）；只有"开 / 关基础认证"。
- 不同时运行多个服务（一次一个）。
- 不做 Markdown 渲染 / 目录卡片美化（沿用 `http.FileServer` 默认目录页）。

## Decisions

### D1：Service 生命周期模型

**决定**：`internal/httpserver/` 提供单例 `Service`：

```go
type Service struct {
    ctx       context.Context
    cfg       Config
    server    *http.Server
    logs      *RingBuffer
    mu        sync.Mutex
    running   atomic.Bool
    startedAt time.Time
    stats     Stats // 累计请求数、字节数
}

func (s *Service) Start(cfg Config) error  // 同步返回，listener 已在监听
func (s *Service) Stop() error              // graceful shutdown 10s
func (s *Service) Status() ServerStatus
func (s *Service) Logs(n int) []LogEntry    // 读取最近 n 条
```

**关键点**：
- `Start` 先 `net.Listen`，端口占用立刻返回错误（前端可显示"端口已占用"而不是"启动失败"）。
- `Start` 把 listener 交给 `http.Server.Serve`（在 goroutine 中），主线程立即返回。
- `Stop` 调 `http.Server.Shutdown(ctx)`，10s 超时；超时 `Close()` 强关。
- `App.shutdown` 里调 `Service.Stop()`（程序退出时）。

### D2：中间件与路由构造

**决定**：`Start` 时动态构造 handler 链：

```
outer: loggingMiddleware
  └─ authMiddleware (可选)
     └─ 选路由：
         单文件模式    → singleFileHandler(filepath)
         目录模式 (SPA)   → spaFileServer(root, indexFile)
         目录模式 (Plain) → http.FileServer(http.Dir(root))
```

**`spaFileServer`** 实现：
- 尝试 `os.Stat(path.Join(root, r.URL.Path))`：若是文件或是目录且有 `index.html`，走 `FileServer`。
- 否则读 `root/index.html` 返回 200（SPA fallback）；若 `index.html` 不存在返回 404。

**`singleFileHandler`**：只响应 `/` 和 `/<basename>` 两条；返回文件 + 设置 `Content-Disposition: attachment; filename="..."` 强制下载；其它 404。

**`authMiddleware`**：标准 HTTP Basic；比较用 `subtle.ConstantTimeCompare` 防时序攻击；失败返回 `401` 带 `WWW-Authenticate: Basic realm="DevTools"`。

### D3：Ring Buffer + 事件节流

**决定**：
- 日志容量固定 200 条；`RingBuffer.Push(entry)` 覆盖最旧。
- 每条请求完成后：
  - 追加到 ring buffer。
  - 立即 `EventsEmit("server:log", entry)`（前端实时显示）。
- 前端侧：表格显示最近 200 条；用 `useReducer` 累积；> 200 条前端截断（保留内存小）。
- **批处理**：如果 1 秒内请求数 > 50（浏览器爬资源峰值），Go 侧把事件合并：每 100ms 最多发 1 次 `{ entries: [...最近 N 条] }`；前端收到批量事件后一次性 concat。

**理由**：网页打开瞬间可能 50+ 并发请求，每个 emit 走 webkit IPC 会抖动 UI；100ms 节流在用户感知无损情况下平滑 UI。

### D4：LAN IP 枚举

**决定**：`ListLanAddresses()` 调 `net.Interfaces()` → 过滤：
- `FlagLoopback` = false
- `FlagUp` = true
- IPv4 地址（`ip.To4() != nil`）
- 非链路本地 `169.254.*`

返回 `[]string`（`"192.168.1.42"`）。前端组合 `http://<ip>:<port>` 展示。

**理由**：绝大多数家庭 / 办公局域网在 `192.168.*`、`10.*`、`172.16-31.*`；链路本地不可达，过滤掉避免误导。

**二维码**：前端用 `qrcode.react` 渲染，零后端参与。Popover 点击出现。

### D5：Config 与持久化

**决定**：

```go
type LocalServerConfig struct {
    Root       string `json:"root"`
    Port       int    `json:"port"`       // 默认 8080
    BindLocal  bool   `json:"bindLocal"`  // true = 仅 127.0.0.1
    SpaMode    bool   `json:"spaMode"`
    SingleFile bool   `json:"singleFile"` // root 是否当单文件
    IndexName  string `json:"indexName"`  // 默认 "index.html"
    AuthEnabled bool  `json:"authEnabled"`
    AuthUser   string `json:"authUser"`
    AuthPass   string `json:"authPass"`   // 明文存 config.json（本地文件，用户 ACL 保护）
}
```

`AppConfig.LocalServer` 存一份**最近偏好**；启动服务时从前端传入 config，不直接读 `AppConfig`（可以让前端临时改参数而不污染持久化，直到用户显式"保存为默认"）。

**安全提示**：密码明文存 `~/.devtools/config.json`（Windows NTFS 用户目录 ACL 已经隔离）。UI 上明说"请勿使用复用密码"。

### D6：启动前校验

**决定**：`Start` 前做以下检查，任一失败立刻返回错误（不尝试部分启动）：
- `Root` 存在 → 否则 `"根目录不存在"`
- `SingleFile = true` 时 Root 必须是文件 → 否则 `"单文件模式要求根路径为文件"`
- `SingleFile = false` 时 Root 必须是目录 → 否则 `"目录模式要求根路径为目录"`
- Port 1024–65535 → 否则 `"端口超出范围"`
- `net.Listen` 成功 → 否则 `"端口 N 已被占用"`（附带建议：打开"端口占用"模块查看）
- Auth 开启时 user / pass 都非空 → 否则 `"认证用户名 / 密码不能为空"`

### D7：停止与切换

**决定**：
- 显式 Stop：`http.Server.Shutdown(ctx)` 10s 超时。
- 切换配置（root / port / 模式）：UI 强制"先 Stop 再 Start"，按钮在运行时显示"停止"、停止时显示"启动"。
- 应用退出：`App.shutdown` 内 `Service.Stop()` 做 best-effort shutdown；listener 关闭，不等待（3s 超时），避免退出卡顿。

### D8：SPA / 单文件的开关互斥

**决定**：UI 上 "单文件模式" 和 "SPA 模式" 互斥：前者打开时后者 disable。原因：单文件模式下没有"根目录"概念。

### D9：前端结构

```
features/localserver/
├─ index.tsx                   # PageShell + 控制台 + 地址列表 + 日志
├─ components/
│  ├─ ControlPanel.tsx         # 根目录 / 端口 / 开关 / 启动停止
│  ├─ AddressList.tsx          # 本机 + LAN 地址（含 QR Popover）
│  ├─ QrPopover.tsx            # 二维码
│  ├─ LogTable.tsx             # 请求日志表
│  └─ StatusBadge.tsx          # 运行中 / 已停止 / 错误
├─ hooks/
│  ├─ useServerStatus.ts       # 订阅 server:status
│  └─ useServerLogs.ts         # 订阅 server:log，截断 200
└─ types.ts
```

- 页级状态：`config`（表单态）+ `status`（后端态）分离；`config` 只在 Start 时提交。
- UI 上运行中 → 大部分控件禁用（只有 Stop、复制地址、打开 QR 可用）。

### D10：安全与边界

**决定**：
- UI 显著位置展示当前**暴露范围**：
  - 仅本机：绿色 Tag "🔒 仅本机 (127.0.0.1)"
  - LAN：黄色 Tag "⚠ 局域网可访问"
  - + 认证：额外 "🛡 已启用基础认证"
- 启动成功 toast：`已启动，局域网 3 个地址可访问`（或 `仅本机可访问`）。
- 路径穿越防护：`http.FileServer` 已内置处理（`../` 会被清理），无需额外中间件；单文件模式也不接受路径参数。

## Risks / Trade-offs

- **[防火墙首次弹窗]**：第一次在某端口启动时，Windows Defender Firewall 会弹出"允许访问"对话框。**不可规避**（这是 Windows 的安全特性）。UI 做提示。
- **[密码明文存储]**：`config.json` 里明文存 BasicAuth 密码。权衡过用 DPAPI 加密，觉得重——本地开发工具，NTFS ACL 已经兜底。UI 说明。
- **[HTTP Basic 安全弱]**：Basic Auth 本身是明文 base64；真实威胁模型下局域网可能被嗅探。MVP 可接受（开发临时分享，非生产用途）。UI 提示"不要用于敏感内容"。
- **[日志爆炸]**：浏览器开一个复杂页面会并发拉几百个资源；ring buffer 200 条足够近一分钟滚动；前端批处理 100ms 合并事件。
- **[目录包含超大文件夹]**：`http.FileServer` 生成目录页会列出所有文件，几千个文件时渲染慢。MVP 不做目录页美化；用户可以开 SPA / 单文件模式规避。
- **[端口占用错误信息不友好]**：`net.Listen` 错误信息在 Windows 是英文系统层错误。Go 层做翻译："端口已被占用，请更换或先关闭占用进程"。
- **[macOS / Linux 的网卡命名]**：`net.Interfaces()` 跨平台行为一致；Linux 的 Docker bridge 接口可能也会被列出来（以 `172.*` 开头）。MVP 可以接受，Phase 2 可加"可疑接口"过滤。
- **[应用退出时优雅关闭卡顿]**：`Shutdown` 10s 超时会让关窗慢。生产关窗用 `Close()` 强关 + 3s 超时，避免用户感知。

## Migration Plan

无数据迁移。首次启动 `config.json` 无 `LocalServer` 字段时用 `defaultConfig()` 补：

```go
LocalServer: LocalServerConfig{
  Port: 8080,
  BindLocal: false,
  IndexName: "index.html",
}
```

## Open Questions

- 是否需要"最近目录"下拉（选过的 root 记录最近 5 条）？→ **Phase 2**，有价值但不阻塞 MVP。
- 是否允许自定义 index 文件名？→ 默认 `index.html`，提供输入框允许改（MVP 做，成本低）。
- 是否要在日志里展示 User-Agent？→ **MVP 不展示**（省列宽），Popover 里可看全部 headers。
