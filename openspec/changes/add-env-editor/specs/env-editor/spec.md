## ADDED Requirements

### Requirement: 注册表读

系统 MUST 通过 Windows 注册表 API 直接读取环境变量，禁止通过 `os.Getenv` / `os.Environ`。用户变量源为 `HKCU\Environment`，系统变量源为 `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`。每条 `EnvEntry` 必须包含 `name`、`value`、`type`（`sz` 或 `expand_sz`）、`scope`（`user` 或 `system`）。

#### Scenario: 列出用户变量
- **WHEN** 调用 `bridge.listEnv('user')`
- **THEN** 返回数组，包含 HKCU\Environment 下所有 values
- **AND** 每项的 `type` 为 `sz` 或 `expand_sz`

#### Scenario: 列出系统变量（非管理员）
- **WHEN** 普通用户调用 `bridge.listEnv('system')`
- **THEN** 读取成功（读 HKLM 不需要管理员）
- **AND** 返回系统变量数组

#### Scenario: 类型保留
- **GIVEN** 系统中存在 `SystemRoot = C:\Windows`（`REG_EXPAND_SZ`）
- **WHEN** 调用 `ListEnv('system')`
- **THEN** 返回的 entry `type === 'expand_sz'`

### Requirement: 单项与批量写入

系统 SHALL 支持单项 / 批量写入环境变量。写 HKCU 直接通过 `registry.SetStringValue` / `SetExpandStringValue`；写 HKLM MUST 通过 `ShellExecuteW` 以 `runas` 动词拉起 `regedit.exe /s <reg_file>` 完成，`.reg` 文件在执行完毕后 MUST 立即删除。保存已有变量 MUST 保留原 type；新增变量 SHALL 根据值是否包含 `%...%` 占位自动推断 type，并允许用户手动覆盖。

#### Scenario: 修改用户变量值
- **GIVEN** 存在用户变量 `GOPATH=D:\go`
- **WHEN** 用户在 UI 中改为 `D:\go-new`，经 diff 预览后确认保存
- **THEN** 注册表 `HKCU\Environment\GOPATH` 值被更新
- **AND** type 保持为 `REG_SZ`

#### Scenario: 批量系统变量写入
- **GIVEN** 用户积累了 3 条系统变量修改
- **WHEN** 点击"保存"
- **THEN** 系统生成一个 `.reg` 文件包含 3 条变更
- **AND** 弹出 **一次** UAC
- **AND** 用户确认后 3 条全部写入

#### Scenario: 新增变量自动推断 type
- **WHEN** 用户新增 `LOGDIR = %USERPROFILE%\logs`
- **THEN** 默认 type 被推断为 `expand_sz`
- **AND** 编辑 Modal 展示类型标签（允许手动改为 `sz`）

#### Scenario: UAC 取消
- **WHEN** 系统变量保存时用户在 UAC 对话框点击"否"
- **THEN** `.reg` 文件被清理
- **AND** 前端显示 `message.info('已取消保存')`
- **AND** 未应用的变更保留在 `pendingChanges`，用户可重试或放弃

### Requirement: 变更广播

每次环境变量写入成功后，系统 MUST 调用 `SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment", SMTO_ABORTIFHUNG, 5000)`。广播失败时 SHALL 忽略错误（写入仍然有效），但前端 MUST 在保存成功提示中告知"已运行的进程需重启"。

#### Scenario: 保存后广播生效
- **WHEN** 写入注册表成功
- **THEN** 程序调用一次 `WM_SETTINGCHANGE` 广播
- **AND** 前端显示 Alert "已保存，已运行程序需重启才能读到新值"

#### Scenario: 广播超时
- **WHEN** 某个进程卡住导致广播超时
- **THEN** 写入仍然视作成功
- **AND** 不向前端抛错

### Requirement: PATH 可视化独立 Tab

系统 MUST 将 PATH 编辑作为独立 Tab 提供。页面 SHALL 合并展示系统 + 用户 PATH 两段，顺序与 Windows 实际解析一致（系统在前、用户在后）。每行 MUST 展示：序号、原始路径、展开后路径（若包含 `%VAR%`）、scope 来源（system / user）、校验状态（存在 / 不存在 / 非目录）、是否重复。

#### Scenario: 打开 PATH Tab
- **WHEN** 用户切到 `PATH` Tab
- **THEN** 列表按顺序展示系统 PATH 所有段，再展示用户 PATH 所有段
- **AND** 每段 scope 标签正确

#### Scenario: 校验不存在路径
- **GIVEN** PATH 中存在 `D:\OldTool\bin`，该目录已删除
- **WHEN** 自动校验完成
- **THEN** 该行显示 ❌ 图标
- **AND** Tooltip 提示"路径不存在"

#### Scenario: 标记重复路径
- **GIVEN** PATH 中存在两个 `C:\Go\bin`
- **WHEN** 列表渲染
- **THEN** 第二个 `C:\Go\bin` 行标记 🔁 "重复"（灰色）

#### Scenario: 拖拽排序
- **WHEN** 用户把系统段内第 3 行拖到第 1 行位置
- **THEN** 列表中该行顺序变化
- **AND** 修改被记入 `pendingChanges`，未立即写入

#### Scenario: 禁止跨 scope 拖动
- **WHEN** 用户尝试把用户段的一行拖到系统段中
- **THEN** 拖拽被拒绝（视觉反馈明显）
- **AND** 列表顺序不变

#### Scenario: 一键去重
- **GIVEN** PATH 中存在重复条目
- **WHEN** 用户点击"去重"按钮
- **THEN** 第二次及以后出现的重复项从对应 scope 中移除
- **AND** 变更记入 `pendingChanges`

### Requirement: 保存前 Diff 预览

