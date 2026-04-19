## Why

临时要把本地某个目录发给同事、把静态打包产物（Vite / Webpack `dist`）在局域网手机上预览、或者临时给朋友发一个大文件——这些场景跑到 CDN / 公网 / 聊天工具上成本高、隐私差。一个"选个目录一键开 HTTP 服务 + LAN IP + 二维码"的本地服务器是开发者 / 设计师高频刚需。Wails 桌面应用天然可以起 HTTP 服务、枚举网卡 IP、感知防火墙状态，把这件事做成工具箱的一级模块是显然的差异化模块。

## What Changes

- 新增 `local-server` 模块：侧边栏入口；进入后显示"根目录 + 端口 + 模式 + 启动/停止"控制台。
- 根目录：`PathPicker` 选择；支持切换根目录必须先停止服务。
- 端口：默认 `8080`，可自定义（1024–65535）；启动前校验占用（`net.Listen` 试探），**不自动切换**，直接提示用户换端口。
- 服务核心：`http.Server` + `http.FileServer(http.Dir(root))` + 自定义 logging middleware；绑定 `0.0.0.0` 以支持 LAN 访问；提供"仅本机 (127.0.0.1)"开关切到单接口模式。
- LAN IP 枚举：启动成功后通过 `net.Interfaces()` 列出所有非 loopback、UP、IPv4 接口地址；前端展示列表；每个地址旁边一个 "生成二维码" 按钮（弹 Popover 里前端渲染 QR Code）。
- 访问日志：Go 层维护 ring buffer（最近 200 条），每条 `{ time, remoteAddr, method, path, status, bytes, duration }` 通过 `EventsEmit("server:log", entry)` 推给前端；前端表格实时追加。
- SPA history fallback：可选开关"SPA 模式"：对所有非文件路径返回 `index.html`（HTTP 200），适配 React / Vue 单页应用部署预览。
- 单文件下载模式：可选开关"单文件模式"：根路径不是目录而是一个文件，服务 `/<filename>` 直接返回该文件并触发下载；其它路径 404；特别适合临时分享一个大文件。
- 基础认证：可选开关，启用后设置 `username` + `password`，服务端强制 HTTP Basic Auth；未认证返回 `401 WWW-Authenticate: Basic`。密码字段前端用 `Input.Password` 展示，传输时前端不额外加密（HTTP Basic 本就是明文，使用者需意识）。
- 防火墙提示：启动成功后若检测到无任何 LAN IP 可用（例如完全禁用 Windows Defender Firewall 允许入站）MUST 显示 Tips："如局域网无法访问，请在 Windows 防火墙中允许 DevTools 入站，或切换为仅本机模式"。
- 单实例：一次只允许运行一个服务；切换配置需先 Stop。
- 停止服务：优雅 shutdown（10s 超时），正在进行的请求允许完成。

## Capabilities

### New Capabilities
- `local-server`：本地文件 / 静态站点 HTTP 服务能力，含根目录选择、端口管理、LAN 枚举、二维码、访问日志、SPA 模式、单文件模式、基础认证。

## Impact

- **新增 Go 模块**：`internal/httpserver/`（Service 生命周期 + middleware + ring buffer + IP 枚举）。
- **`app.go` 新方法**：`StartServer(cfg) → error`、`StopServer() → error`、`GetServerStatus() → ServerStatus`、`GetServerConfig() / SaveServerConfig()`、`ListLanAddresses() → []string`。
- **新增事件**：`server:log`（逐条请求日志）、`server:status`（running/stopped/error）。
- **新增前端模块**：`frontend/src/features/localserver/`（控制台 + 状态 + 地址列表 + 日志表）。
- **Sidebar**：新增图标入口 `localserver`，`PageId` union 扩展。
- **配置**：`AppConfig.LocalServer` 字段（最后一次使用的根目录、端口、开关偏好）。
- **依赖新增**：前端新增 `qrcode.react`（二维码渲染）。Go 侧无新依赖（标准库 `net/http` 足够）。
