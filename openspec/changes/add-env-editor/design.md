## Context

Windows 的环境变量存储在注册表两个位置：

- **用户变量**：`HKCU\Environment`
- **系统变量**：`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`

进程在启动时会把这两个合并成一份快照注入 `CreateProcess` 的环境块，之后运行期 `os.Environ()` / `os.Getenv` 看到的是**快照**而非注册表当前值。因此工具必须：

1. 直接读写**注册表**而非用 Go 的 `os` 包（否则重启应用才能看到修改结果）。
2. 修改后广播 `WM_SETTINGCHANGE` 告诉 Explorer / 其它响应该消息的进程重新加载环境（已运行的进程——包括本 DevTools 自身——仍然看旧值，这是 Windows 平台固有行为）。
3. 对 `HKLM` 的写入需要管理员权限，必须有 UAC 提权路径。

同时环境变量值有两种类型（和注册表 VT 强相关）：
- `REG_SZ`：静态字符串。
- `REG_EXPAND_SZ`：字符串中的 `%VAR%` 在被使用时才展开。

类型必须被**保留**——把 `REG_EXPAND_SZ` 降级为 `REG_SZ` 会让 `%SystemRoot%\System32` 这种值失效。

这是本项目第一个做"**破坏性系统修改**"的模块，所以快照 / 回滚 / 预览这一套护栏尤为关键。

## Goals / Non-Goals

**Goals:**
- 让"查找某个变量"、"改某个变量"、"在 PATH 里加一行"这种日常操作变得**一步到位**，比原生面板省 80% 点击。
- PATH 可视化 + 行内校验（路径是否存在 / 是否目录 / 是否重复）是核心卖点。
- 所有写入都有预览 + 快照 + 回滚三重兜底。
- 导入导出 `.env` 方便在机器间 / 新环境迁移。
- UAC 只在保存 HKLM 时弹一次，不整体提权。

**Non-Goals:**
- 不做"变量引用解析"：如果值是 `%USERPROFILE%\work`，展示原文，不做展开预览（可选作为 Phase 2）。
- 不监听注册表实时变化：打开页面即读，保存即广播；**不做** RegNotifyChangeKeyValue 监听。
- 不做进程级临时变量（`set FOO=bar` 风格），只改持久化的注册表值。
- 不支持 `HKEY_CURRENT_CONFIG` / `HKEY_USERS\<SID>\Environment` 等边缘路径。
- 不跨平台：非 Windows 平台整个模块隐藏。

## Decisions

### D1：只走注册表 API，不用 `os.Setenv`

**决定**：Go 层全部通过 `golang.org/x/sys/windows/registry` 读写。

**理由**：
- `os.Setenv` 改的是**当前进程**环境块，对注册表零影响，重启应用就没了。
- 注册表 API 是 Windows 平台上环境变量的**唯一权威源**。

**踩坑预防**：
- 打开 `HKLM` 用 `registry.READ` 足够（读不需要管理员）；写入必须走提权子进程。
- 值名大小写不敏感；同名 `Path` / `path` 在注册表里是同一个 key。

### D2：类型保留与自动推断

**决定**：
- 读取时把 `REG_SZ` / `REG_EXPAND_SZ` 透传为 `EnvEntry.Type = "sz" | "expand_sz"`。
- 保存已有变量：保持原 type 不变。
- 新建变量：值中包含 `%...%` 形式的占位 → 默认 `REG_EXPAND_SZ`，否则 `REG_SZ`；UI 提供"高级"开关允许用户手动选。
- 前端编辑面板展示 type 标签（只读），避免用户误改破坏旧值。

**理由**：类型选错代价大（`%SystemRoot%` 不展开会让很多系统路径失效），默认行为必须正确。

### D3：广播生效

**决定**：每次保存完成后调用：
```
SendMessageTimeoutW(
  HWND_BROADCAST, WM_SETTINGCHANGE, 0,
  lParam="Environment", SMTO_ABORTIFHUNG, 5000ms
)
```
失败（超时或错误）→ 忽略（Windows 平台上该调用有时会卡顿但不影响注册表已写入）；前端仍显示"已保存"。

**重要提示**：保存后弹一个持久的 `Alert`：
> "已保存。已运行的进程（包括 DevTools 本身）需要重启才能看到新值；Explorer / cmd 新开的窗口会自动加载新值。"

