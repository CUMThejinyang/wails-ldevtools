## ADDED Requirements

### Requirement: Settings 模块在新架构落地

Settings 模块 MUST 以 `frontend-antd/src/features/settings/` 为根自治，并以默认导出提供 `<SettingsPage />`，在 `activePage === 'settings'` 时渲染。

#### Scenario: 打开 Settings 页面
- **WHEN** 用户点击侧边栏 Settings 图标
- **THEN** 渲染 `features/settings` 模块入口页
- **AND** 页面由 `PageShell` 承载，左侧为分类侧栏，右侧为详情区

### Requirement: 功能对齐老版本

新 Settings 模块 MUST 提供与 `frontend/src/pages/Settings/` 等价的功能集：
- 分类侧栏（至少包含"外观"分类，预留可扩展的其他分类）。
- "外观"分类中可切换 `dark` / `light` 主题，切换立即生效并通过 `bridge.setTheme` 持久化。
- 分类项激活态使用 `.btn-settings-item.active` 等价视觉（主色弱背景 + 主色文字）。

#### Scenario: 切换主题
- **WHEN** 用户在"外观"分类中点击"亮色"
- **THEN** 界面切到亮色主题
- **AND** 调用 `bridge.setTheme('light')` 写入 `~/.devtools/config.json`

#### Scenario: 分类激活态
- **WHEN** 当前处于"外观"分类
- **THEN** 分类侧栏的"外观"项显示为主色弱背景 + 主色文字
- **AND** 其他分类项保持默认灰色

### Requirement: 状态保留

Settings 页面 MUST 通过 `KeepAlive` 保留用户在分类间的选中状态。

#### Scenario: 跨页面保持
- **WHEN** 用户在 Settings 里选中某个分类后切到其他页面再切回
- **THEN** 该分类仍保持选中
