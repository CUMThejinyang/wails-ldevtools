## Why

Windows 自带的端口 / 进程排查链路冗长：`netstat -ano` 看 PID → `tasklist /FI "PID eq xxx"` 看进程名 → `taskkill /F /PID xxx` 才能杀掉，遇到系统服务还要手动提权。开发期间"哪个进程占了 3000 / 8080 / 5432？"几乎天天出现，开一个带搜索、带一键 kill（自动 UAC）的可视化面板，是 DevTools 的高频刚需。

## What Changes

- 新增 `port-viewer` 模块：侧边栏加入"端口占用"入口；进入后展示当前所有监听端口（TCP/UDP，IPv4/IPv6）。
- 列表字段：协议、本地地址、本地端口、远程地址 / 端口（仅 TCP ESTABLISHED）、状态、PID、进程名、可执行路径。
- 支持按 **端口号** / **进程名** / **PID** 实时搜索（客户端过滤，子串 + 整数匹配）；支持按协议（TCP/UDP/ALL）和地址族（v4/v6/ALL）过滤。
- 手动刷新 + 可选自动轮询（间隔 2s / 5s / 关闭，默认关闭）。
- 单条 Kill：调用 `ShellExecuteW` with `verb="runas"` 拉起 `taskkill /F /PID <pid>`，弹系统 UAC 对话框；用户取消或失败都需有可读错误反馈。
- 批量 Kill（多选）：聚合成一次 `cmd /c taskkill /F /PID a /PID b ...`，只弹一次 UAC。
- 若应用已是管理员（`IsUserAnAdmin` = true），跳过 UAC 直接 kill。
- 双击"本地端口"列（仅 HTTP 常用端口，如 80 / 8080 / 3000 / 4000 / 5000 / 8000 / 9000 等白名单，且 state = LISTEN）：用 `ShellExecute` 打开 `http://127.0.0.1:<port>`。
- 平台限定：Windows-only。Go 层用 build tag 区分；非 Windows 平台该模块 Sidebar 入口自动隐藏或显示"仅支持 Windows"占位。

## Capabilities

### New Capabilities
- `port-viewer`：端口占用查看与进程结束能力，包含枚举、搜索、过滤、自动轮询、UAC 提权 kill。

## Impact

- **新增 Go 模块**：`internal/netstat/`（枚举 + 进程信息）、`internal/procutil/`（Kill + UAC 辅助）。
- **`app.go` 新方法**：`ListPorts(filter) → []PortEntry`、`KillProcess(pid) → error`、`KillProcesses(pids) → error`、`IsElevated() bool`、`OpenInBrowser(url) error`。
- **新增事件**：无（刷新由前端主动触发；轮询由前端 `setInterval` 驱动）。
- **新增前端模块**：`frontend/src/features/ports/`（模块入口 + 表格 + 工具栏 + 过滤/搜索）。
- **Sidebar**：新增图标入口 `ports`，`PageId` union 扩展。
- **配置**：新增 `config.json` 中的 `portViewer` 字段（轮询间隔、协议过滤、默认排序等用户偏好）。
- **依赖新增**：Go 侧 `golang.org/x/sys/windows`（枚举网络表 + ShellExecute）。前端无新依赖。
