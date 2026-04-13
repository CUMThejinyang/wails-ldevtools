## ADDED Requirements

### Requirement: Cleaner 模块在新架构落地

Cleaner 模块 MUST 以 `frontend-antd/src/features/cleaner/` 为根，自治管理其页面、子组件、hooks 与类型。模块入口 SHALL 以默认导出提供 `<CleanerPage />`，由 `App.tsx` 在 `activePage === 'cleaner'` 时渲染。

#### Scenario: 打开 Cleaner 页面
- **WHEN** 用户点击侧边栏 Cleaner 图标
- **THEN** 渲染 `features/cleaner` 模块入口页
- **AND** 页面由 `PageShell` 承载，标题为"文件清理"

### Requirement: 功能对齐老版本

新 Cleaner 模块 MUST 提供与 `frontend/src/pages/Cleaner/` 等价的功能集：
- 列出 / 新增 / 编辑 / 删除 / 启用或禁用清理配置（`FolderConfig`）。
- 配置项包含：名称、路径、匹配模式、递归、删除空目录、清理后删除文件夹本身、启用开关。
- 设置并发线程数（`threadCount`）。
- 开始清理前可执行预览（`CleanPreview`），弹出可勾选的 `PreviewItem` 列表。
- 清理执行时实时展示进度（订阅 `cleaner:progress`），并可取消。
- 清理完成后展示 `OverallResult` 汇总与每个文件夹的 `FolderResult`（订阅 `cleaner:completed`）。

#### Scenario: 新增清理配置
- **WHEN** 用户填写名称、选择路径、添加模式并保存
- **THEN** 新配置通过 `bridge.saveCleanerSettings` 持久化到 `~/.devtools/config.json`
- **AND** 列表中立即出现该配置项

#### Scenario: 预览匹配结果
- **WHEN** 用户对一条启用的配置点击"预览"
- **THEN** 调用 `bridge.cleanPreview` 返回 `PreviewItem[]`
- **AND** 弹窗按文件夹分组展示结果，默认全部勾选

#### Scenario: 开始并取消清理
- **WHEN** 用户点击"开始清理"
- **THEN** 调用 `bridge.cleanStart`，`ProgressPanel` 开始显示实时进度
- **AND** 用户点击"取消"后，`bridge.cleanCancel` 被调用，状态显示 `cancelled`

#### Scenario: 清理完成展示汇总
- **WHEN** 收到 `cleaner:completed` 事件
- **THEN** 展示 `OverallResult.totalDeleted`、`totalSize`、`duration`
- **AND** 按 `results[]` 列出每个文件夹的结果，错误项使用 `StatusTag` 高亮

### Requirement: 状态保留

Cleaner 页面 MUST 通过 `react-activation` 的 `KeepAlive` 保留状态，使得用户切到其他页面再切回后，输入态、展开态、进度与结果不丢失。

#### Scenario: 跨页面保持
- **WHEN** 用户在 Cleaner 页面中展开一条配置进入编辑态，然后切到 Sync 再切回 Cleaner
- **THEN** 编辑态、未保存的表单输入仍然在场
