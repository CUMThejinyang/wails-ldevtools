## 1. Go 层：Service 骨架

- [x] 1.1 新建 `internal/httpserver/httpserver.go`，定义 `Config`、`ServerStatus`、`LogEntry`、`Stats`、`Service`
- [x] 1.2 `NewService(ctx)` 构造函数；注入 Wails ctx 用于 `EventsEmit`
- [x] 1.3 `IsRunning() bool` / `Status() ServerStatus`
- [x] 1.4 `Start(cfg Config) error`：前置校验 → `net.Listen` → `http.Server{}` → goroutine `server.Serve(listener)`
- [x] 1.5 `Stop() error`：`http.Server.Shutdown(ctx 10s)`；超时 fallback `server.Close()`
- [x] 1.6 `App.shutdown` 中调 `httpserver.Service.Stop()`（3s best-effort）

## 2. Go 层：handlers

- [x] 2.1 `fileServerHandler(root string) http.Handler`：`http.FileServer(http.Dir(root))`
- [x] 2.2 `spaFileServerHandler(root, indexName string) http.Handler`：优先尝试文件，否则返回 root/<indexName>；未找到 index 返回 404
- [x] 2.3 `singleFileHandler(filePath string) http.Handler`：响应 `/` 和 `/<basename>`，设置 `Content-Disposition: attachment`
- [x] 2.4 `authMiddleware(user, pass string) func(http.Handler) http.Handler`：`subtle.ConstantTimeCompare` 比较，失败 401
- [x] 2.5 `loggingMiddleware(onEntry func(LogEntry)) func(http.Handler) http.Handler`：记录 `start/end, method, path, status, bytes, remoteAddr, duration`
- [x] 2.6 `Start()` 中装配中间件链：logging → auth (可选) → 路由 handler

## 3. Go 层：Ring Buffer 与事件

- [x] 3.1 新建 `internal/httpserver/ringbuffer.go`：固定容量 200，线程安全 `Push` + `Snapshot`
- [x] 3.2 `Service` 内维护 `logs *RingBuffer`；logging middleware 的 `onEntry` 回调调用 `logs.Push` + 触发事件分发
- [x] 3.3 事件节流：100ms 窗口内合并多条 log，超过阈值时 emit `server:log_batch { entries: [...] }`；正常单条 emit `server:log`
- [x] 3.4 `GetLogs(n int)` 方法：返回最近 n 条快照，用于前端 mount 时初始加载

## 4. Go 层：IP 枚举与状态

- [x] 4.1 `ListLanAddresses() []string`：`net.Interfaces()` 过滤非 loopback + UP + IPv4 + 非链路本地
- [x] 4.2 `ServerStatus { running bool, root string, port int, bindLocal bool, mode string, authEnabled bool, startedAt time, stats Stats, urls []string }`
- [x] 4.3 `Service.Status()`：组合所有字段，`urls` 内部调用 `ListLanAddresses()` + `127.0.0.1` 拼接

## 5. Wails 绑定

- [x] 5.1 `app.go` 新增 `StartServer(cfg LocalServerConfig) error`
- [x] 5.2 `app.go` 新增 `StopServer() error`
- [x] 5.3 `app.go` 新增 `GetServerStatus() ServerStatus`
- [x] 5.4 `app.go` 新增 `GetServerLogs(n int) []LogEntry`
- [x] 5.5 `app.go` 新增 `ListLanAddresses() []string`
- [x] 5.6 `app.go` 新增 `GetLocalServerConfig()` / `SaveLocalServerConfig()`
- [x] 5.7 `AppConfig` 添加 `LocalServer LocalServerConfig` 字段；`defaultConfig()` 补默认值
- [x] 5.8 启动服务时若 `saveAsDefault = true` 则回写 config.json

## 6. 前端：类型与 bridge

- [x] 6.1 `frontend/src/types/index.ts` 添加 `LocalServerConfig`、`ServerStatus`、`LogEntry`
- [x] 6.2 `frontend/src/services/bridge.ts` 添加：`startServer`、`stopServer`、`getServerLogs`、`listLanAddresses`、`getLocalServerConfig`、`saveLocalServerConfig`
- [x] 6.3 `PageId` union 扩展 `'localserver'`
- [x] 6.4 `package.json` 新增 `qrcode.react`（前端二维码渲染）

## 7. 前端：页面骨架

- [x] 7.1 新建 `frontend/src/features/localserver/index.tsx`：`PageShell` + 三段式布局（ControlPanel / AddressList / LogTable）
- [x] 7.2 页级状态：`config`（表单）+ `status`（后端）分离；初次 mount 调 `getServerStatus` 同步
- [x] 7.3 顶部固定 `StatusBadge`：运行中 / 已停止 / 错误（带错误文案）

