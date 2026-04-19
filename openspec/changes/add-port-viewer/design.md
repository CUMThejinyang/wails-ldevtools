## Context

DevTools 目前有 Cleaner / Sync / Codec 三个模块，都是"纯数据操作"场景。端口查看是第一个需要**系统级信息 + 权限提升**的模块：

- 需要读取 Windows 网络表（非普通文件系统 API）。
- 杀进程本身不需要提权（同一会话 / 同一用户的进程），但杀**系统服务或其它会话的进程**必须管理员。
- DevTools 自身不是以管理员启动，不能整体提权（会连带影响 Cleaner / Sync 的行为并让启动多一个 UAC），因此 Kill 这步得做"**按需提权**"。

平台只支持 Windows：Linux/macOS 有 `lsof`、`ss` 等成熟命令行工具，价值比 Windows 低很多；跨平台等后续有明确需求再加。

## Goals / Non-Goals

**Goals:**
- 一屏列出所有监听端口 + 连接，搜索 / 过滤 / 排序丝滑（本地操作）。
- 单次 UAC 即可 kill，批量 kill 也只弹一次。
- 进程名、可执行路径、PID 在一行能看到。
- 支持双击 HTTP 白名单端口快速在浏览器打开。
- 自动轮询可选，默认关闭（避免持续读 Windows API 无意义发热）。

**Non-Goals:**
- 不做抓包、流量统计、连接详情。
- 不做防火墙规则管理。
- 不做跨平台（非 Windows 平台直接展示占位）。
- 不做"进程树"可视化（父子关系）。
- 不做后台常驻监听"端口变化"并通知（打开页面 → 手动刷新 / 轮询即可）。

## Decisions

### D1：用 Windows API 枚举，不解析 `netstat`

**决定**：Go 层通过 `syscall` + `golang.org/x/sys/windows` 调用 `GetExtendedTcpTable` / `GetExtendedUdpTable`（v4 + v6 两次），直接拿到 `(LocalAddr, LocalPort, RemoteAddr, RemotePort, State, PID)` 结构化数据。

**理由**：
- `netstat -ano` 需要启动子进程 + 解析输出，慢且脆（列宽和 i18n 都会坑）。
- Windows API 毫秒级返回几千条记录，零分配（buffer 复用）。
- 所有 Windows 版本（≥ Vista）稳定可用。

**踩坑预防**：
- `GetExtendedTcpTable` 需要调用两次：第一次给 `nil` buffer 拿需要的字节数，第二次分配对应大小再取数据。
- `TCP_TABLE_OWNER_PID_ALL` 模式包含 PID；`TCP_TABLE_OWNER_MODULE_ALL` 额外给 module 信息但开销大，暂不用。
- IPv6 地址字节序需要额外处理。

### D2：进程信息查询

**决定**：
- 拿到 PID 后，批量查询进程名和可执行路径：
  - `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)` 打开句柄。
  - `QueryFullProcessImageNameW` 拿到 `\Device\HarddiskVolumeN\...` 形式路径，转换为 `D:\...` 盘符路径。
  - 关闭句柄。
- 维护 `map[uint32]processInfo` 缓存，同一次 `ListPorts` 调用内复用（同 PID 只查一次）。
- 不可访问的进程（系统进程 PID 0、System PID 4 等）：进程名填 `"System Idle Process"` / `"System"` 等预定义名，路径填 `"-"`，不视为错误。

**理由**：一次刷新可能有几千条 TCP 连接，同一个 PID（如 Chrome）出现几百次，不缓存会严重慢。

### D3：Kill 提权策略

**决定**：
- 启动时一次性调用 `IsUserAnAdmin`（Shell32.dll）记录 `isElevated`。
- 单个 kill：
  - `isElevated = true` → 直接 `os.FindProcess(pid).Kill()`。
  - `isElevated = false` → `ShellExecuteW(nil, "runas", "taskkill.exe", "/F /PID <pid>", nil, SW_HIDE)`，弹 UAC。
- 批量 kill（≥ 2）：
  - 仍走 `runas`，但调用 `cmd.exe /c taskkill /F /PID a /PID b /PID c ...`，只一次 UAC。
- 返回结果：
  - UAC 被拒：`ShellExecuteW` 返回句柄 ≤ 32，错误码 `ERROR_CANCELLED (1223)` → 返回 `"用户取消了权限请求"` 错误。
  - taskkill 失败（进程不存在 / 已退出）：前端收到错误提示，自动刷新列表。
  - 成功：前端自动刷新。

**理由**：
- 不整体提权 DevTools，避免 Cleaner 在"删除系统保护目录"时意外成功。
- `taskkill /F` 比 `TerminateProcess` 语义更清晰，还能处理受保护进程（需提权即可）。
- `runas` 是系统标准机制，用户熟悉。

**替代方案**：用 `Process.Kill()` + `SeDebugPrivilege` 提权。缺点：权限申请复杂、失败场景多、仍需 UAC。弃用。

### D4：刷新策略

**决定**：
- 默认手动刷新（点"刷新"按钮触发 `ListPorts`）。
- 顶部提供"自动刷新"下拉：`关闭 / 2s / 5s`，默认关闭。
- 选择非关闭项时，前端 `setInterval` 触发；切离页面（unmount 或 Sidebar 切出）时立即清除；KeepAlive 保持时若 `document.visibilityState === 'hidden'` 暂停。
- 刷新过程中保留旧数据，加载指示器用顶部进度条（避免闪烁）。

