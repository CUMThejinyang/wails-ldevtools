## 1. Go 层：端口枚举

- [x] 1.1 新建 `internal/netstat/netstat_windows.go`，声明 `PortEntry` 结构：`{ Protocol, Family, LocalAddr, LocalPort, RemoteAddr, RemotePort, State, PID uint32 }`
- [x] 1.2 封装 `getExtendedTcpTable(family int) ([]TcpRow, error)`，两次调用模式（查 size → 分配 → 填）
- [x] 1.3 封装 `getExtendedUdpTable(family int) ([]UdpRow, error)`
- [x] 1.4 把 v4 + v6、TCP + UDP 结果合并为 `[]PortEntry`，IP 字节序转可读字符串
- [x] 1.5 状态枚举映射：`MIB_TCP_STATE_LISTEN` 等 → `"LISTEN"` / `"ESTABLISHED"` 等常量
- [x] 1.6 新建 `internal/netstat/netstat_other.go`（`//go:build !windows`），所有方法返回 `ErrUnsupported`

## 2. Go 层：进程信息

- [x] 2.1 新建 `internal/procutil/procinfo_windows.go`，`ProcessInfo { Name, ExePath string; PID uint32 }`
- [x] 2.2 `QueryProcessInfo(pid uint32) ProcessInfo`：`OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)` + `QueryFullProcessImageNameW`
- [x] 2.3 路径格式转换：若是 `\Device\Harddisk...` 形式 → 映射为盘符形式（通过 `QueryDosDeviceW` 构建映射表，启动时缓存）
- [x] 2.4 失败时返回占位（System PID 0/4 预定义名）；不返回 error
- [x] 2.5 `EnrichPorts(entries []PortEntry) []PortEntryWithProc`：迭代时用 `map[uint32]ProcessInfo` 缓存，同 PID 仅查一次

## 3. Go 层：Kill 与提权

- [x] 3.1 新建 `internal/procutil/kill_windows.go`
- [x] 3.2 `IsElevated() bool`：调 `shell32.IsUserAnAdmin` 或检查当前 Token 的 `TokenElevation`
- [x] 3.3 `KillProcess(pid uint32) error`：`isElevated` → 直接 `TerminateProcess` 或 `os.Process.Kill`；否则 `shellExecuteRunas("taskkill.exe", "/F /PID <pid>")`
- [x] 3.4 `KillProcesses(pids []uint32) error`：批量拼接命令，走 `cmd.exe /c taskkill /F /PID ... /PID ...`；分批 200 一组
- [x] 3.5 `ShellExecuteRunas` 包装：判断返回值 ≤ 32 为失败；`ERROR_CANCELLED (1223)` → 返回 `ErrUserCancelled`
- [x] 3.6 `OpenInBrowser(url string) error`：`ShellExecute` 调系统默认浏览器

## 4. Wails 绑定

- [x] 4.1 `app.go` 新增 `ListPorts(filter PortFilter) ([]PortEntryWithProc, error)`：直接返回聚合结果
- [x] 4.2 `app.go` 新增 `KillProcess(pid uint32) error` / `KillProcesses(pids []uint32) error`
- [x] 4.3 `app.go` 新增 `IsElevated() bool`
- [x] 4.4 `app.go` 新增 `OpenInBrowser(url string) error`
- [x] 4.5 `app.go` 新增 `GetPortViewerPrefs` / `SavePortViewerPrefs`
- [x] 4.6 `AppConfig` 添加 `PortViewer PortViewerPrefs` 字段；`defaultConfig()` 补 MVP 默认值

## 5. 前端：类型与 bridge

- [x] 5.1 `frontend/src/types/index.ts` 添加 `PortEntry` / `PortViewerPrefs` 类型
- [x] 5.2 `frontend/src/services/bridge.ts` 添加：`listPorts`、`killProcess`、`killProcesses`、`isElevated`、`openInBrowser`、`getPortViewerPrefs`、`savePortViewerPrefs`
- [x] 5.3 `frontend/src/types/index.ts` 的 `PageId` union 扩展 `'ports'`

## 6. 前端：页面骨架

