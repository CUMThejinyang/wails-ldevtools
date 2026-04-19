## 1. Go 层：注册表读

- [x] 1.1 新建 `internal/envreg/envreg_windows.go`，定义 `EnvEntry { Name, Value string; Type string; Scope string }`
- [x] 1.2 `ListEnv(scope) ([]EnvEntry, error)`：打开对应注册表 key（`registry.READ`），枚举所有 values；`RegQueryValueExW` 按 `REG_SZ` / `REG_EXPAND_SZ` 分别读
- [x] 1.3 `GetEnv(scope, name) (EnvEntry, error)`：单项读
- [x] 1.4 非 Windows 平台：`envreg_other.go` 桩返回 `ErrUnsupported`
- [ ] 1.5 单元测试：模拟注册表结构（go-registry 有时可 mock 用 subkey）——若无法 mock 就在真实 HKCU 下做冒烟

## 2. Go 层：注册表写

- [x] 2.1 `SetEnvUser(name, value, type) error`：直接写 `HKCU\Environment`，用 `registry.SetStringValue` / `SetExpandStringValue`
- [x] 2.2 `DeleteEnvUser(name) error`：`RegDeleteValueW`
- [x] 2.3 `SetEnvSystemBatch(changes []EnvChange) error`：生成 `.reg` 文件 → `ShellExecuteW runas regedit.exe /s <file>` → 清理临时文件
- [x] 2.4 `.reg` 文件构造器：严格遵循 v5 Unicode 格式（BOM + `Windows Registry Editor Version 5.00`）；值中特殊字符转义
- [x] 2.5 提权失败返回 `ErrUserCancelled`，和 `add-port-viewer` 复用同一错误类型（若并存）

## 3. Go 层：广播

- [x] 3.1 `BroadcastEnvChange() error`：`user32.SendMessageTimeoutW(HWND_BROADCAST=0xFFFF, WM_SETTINGCHANGE=0x1A, 0, "Environment", SMTO_ABORTIFHUNG=2, 5000)`
- [ ] 3.2 忽略错误（记录到 Go 日志），但不向前端抛错

## 4. Go 层：PATH 解析与校验

- [x] 4.1 `ParsePath(scope string) ([]PathSegment, error)`：读取对应 scope 的 `Path`，按 `;` 分段；每段 trim；空段丢弃
- [x] 4.2 `SavePath(scope string, segments []PathSegment) error`：用 `;` 拼接 → `SetEnvUser("Path", joined, origType)` 或进入 HKLM 批写
- [x] 4.3 `ValidatePath(paths []string) []PathValidation`：对每个路径 `os.Stat`（并发 goroutine 池，10 并发），返回 `{ exists, isDir, expandedValue }`
- [x] 4.4 展开 `%VAR%`：`registry.ExpandString` 或手写展开（基于当前 HKCU+HKLM 合并视图）

## 5. Go 层：快照

- [x] 5.1 新建 `internal/envreg/backup.go`，目录 `~/.devtools/env-backup/`
- [x] 5.2 `Snapshot(note string) (BackupMeta, error)`：读取 user + system 全部 entries → 序列化 JSON → 写 `<ts>-<hash>.json`
- [x] 5.3 `ListBackups() ([]BackupMeta, error)`：扫描目录 → 读每个 JSON 的 meta（timestamp、note、entry counts）
- [x] 5.4 `RestoreBackup(id string) error`：
  - 先 `Snapshot("auto-before-restore")`
  - 读目标快照 → diff 当前状态 → 分 user / system
  - user 部分直接写；system 部分走批量 `.reg`（UAC）
  - 调 `BroadcastEnvChange`
- [x] 5.5 每次 `Snapshot` 后若文件 > 10 → 删除最旧
- [x] 5.6 JSON 损坏的文件：`ListBackups` 里标记 `corrupt: true`，前端禁用恢复按钮

## 6. Go 层：导入导出

- [x] 6.1 `ExportEnvFile(scope, outPath) error`：生成 `KEY=VALUE\n`，`%VAR%` 保留原样；value 含特殊字符时双引号包裹
- [x] 6.2 `ImportEnvFile(path, scope) (ImportPreview, error)`：读取 → 按行解析 → 返回 `{ changes: [...], errors: [...] }`，不落盘
- [x] 6.3 `ImportEnvFileCommit(preview ImportPreview, scope) error`：用户确认后实际写入（单项或批量）

## 7. Wails 绑定

- [x] 7.1 `app.go` 新增：`ListEnv`、`GetEnv`、`SetEnv`、`DeleteEnv`、`SaveEnvBatch`
- [x] 7.2 `app.go` 新增：`ParsePath`、`SavePath`、`ValidatePath`
- [x] 7.3 `app.go` 新增：`Snapshot`、`ListBackups`、`RestoreBackup`、`DeleteBackup`
- [x] 7.4 `app.go` 新增：`ExportEnvFile`、`ImportEnvFilePreview`、`ImportEnvFileCommit`
- [x] 7.5 Bridge 契约：所有 UAC 相关方法统一返回 `{ ok: boolean, cancelled?: boolean, error?: string }`，前端据此展示 info / warn / error

## 8. 前端：类型与 bridge

- [x] 8.1 `frontend/src/types/index.ts` 添加：`EnvEntry`、`EnvScope`、`EnvChange`、`PathSegment`、`PathValidation`、`BackupMeta`、`ImportPreview`
- [x] 8.2 `frontend/src/services/bridge.ts` 添加对应方法
- [x] 8.3 `PageId` union 扩展 `'env'`

