# sync-module-antd Specification

## Purpose

TBD - created by archiving change refactor-frontend-antd. Update Purpose after archive.

## Requirements

### Requirement: Sync 模块在新架构落地

Sync 模块 MUST 以 `frontend-antd/src/features/sync/` 为根自治，并以默认导出提供 `<SyncPage />`。`App.tsx` 在 `activePage === 'sync'` 时渲染该页面。

#### Scenario: 打开 Sync 页面
- **WHEN** 用户点击侧边栏 Sync 图标
- **THEN** 渲染 `features/sync` 模块入口页
- **AND** 页面由 `PageShell` 承载，标题为"文件夹同步"

### Requirement: 功能对齐老版本

新 Sync 模块 MUST 提供与 `frontend/src/pages/Sync/` 等价的功能集：
- 配置源路径（`src`）、目标路径（`dst`）。
- 配置冲突策略（`ConflictMode`：`overwrite` / `skip` / `ask`）。
- 配置递归、匹配模式、线程数。
- 预览阶段（`SyncPreview`）列出 `SyncPreviewItem[]`，区分 `new` / `modified` / `identical`，默认仅勾选 `new` + `modified`。
- 同步执行时订阅 `sync:progress` 实时更新每条文件状态（`pending` → `syncing` → `synced` / `skipped` / `error`），可取消。
- 同步完成（`sync:completed`）后展示成功 / 跳过 / 失败计数与总耗时。

#### Scenario: 预览同步
- **WHEN** 用户填写 src/dst 并点击"预览"
- **THEN** 调用 `bridge.syncPreview`
- **AND** 弹窗列表用 `StatusTag` 按 `new/modified/identical` 着色，`identical` 默认不勾选

#### Scenario: 冲突策略为 ask
- **WHEN** 冲突策略设为 `ask`，同步过程中遇到已存在文件
- **THEN** 弹出确认弹窗询问用户"覆盖 / 跳过 / 跳过全部 / 覆盖全部"
- **AND** 用户选择被传回 Go 层继续执行

#### Scenario: 执行中取消
- **WHEN** 用户在同步进行中点击"取消"
- **THEN** 调用 `bridge.syncCancel`
- **AND** 未处理文件显示为 `cancelled` 或保持 `pending`，已处理文件保留其最终状态

### Requirement: 状态保留

Sync 页面 MUST 通过 `KeepAlive` 保留表单、预览选择、进度结果等状态。

#### Scenario: 跨页面保持
- **WHEN** 用户在 Sync 预览勾选后切换到其他页面再切回
- **THEN** 预览结果与勾选状态仍然保留