**理由**：这是 Windows 固有行为，用户必须被告知一次；否则看不到自己的修改会困惑。

### D4：系统变量 UAC 提权策略

**决定**：
- 读 HKLM：普通用户即可读，直接读。
- 写 HKLM：构造一个 `reg.exe` 命令，通过 `ShellExecuteW` + `runas` 弹 UAC 执行。
- 单次保存可能涉及 N 条变量变更 → 汇总成**一个批处理临时文件**（`.reg` 格式），用 `regedit.exe /s <file>` 一次性导入，`.reg` 文件在 UAC 完成后立即删除。
- 删除变量：`reg.exe delete "HKLM\..." /v <name> /f`，可以和上面的批文件合并。
- 取消 UAC → 返回 `ErrUserCancelled` → 前端 `message.info('已取消保存')`，此次变更**不应用**，不触发广播。

**理由**：
- 用 `.reg` 文件比拼 n 条 `reg add` 命令稳定（参数转义复杂，`.reg` 有标准格式）。
- 一次 UAC 搞定所有批次，体验到位。

**替代方案**：
- 临时提权自身进程：代价大且危险。弃用。
- 每条变量一次 `reg add` + 一次 UAC：用户恼怒。弃用。

**安全注意**：
- `.reg` 文件写入到 `%TEMP%\devtools-env-<rand>.reg`，文件内容只包含本次变更 keys。
- 使用后立即删除（defer），即便 regedit 失败也删。
- 文件内容中的值做标准 `.reg` 转义（反斜杠、引号、控制字符）。

### D5：PATH 可视化独立 Tab

**决定**：PATH 单独一页（Tab 之一），而非"选中 PATH 变量时展开"。数据模型：

```go
type PathSegment struct {
    Raw       string   // 原始值
    Expanded  string   // 展开 %VAR% 后（可选）
    Scope     string   // "user" | "system"
    Exists    bool     // 文件系统 stat
    IsDir     bool
    DuplicateOf int    // -1 不重复，否则指向首次出现的 index
}
```

- 合并视图：先排系统 PATH，再用户 PATH（Windows 拼接顺序即系统在前），`type Segment { scope: "system" | "user" }` 区分。
- 保存时分别写回 HKLM 和 HKCU（按 scope 分桶）。
- 拖拽排序：只能在同 scope 内互调，不能把用户路径拖到系统里（避免权限意外）。
- 标记重复：相同 `Raw`（大小写不敏感，Windows 规则）的行，第 2+ 次出现用灰色打 "重复"。
- 校验：`os.Stat(expanded)`，主线程内并发（前端收集后批量 `bridge.validatePath(paths)`）。
- "一键去重"按钮：只移除第 2+ 次出现的行，不动第一次。
- 手动新增：弹输入框 + 选择 scope；新增的放到对应 scope 末尾。

### D6：快照与撤销

**决定**：
- 目录：`~/.devtools/env-backup/`。
- 文件：`<unix-timestamp>-<short-scope>.json`。
- 内容：`{ timestamp, note?, user: [...], system: [...] }`，完整快照两个 scope。
- 触发时机：**每一次成功写回之前**创建一份（无论单项编辑、PATH 重排、导入）。
- 保留：按时间戳倒序，超过 10 份时自动删最旧。
- 恢复入口：`env-editor` 页的 Tab "快照"，列表显示时间 / 备注 / 差异数；"恢复"按钮：
  - 先生成一份"当前状态"快照（让 undo 本身也能 redo）。
  - 然后把选中快照分别写回 HKCU 与 HKLM；HKLM 部分仍走 UAC。
  - 完成后广播 + 刷新 UI。
- 快照文件格式保留 `Type` 字段，恢复时类型准确。

**理由**：环境变量修改是**不可直接 ctrl-z** 的系统级操作，必须有专门的撤销通道。

### D7：导入 / 导出 `.env`

**决定**：
- 导出：生成纯文本 `KEY=VALUE\n`，`REG_EXPAND_SZ` 保留原始 `%...%` 形式，不展开；值中含 `\n` / `"` 的做双引号包裹 + 转义。
- 导入：
  - 用户选 `.env` 文件 + 目标 scope（用户/系统）。
  - 解析 → 生成 diff（新增 / 覆盖 / 无变化 / 值被引用但变量不存在？仅警告）。
  - **先预览**（统一走 D8 的 diff 预览）再写入。
  - 导入不支持覆盖类型（`REG_SZ` vs `REG_EXPAND_SZ`），按 D2 自动推断；若被导入变量原本已存在，**保留原类型**。