## 8. 前端：ControlPanel

- [x] 8.1 新建 `components/ControlPanel.tsx`
- [x] 8.2 根目录：`PathPicker`，单文件模式下切换为文件选择器
- [x] 8.3 端口：Antd `InputNumber`，1024–65535，默认 8080
- [x] 8.4 开关（Antd `Switch`）：仅本机 / SPA 模式 / 单文件模式 / 启用基础认证
- [x] 8.5 互斥约束：单文件 ⇄ SPA 互斥，前端 disable 另一侧
- [x] 8.6 认证启用时显示 username / password 输入（`Input.Password`）
- [x] 8.7 启动 / 停止按钮：运行态显示"停止"（红色 danger），否则"启动"（primary）
- [x] 8.8 运行中所有配置控件 disable
- [x] 8.9 错误展示：启动失败时 `Alert` 显示具体原因

## 9. 前端：AddressList

- [x] 9.1 新建 `components/AddressList.tsx`
- [x] 9.2 运行中时展示地址列表：`http://127.0.0.1:<port>` + 所有 LAN IP
- [x] 9.3 每行操作：复制 / 二维码 Popover / 在浏览器打开（调 `openInBrowser` 若已实现，否则用 `window.open`）
- [x] 9.4 `components/QrPopover.tsx`：使用 `qrcode.react`，白色背景、主色 `#00b96b` 前景色；尺寸 180
- [x] 9.5 暴露范围 Tag：仅本机 绿 / LAN 黄；认证开启时额外 "🛡 已启用基础认证"

## 10. 前端：LogTable

- [x] 10.1 新建 `components/LogTable.tsx`
- [x] 10.2 列：时间（mm:ss.SSS）、远程 IP、Method、Path、Status（带颜色）、Bytes、耗时 (ms)
- [x] 10.3 订阅 `server:log` + `server:log_batch`（走 `useWailsEvent`）
- [x] 10.4 本地状态：`logs: LogEntry[]`，前端保留最多 200 条（超出 FIFO）
- [x] 10.5 首次 mount：`getServerLogs(200)` 初始化，避免页面切出再回来时日志空
- [x] 10.6 "清空"按钮：仅清空前端显示，不影响后端 ring buffer
- [x] 10.7 行点击：Popover 展开完整 URL + User-Agent（从 LogEntry 扩展）

## 11. Sidebar 与路由

- [x] 11.1 `Sidebar.tsx` 的 `NAV_ITEMS` 增加 `localserver`（图标 `CloudServerOutlined` 或自绘）
- [x] 11.2 `App.tsx` 增加 `<KeepAlive id="localserver"><LocalServerPage /></KeepAlive>` 槽位

## 12. 生命周期与容错

- [x] 12.1 启动中关闭 DevTools 应用 → `App.shutdown` 调 `Service.Stop()`，3 秒超时
- [x] 12.2 启动失败错误翻译：`address already in use` → `"端口 N 已被占用，请更换或检查占用进程（可使用端口占用模块）"`
- [x] 12.3 认证启用但密码空 → 启动前校验拦截 → 友好错误
- [x] 12.4 切换根目录 / 模式时运行中 → 按钮 disable + Tooltip "请先停止服务"

## 13. 视觉与验证

- [x] 13.1 视觉走查：状态徽章颜色、Tag 暴露范围色、Log Status 颜色（200 绿、3xx 蓝、4xx 橙、5xx 红）
- [ ] 13.2 冒烟用例：
  - 选目录 → 启动 → 127.0.0.1:8080 浏览器可访问
  - 手机扫 LAN IP 二维码能访问（首次可能需要允许 Windows 防火墙）
  - 停止服务 → 地址不可访问
  - 再次启动 → 正常
  - 启用认证 → 未认证访问 401 → 输入对账号密码可进
  - SPA 模式：访问 `/whatever` 返回 index.html 200
  - 单文件模式：访问根 → 下载文件；访问其它路径 404
  - 浏览器复杂页面（几十个请求）→ 前端日志表不卡顿
- [ ] 13.3 端口占用测试：先用 `python -m http.server 8080` 占用 → DevTools 启动应显示 "端口已占用"

## 14. 文档

- [x] 14.1 `README.md` 功能列表添加一行
- [x] 14.2 `CLAUDE.md` 架构章节补 `internal/httpserver`、`features/localserver` 说明、`server:log` / `server:status` 事件