任何环境变量写入操作（单项保存、批量保存、导入、快照恢复）MUST 先弹出 `DiffPreviewModal`，展示 +增 / -删 / ~改 三种变更；涉及 HKLM 的变更 MUST 在确认按钮显示 🛡 图标提示 UAC。用户取消 Modal 时 SHALL NOT 写入注册表，不触发快照，不触发广播。

#### Scenario: 含用户 + 系统混合变更
- **GIVEN** `pendingChanges` 包含 2 条用户变量 + 1 条系统变量
- **WHEN** 用户点击顶部"保存"
- **THEN** Modal 分组展示 "用户变量 (2)" / "系统变量 (1)"
- **AND** 确认按钮显示 🛡
- **AND** 确认后先写入用户（无 UAC），再弹 1 次 UAC 写入系统

#### Scenario: 取消 Modal
- **WHEN** 用户在 Diff Modal 点 "取消"
- **THEN** 注册表未被修改
- **AND** `pendingChanges` 保留供继续编辑

### Requirement: 快照与回滚

系统 SHALL 在每次成功写入之前自动创建一份完整快照，目录 `~/.devtools/env-backup/`，文件命名 `<unix-timestamp>.json`。系统 MUST 只保留最近 10 份快照，超出自动删除最旧。快照内容 MUST 为完整的 user + system entries 列表（包含 type 字段）。用户 SHALL 能从"快照"Tab 查看列表并恢复到任一快照。恢复操作本身 MUST 先创建一份"auto-before-restore"快照（让 undo 本身可 redo）。

#### Scenario: 保存时自动创建快照
- **WHEN** 用户点击保存并确认 Diff
- **THEN** `~/.devtools/env-backup/` 中新增一份 JSON 快照
- **AND** 然后才开始写入注册表

#### Scenario: 查看快照列表
- **WHEN** 用户切到"快照"Tab
- **THEN** 展示最新 10 条，按时间倒序
- **AND** 每条显示时间、可选备注、用户变量数、系统变量数

#### Scenario: 恢复快照
- **WHEN** 用户选择某快照点"恢复"
- **THEN** 先创建一份 "auto-before-restore" 快照
- **AND** 然后以该快照内容为目标，生成 diff 并走正常 Diff Preview + UAC 流程
- **AND** 成功后广播 WM_SETTINGCHANGE

#### Scenario: 快照文件损坏
- **WHEN** 某份 JSON 解析失败
- **THEN** 列表中该项标红，`恢复` 按钮禁用
- **AND** 不影响其它快照使用

#### Scenario: 超过 10 份自动清理
- **GIVEN** 目录中已有 10 份快照
- **WHEN** 新建第 11 份
- **THEN** 最旧一份被删除

### Requirement: `.env` 导入导出

系统 SHALL 支持将 scope 中全部变量导出为 `KEY=VALUE\n` 纯文本文件；系统 SHALL 支持从 `.env` 文件导入到指定 scope。导入 MUST 先生成预览（走 Diff Preview）再写入，不允许直接覆盖。解析失败的行 MUST 在预览里标红列出，用户可选择"跳过错误行继续"或"取消"。

#### Scenario: 导出用户变量
- **WHEN** 用户选择导出用户变量到 `D:\backup.env`
- **THEN** 生成的文件包含所有用户变量
- **AND** `REG_EXPAND_SZ` 值保留原始 `%VAR%` 形式未展开
- **AND** 含特殊字符的值用双引号包裹

#### Scenario: 导入预览
- **WHEN** 用户选择 `.env` 文件并指定导入到用户 scope
- **THEN** 弹出 Diff Preview Modal 展示"将新增 N 条 / 将覆盖 M 条 / K 行无效"
- **AND** 用户确认后才实际写入

#### Scenario: 导入含非法行
- **GIVEN** 文件含 1 行 `NO_EQUAL_SIGN` 无等号
- **WHEN** 导入预览
- **THEN** 该行在预览里红色列出，标注"语法错误"
- **AND** 确认后跳过该行，其它行正常写入

### Requirement: 高危变量保护

系统 MUST 维护高危变量列表：`Path, PATHEXT, TEMP, TMP, ComSpec, windir, SystemRoot, USERPROFILE, APPDATA, LOCALAPPDATA, ProgramFiles, ProgramFiles(x86), ProgramData, NUMBER_OF_PROCESSORS`。删除这些变量或将其值置空时 MUST 二次确认（要求用户在输入框中输入 `DELETE` 才能激活确认按钮）。普通改值无需额外确认。

#### Scenario: 尝试删除 Path
- **WHEN** 用户点击 Path 行的"删除"
- **THEN** 弹出二次确认 Modal，要求输入 `DELETE`
- **AND** 确认按钮在输入匹配前禁用

#### Scenario: 清空 TEMP 值
- **WHEN** 用户编辑 TEMP 并把值清空
- **THEN** 保存前 Diff Preview 额外显示黄色警告
- **AND** 需二次确认（输入 DELETE）才能继续

#### Scenario: 正常改 Path 值
- **WHEN** 用户在 PATH Tab 中添加 / 删除某行
- **THEN** 走普通 Diff Preview 流程，无额外二确

### Requirement: Sidebar 入口

系统 MUST 在 Sidebar 中添加 `env` 导航入口。非 Windows 平台 SHALL 隐藏该入口或显示禁用态并 Tooltip "仅支持 Windows"。

#### Scenario: Windows 平台正常入口
- **WHEN** 应用运行在 Windows
- **THEN** Sidebar 显示"环境变量"入口
- **AND** 点击进入 `env` 页面

#### Scenario: 非 Windows 平台
- **WHEN** 应用运行在 macOS / Linux
- **THEN** Sidebar 不显示"环境变量"入口