### D8：保存前 diff 预览

**决定**：任何写入前（单项编辑、PATH 重排、导入、快照恢复）都弹一个 `Modal`：
- 左侧列变量名；
- 右侧红绿 diff：`+ 新值 / - 旧值 / ~ 改动`；
- 底部 "取消 / 保存"；
- 涉及 HKLM 时按钮带 `🛡` 图标提示将弹 UAC。

**理由**：写入不可即时回滚；让用户最后看一眼是最简单有效的护栏。

### D9：高危变量保护

**决定**：预置保护列表：
```
Path, PATHEXT, TEMP, TMP, ComSpec, windir, SystemRoot,
USERPROFILE, APPDATA, LOCALAPPDATA, ProgramFiles,
ProgramFiles(x86), ProgramData, NUMBER_OF_PROCESSORS
```
- 删除这些变量 → 二次确认（文字输入 "DELETE" 才能激活按钮）。
- 清空值 → 二次确认（同上）。
- 正常编辑（改值）→ 走普通 diff 预览，不额外二确（频率太高会烦）。

### D10：前端结构

```
features/env/
├─ index.tsx                   # EnvPage：PageShell + Tabs
├─ components/
│  ├─ VariableTable.tsx        # 用户/系统变量表
│  ├─ VariableEditModal.tsx    # 新增/编辑单项
│  ├─ PathList.tsx             # PATH 拖拽列表
│  ├─ PathRow.tsx              # 单行（状态、来源、操作）
│  ├─ DiffPreviewModal.tsx     # 保存前 diff 预览
│  ├─ BackupList.tsx           # 快照列表
│  └─ ImportExportPanel.tsx    # .env 导入导出
├─ hooks/
│  ├─ useEnvData.ts            # 变量加载 / 刷新
│  └─ usePathEditor.ts         # PATH 编辑状态机
└─ types.ts
```

Tab 结构：
- `变量` - 左右两列 VariableTable
- `PATH` - PathList
- `导入/导出`
- `快照`

## Risks / Trade-offs

- **[误删 PATH 灾难性]** → 高危变量保护 + 快照 + 预览 diff，三重兜底。用户故意清空 PATH 需要输入 "DELETE"。
- **[类型错误导致 %VAR% 不展开]** → D2 类型保留机制 + UI 明确展示当前类型。
- **[HKLM 保存一半失败]** → 用 `.reg` 文件 + `regedit /s` 原子导入；要么整体成功要么整体失败（regedit 是事务性导入）。失败 → 快照未触发实际写入，再次重试即可。
- **[广播失败]** → 注册表已写入，只是 Explorer 没收到通知；新开 cmd 仍然会读到新值。前端在保存成功 Alert 里统一提示"可能需要重启已运行程序"。
- **[`.env` 解析歧义]** → 严格使用简化语法：`KEY=VALUE`，`#` 开头为注释；不支持 shell 变量插值 / 多行值（Phase 2 可加）。不支持的行 → 导入预览里标红并跳过。
- **[拖拽性能]** → PATH 条目数通常 < 100；`@dnd-kit` 零问题。
- **[系统变量权限不足时的错误处理]** → HKLM 写失败（ERROR_ACCESS_DENIED）→ 前端提示"请以管理员权限重试"；这种情况理论上被 D4 的 UAC 流程兜住，属于防御性处理。
- **[快照文件损坏]** → 恢复前先 JSON 解析，格式错误 → 列表中标红不可点；单独一份损坏不影响其它快照。
- **[大量并发路径校验慢]** → 前端 `useEffect` 里把路径校验拆批调用，每批 20 条；Go 层内部 goroutine 并发 stat。

## Migration Plan

无老数据迁移。首次使用时 `~/.devtools/env-backup/` 目录自动创建。

## Open Questions

- "保存即广播" vs "编辑暂存 + 手动点保存" 的粒度？→ **手动保存**（累积多项变更到一个 diff 预览 → 一次写入 + 一次广播 + 一次 UAC）。
- 快照是否需要"命名"？→ 支持可选 `note` 字段，用户恢复时更容易识别。
- 是否展示 `%VAR%` 展开预览？→ MVP 不做；Phase 2 可在编辑 Modal 里加 "展开后" 只读字段。