- [x] 6.1 新建 `frontend/src/features/ports/index.tsx`：`PageShell` + `<Toolbar />` + `<PortTable />`
- [x] 6.2 新建 `frontend/src/features/ports/hooks/usePorts.ts`：`{ data, loading, error, refresh, setPolling(interval) }`
- [x] 6.3 轮询逻辑：`useEffect` + `setInterval`；`document.visibilityState` 变化时暂停/恢复；切出页面清除
- [x] 6.4 首次加载 + 每次显式刷新：显示顶部进度条，不清空旧数据

## 7. 前端：工具栏

- [x] 7.1 新建 `frontend/src/features/ports/components/Toolbar.tsx`
- [x] 7.2 搜索框：Antd `Input.Search`，受控 `keyword`；纯数字走端口/PID、字符串走进程名/路径
- [x] 7.3 协议过滤：`Segmented` `['ALL','TCP','UDP']`
- [x] 7.4 地址族过滤：`Segmented` `['ALL','v4','v6']`
- [x] 7.5 TCP 状态过滤：Antd `Select mode='multiple'`，默认全选
- [x] 7.6 刷新按钮 + 自动刷新下拉：`Select` `关闭/2s/5s`
- [x] 7.7 批量 Kill 按钮：仅在有选中行时可点；点击弹确认框（显示即将 kill 的 PID 列表 + 进程名）
- [x] 7.8 `isElevated` 为 `true` 时工具栏右侧显示 `🛡 管理员模式` 标签（减少 UAC 预期）

## 8. 前端：表格

- [x] 8.1 新建 `frontend/src/features/ports/components/PortTable.tsx`
- [x] 8.2 列定义：协议、本地、状态、远程（TCP 有值时）、PID、进程名、路径、操作
- [x] 8.3 行 Key：`${protocol}-${family}-${localAddr}:${localPort}-${pid}`
- [x] 8.4 多选列：`rowSelection`，受控 `selectedRowKeys`
- [x] 8.5 每列可点排序；默认按 `localPort` 升序
- [x] 8.6 当数据量 > 500 行启用 Antd `virtual` 虚拟滚动
- [x] 8.7 操作列按钮：
  - 🌐 仅当端口在白名单 && 状态 LISTEN 时可点 → `openInBrowser`
  - ⛔ Kill 单项 → 确认框 → 调用 `killProcess(pid)`
- [x] 8.8 行双击：若白名单 + LISTEN → 调用 `openInBrowser`，否则无响应

## 9. 前端：Sidebar 与路由

- [x] 9.1 `frontend/src/components/nav/Sidebar.tsx` 的 `NAV_ITEMS` 增加 `ports` 项（图标：`ApiOutlined` 或自绘）
- [x] 9.2 `frontend/src/App.tsx` 增加 `<KeepAlive id="ports"><PortsPage /></KeepAlive>` 槽位
- [x] 9.3 `frontend/src/types/index.ts` 的 `PageId` union 增加 `'ports'`

## 10. 错误与反馈

- [x] 10.1 `ErrUserCancelled` → 前端 `message.info('已取消权限请求')`（非错误红色）
- [x] 10.2 `KillProcess` 失败（非取消） → `message.error(errorMsg)`；自动刷新一次列表
- [x] 10.3 `ListPorts` 失败 → 页面顶部 `Alert type="error"`，保留上一次结果
- [x] 10.4 批量 kill 中某几个 PID 已不存在 → 显示 `N 成功 / M 失败`，失败列表 Popover 展开

## 11. 视觉与验证

- [x] 11.1 视觉走查：列对齐、状态 `StatusTag` 颜色（LISTEN 绿 / ESTABLISHED 蓝 / TIME_WAIT 灰）、密度与其他模块一致
- [x] 11.2 冒烟用例：
  - 打开页面看到至少数十条端口（一定有系统服务）
  - 搜索 `8080` 能过滤到对应端口
  - 搜索 `chrome` 能过滤到 Chrome 相关
  - kill 非管理员可见的用户进程，无 UAC 成功
  - kill 系统进程弹 UAC → 接受后进程消失，列表刷新
  - 双击 8080 端口（如本地有 dev server）能打开浏览器
- [x] 11.3 断网 / 无 TCP 连接场景：仍能看到 UDP 与 LISTEN，页面不空白

## 12. 文档

- [x] 12.1 `README.md` 功能列表添加一行
- [x] 12.2 `CLAUDE.md` 的架构章节增补 `internal/netstat`、`internal/procutil`、`features/ports` 说明