## 9. 前端：页面骨架与 Tabs

- [x] 9.1 新建 `frontend/src/features/env/index.tsx`：`PageShell` + Antd `Tabs`
- [x] 9.2 Tab：`变量` / `PATH` / `导入/导出` / `快照`
- [x] 9.3 页级 store（useReducer 或轻量 Context）：维护 `pendingChanges` 队列（未保存的修改）
- [x] 9.4 顶部"未保存变更 (N) - 保存 / 放弃"条：有未保存变更时固定显示

## 10. 前端：变量 Tab

- [x] 10.1 `components/VariableTable.tsx`：左右两栏（用户 / 系统），Antd `Table` 显示 `name / value / type / 操作`
- [x] 10.2 搜索框：前端过滤，同时命中 name 或 value
- [x] 10.3 "新增"按钮 → 打开 `VariableEditModal`（name / value / type 推断 + 手动覆盖）
- [x] 10.4 行操作：编辑 / 删除；高危变量删除走二次确认
- [x] 10.5 编辑后不直接写入，而是累积到 `pendingChanges`
- [x] 10.6 系统变量 Column 右上角 🛡 图标 + Tooltip "保存时需管理员权限"

## 11. 前端：PATH Tab

- [ ] 11.1 `components/PathList.tsx`：用 `@dnd-kit/core` 做拖拽列表；按 `scope` 分段展示（"系统路径 X 条 / 用户路径 Y 条"）
- [x] 11.2 `components/PathRow.tsx`：索引 / 路径 / 展开值（小字） / scope 标签 / 状态图标 / 操作（编辑 / 删除）
- [x] 11.3 行状态：✅ 存在+目录 / ❌ 不存在 / ⚠️ 是文件不是目录 / 🔁 重复
- [x] 11.4 工具按钮：新增路径（选 scope）、一键去重、一键校验
- [ ] 11.5 拖拽限制：不允许跨 scope 拖动；UI 给出视觉反馈
- [x] 11.6 修改后累积到 `pendingChanges`

## 12. 前端：保存与 Diff 预览

- [x] 12.1 `components/DiffPreviewModal.tsx`：展示 `pendingChanges` 的 +增 / -删 / ~改
- [x] 12.2 按 scope 分组展示；涉及 system scope 时按钮显示 🛡 图标
- [x] 12.3 确认 → 先调 `Snapshot("pre-save")` → 分别调 user / system 写入 API → 调 `BroadcastEnvChange`
- [x] 12.4 全部成功 → `message.success('已保存，请注意已运行的程序需重启才能读到新值')`
- [ ] 12.5 user 成功 + system 被取消 UAC → `Modal.warning`: "用户变量已保存，系统变量被取消"；`pendingChanges` 清掉 user 部分，保留 system 部分
- [ ] 12.6 任一 user 写入失败 → rollback + 提示（从最近的自动快照恢复）

## 13. 前端：导入 / 导出

- [x] 13.1 `components/ImportExportPanel.tsx`
- [x] 13.2 导出：选 scope → 选保存路径（`bridge.selectSaveFile`）→ 调 `ExportEnvFile`
- [x] 13.3 导入：选文件 → 选目标 scope → 调 `ImportEnvFilePreview` → 复用 `DiffPreviewModal` 展示 → 确认 → `ImportEnvFileCommit` + Snapshot + Broadcast
- [x] 13.4 解析错误的行在预览里红色列出但允许继续（跳过错误行）

## 14. 前端：快照

- [x] 14.1 `components/BackupList.tsx`：列表展示 `时间 / 备注 / 用户变量数 / 系统变量数`
- [x] 14.2 "恢复"按钮 → 先展示"当前 vs 快照" diff → 确认 → 走写入流程（含 UAC）
- [x] 14.3 "删除"按钮：二次确认后调 `DeleteBackup`
- [x] 14.4 手动触发快照按钮（顶部）：输入可选 note → 调 `Snapshot`

## 15. 前端：Sidebar 与路由

- [x] 15.1 `Sidebar.tsx` 的 `NAV_ITEMS` 增加 `env` 项（图标：`FunctionOutlined` 或自绘 `$PATH`）
- [x] 15.2 `App.tsx` 增加 `<KeepAlive id="env"><EnvPage /></KeepAlive>` 槽位

## 16. 视觉与验证

- [ ] 16.1 视觉走查：表格密度、diff Modal 红绿色彩与主题一致、状态图标
- [ ] 16.2 冒烟用例：
  - 打开页面列出几十条变量，搜索能过滤
  - 新增用户变量 → 保存 → 新 cmd 中 `echo %VAR%` 能读到
  - 改 `Path`（用户）添加一行 → 新 cmd 中 `path` 包含
  - 改系统变量 → 弹 UAC → 接受后生效，取消则不变
  - 删一条变量 → 快照列表出现新条 → 恢复能还原
  - 导出 → 编辑后导入 → diff 展示清晰 → 确认生效
- [ ] 16.3 `%SystemRoot%` 这种 `REG_EXPAND_SZ` 的变量改值 → 保持类型（不降级为 `REG_SZ`）

## 17. 文档

- [ ] 17.1 `README.md` 功能列表添加一行
- [ ] 17.2 `CLAUDE.md` 架构章节补 `internal/envreg`、`features/env` 说明
- [ ] 17.3 保存后 Alert 文案确认：提醒"需重启已运行程序"