**理由**：开发场景中端口变化不是秒级实时需求；频繁轮询浪费资源。

### D5：搜索与过滤

**决定**：
- 一个顶部搜索框，`useMemo` 在前端完成过滤：
  - 纯数字输入 → 匹配 `localPort` / `pid`（整数相等 + 子串 contains）。
  - 字符串输入 → 匹配 `processName`（大小写不敏感 contains）+ `exePath`（contains）。
- 协议过滤：Segmented 控件 `ALL / TCP / UDP`。
- 地址族过滤：Segmented 控件 `ALL / v4 / v6`。
- 状态过滤（仅 TCP）：多选下拉 `LISTEN / ESTABLISHED / TIME_WAIT / CLOSE_WAIT / ...`，默认全选。

**理由**：数据量可预期在几千条内，完全足够前端过滤；零延迟。

### D6：浏览器快速打开

**决定**：
- 预定义 HTTP 常见端口白名单：`80, 81, 443, 3000, 3001, 4000, 4200, 5000, 5001, 5173, 5432, 6006, 8000, 8080, 8081, 8888, 9000, 9090`。
- 行末提供"在浏览器打开"图标按钮：当 `protocol === TCP && state === LISTEN && (端口在白名单 || 用户点击)` 时可点。
- 双击整行：若该端口满足可打开条件，调用 `OpenInBrowser("http://127.0.0.1:<port>")`。
- Go 侧实现：`exec.Command("rundll32", "url.dll,FileProtocolHandler", url)` 或 `ShellExecute(..., "open", url, ...)`。

**理由**：在白名单里双击直通最顺手；不在白名单提供手动按钮也行。

### D7：前端交互结构

**决定**：
```
features/ports/
├─ index.tsx           # PortsPage：PageShell + Toolbar + Table
├─ components/
│  ├─ Toolbar.tsx      # 搜索框 + 协议/地址族/状态过滤 + 刷新 + 自动刷新下拉 + 批量 Kill
│  └─ PortTable.tsx    # Antd Table，虚拟滚动（> 500 行时启用）
├─ hooks/
│  └─ usePorts.ts      # 封装 bridge.listPorts + 轮询 + 缓存
└─ types.ts            # PortEntry 等
```

- 表格列：协议、本地、状态、PID、进程名、路径、操作。
- 选择列：多选 → 工具栏"批量 Kill"可点。
- 排序：默认按 `localPort` 升序；所有列可点排序（前端）。
- 密度：`size="small"` 对齐 DevTools 其他表格风格。

### D8：配置持久化

**决定**：`AppConfig` 扩展：
```go
type PortViewerPrefs struct {
    PollInterval int    `json:"pollInterval"` // 0 = off, 2 / 5（秒）
    Protocol     string `json:"protocol"`     // all / tcp / udp
    Family       string `json:"family"`       // all / v4 / v6
    States       []string `json:"states"`     // TCP 状态过滤
}
```
用户偏好跨启动保留。搜索关键字不持久化。

## Risks / Trade-offs

- **[权限不足导致路径读不到]**：某些系统服务（csrss / wininit 等）即使 `PROCESS_QUERY_LIMITED_INFORMATION` 也会拒绝。处理：`processName` 仍能从 `NtQuerySystemInformation` 或 `EnumProcesses + GetModuleBaseNameW` 拿到；`exePath` 显示为 `-`，不影响主要功能。
- **[UAC 频繁打断]**：若用户连点多个 kill 按钮，每个都弹 UAC 会恼人。缓解：
  - 多选批量 kill → 一次 UAC。
  - 多次单项 kill → 在 3 秒内连续点击合并为一次 UAC 请求（延迟 300ms 聚合队列）。
- **[端口表变化快]**：刷新期间用户选择某行发起 kill，PID 可能已变。处理：kill 前 Go 层再读一次 PID 对应的进程名，若不匹配则返回 `"目标进程已不存在"`。
- **[双击误触打开浏览器]**：只有白名单端口 + 双击才开浏览器，其它双击不响应；首次双击时可做一次引导 toast。
- **[非 Windows 平台]**：编译时通过 `//go:build windows` 隔离，非 Windows 平台 `app.go` 给桩方法（直接返回 `ErrUnsupported`）；前端检测到 `bridge.isWindowsOnly("ports") === true` 时，Sidebar 不渲染或渲染禁用态。目前构建仍是 Windows-only，属于未雨绸缪。
- **[批量 kill 的 cmd 行长度限制]**：`cmd.exe` 参数长度上限 8191 字符。极端批量场景（> 500 条）分批。单批默认 200 PID。

## Migration Plan

不涉及数据迁移。首次启动时 `portViewer` 字段不存在 → 用 `defaultConfig` 补全（PollInterval=0，其他默认）。

## Open Questions

- 是否需要"按 PID 快速定位进程的其他端口"→ 点击 PID 列显示该 PID 所有占用端口？建议 **MVP 不做**，后续视反馈加。
- 是否要导出当前列表为 CSV？建议 **MVP 不做**。
