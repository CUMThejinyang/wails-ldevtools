## Why

Windows 自带的"环境变量"面板（`sysdm.cpl` → 高级 → 环境变量）体验陈旧：窗口小、不能搜索、不能批量修改、PATH 编辑框可视化差、删除一行后无法撤销、系统变量与用户变量割裂。开发者维护十几条 PATH、几十个环境变量是常态，这个面板已经成为 Windows 日常开发的痛点之一。DevTools 有桌面原生能力 + 已有的"可视化 + 持久化"基础设施，做一个比原生面板好用数倍的环境变量编辑器是显然的高价值模块。

## What Changes

- 新增 `env-editor` 模块：侧边栏入口；进入后分左右两列展示 **用户变量 (HKCU)** 与 **系统变量 (HKLM)**，各自可增删改查；支持搜索（按变量名或值）。
- 注册表读写：**不使用 `os.Getenv/Setenv`**（读的是进程启动快照），全部走 Windows Registry API（`RegOpenKeyExW` / `RegQueryValueExW` / `RegSetValueExW`）。
- 类型保留：`REG_SZ` / `REG_EXPAND_SZ` 透传；保存时保持原类型；新增时根据值是否包含 `%...%` 变量占位自动推断（可手动覆盖）。
- 立即生效广播：每次保存后调用 `SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment", SMTO_ABORTIFHUNG, 5000)`，让 Explorer / 其它进程感知变更（已运行进程仍需重启）。
- 系统变量编辑按需提权：本应用不整体提权；每次保存"系统变量"时通过 `ShellExecuteW` + `reg.exe` 以 `runas` 弹 UAC，只一次。
- **PATH 可视化独立 Tab**：合并展示用户 + 系统 PATH 两段，每行显示：序号、路径、来源（用户/系统）、验证状态（✅ 存在 / ❌ 不存在 / ⚠️ 非目录）、重复标记；支持拖拽排序、单行删除、批量去重、手动新增、原位编辑。
- 快照与撤销：每次写操作前，把当前所有变量快照保存到 `~/.devtools/env-backup/<timestamp>.json`，最多保留 10 份；支持一键回滚到任意一份。
- `.env` 风格导入 / 导出：支持把用户或系统变量导出为 `KEY=VALUE` 纯文本；支持选择 `.env` 文件导入（预览 diff 后再写入）。
- 高危变量保护：`Path` / `PATHEXT` / `TEMP` / `TMP` / `ComSpec` / `windir` / `SystemRoot` / `USERPROFILE` / `APPDATA` 标记"高危"，删除或清空时二次确认。
- 保存前 diff 预览：无论是单项编辑、PATH 重排、还是导入，都在保存前弹出"变更预览"Modal，展示 +增 / -删 / ~改 三色 diff，确认后才落盘。

## Capabilities

### New Capabilities
- `env-editor`：Windows 环境变量可视化与编辑能力，覆盖读、写、PATH 可视化、快照回滚、导入导出、UAC 提权、广播生效、diff 预览。

## Impact

- **新增 Go 模块**：`internal/envreg/`（注册表读写 + 广播 + 快照）、`internal/procutil/` 复用（UAC 提权 ShellExecute，若 `add-port-viewer` 先合则共用）。
- **`app.go` 新方法**：`ListEnv(scope) → []EnvEntry`、`GetEnv(scope, name) → EnvEntry`、`SetEnv(scope, name, value, type) → error`、`DeleteEnv(scope, name) → error`、`ParsePath(scope) → []PathSegment`、`SavePath(scope, segments) → error`、`ValidatePath(paths) → []PathValidation`、`ImportEnvFile(path, scope) → diff`、`ExportEnvFile(scope, path) → error`、`ListBackups() → []BackupMeta`、`RestoreBackup(id) → error`。
- **新增事件**：无强依赖；Go 层若要显示"已广播"可走 `EventsEmit`，MVP 不做。
- **新增前端模块**：`frontend/src/features/env/`（模块入口 + 变量表 Tab + PATH 可视化 Tab + 快照 Tab + 导入导出）。
- **Sidebar**：新增图标入口 `env`，`PageId` union 扩展。
- **配置**：无 `config.json` 字段变更（偏好极少，可以不持久化）。
- **依赖新增**：Go 侧 `golang.org/x/sys/windows/registry`。前端新增 `react-dnd` 或 `@dnd-kit/core`（PATH 拖拽排序用；倾向 `@dnd-kit/core` 更轻）。
- **备份目录**：`~/.devtools/env-backup/` 新建；单个快照 ~50KB，上限 10 份 / ~500KB。
