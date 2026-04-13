## ADDED Requirements

### Requirement: 跨模块共享布局组件

系统 MUST 提供 `PageShell`、`SectionCard`、`Toolbar` 三个布局组件，供 Cleaner / Sync / Settings 等所有 feature 复用。`PageShell` SHALL 承担页面顶部标题栏 + 操作区 + 内容区的统一框架；`SectionCard` SHALL 提供带标题与边框的分块容器；`Toolbar` SHALL 提供横向按钮组容器，保持按钮间距一致。

#### Scenario: 业务页面使用 PageShell 渲染
- **WHEN** Cleaner 或 Sync 页面渲染
- **THEN** 其根节点为 `<PageShell title=... actions=...>`
- **AND** 页面标题栏高度、内边距、下边框与老版本一致

#### Scenario: 组件在深浅主题下外观一致
- **WHEN** `PageShell` / `SectionCard` 在 dark 与 light 主题下分别渲染
- **THEN** 均使用 CSS 变量驱动色值，切换主题无需重载

### Requirement: 表单原子组件

系统 MUST 提供 `PathPicker`、`PatternInput`、`NumberStepper` 三个表单组件：
- `PathPicker` 封装"输入框 + 浏览按钮（调用 `bridge.selectDirectory` / `bridge.selectFile`）"。
- `PatternInput` 封装"标签式多值输入"，支持回车添加、点击移除。
- `NumberStepper` 封装带上下按钮的数字调节控件，支持 `min/max/step`。

所有组件 MUST 接受受控 `value` + `onChange`，并支持 `disabled`。

#### Scenario: 选择目录
- **WHEN** 用户在 `PathPicker` 上点击"浏览"
- **THEN** 组件调用 `bridge.selectDirectory`
- **AND** 用户选中后，选中路径回填到输入框并触发 `onChange`

#### Scenario: 添加匹配模式
- **WHEN** 用户在 `PatternInput` 中输入 `*.log` 并按回车
- **THEN** `*.log` 作为新标签加入值数组
- **AND** 输入框清空等待下一次输入

#### Scenario: 调整线程数
- **WHEN** 用户点击 `NumberStepper` 的上箭头
- **THEN** 值增加 `step`，且不超过 `max`

### Requirement: 反馈展示组件

系统 MUST 提供 `ProgressPanel`、`EmptyState`、`StatRow`、`StatusTag` 四个反馈组件：
- `ProgressPanel` 显示当前任务的进度条、当前文件、已处理数、总数、状态文案。
- `EmptyState` 显示空列表占位（图标 + 标题 + 描述 + 可选操作按钮）。
- `StatRow` 展示"标签: 数值"形式的统计行，用于结果面板。
- `StatusTag` 根据状态（`pending`/`scanning`/`deleting`/`syncing`/`done`/`error`/`cancelled`/`skipped`）渲染对应语义色的小标签。

#### Scenario: 进度更新
- **WHEN** Go 层发来 `cleaner:progress` 事件
- **THEN** `ProgressPanel` 根据事件内的 `deletedFiles` / `totalFiles` 更新进度条百分比
- **AND** 当前文件路径被截断显示且 hover 显示完整路径

#### Scenario: 空状态渲染
- **WHEN** Cleaner 配置列表为空
- **THEN** `EmptyState` 显示文案与"新增文件夹"按钮
- **AND** 按钮点击触发传入的 `onAction`

### Requirement: 导航与通用组件

系统 MUST 提供 `Sidebar`、`TitleBar`、`NavIconButton`、`IconButton`、`ConfirmModal` 五个通用组件：
- `Sidebar` 宽度 52px，垂直排列圆形图标按钮（36×36），激活项使用主色背景。
- `TitleBar` 高度 44px，包含窗口拖拽区、置顶按钮与最小化/最大化/关闭按钮。
- `NavIconButton` 专用于 Sidebar 项；`IconButton` 为通用图标方形按钮。
- `ConfirmModal` 封装 Antd Modal，提供 `title/content/onOk/onCancel`，默认 OK 按钮使用危险色。

#### Scenario: 侧边栏激活态
- **WHEN** `activePage` 为 `cleaner`
- **THEN** Cleaner 导航项渲染为 `#00b96b` 主色背景
- **AND** 其他项保持默认灰色图标

#### Scenario: 确认删除
- **WHEN** 用户点击"删除全部配置"
- **THEN** `ConfirmModal` 弹出
- **AND** 点击"确认"触发 `onOk`；点击"取消"或点击遮罩均触发 `onCancel`

### Requirement: 图标使用规范

组件中的图标 MUST 优先使用 `@ant-design/icons`；仅当该库缺失时，SHALL 在 `src/icons/` 下创建自绘 SVG React 组件，并通过命名导出提供。所有自绘图标 MUST 接受统一的 `IconProps = { size?: number; color?: string; className?: string }`，默认 `color` 为 `currentColor`。

#### Scenario: 使用内置图标
- **WHEN** 组件需要"文件夹"图标
- **THEN** 直接 `import { FolderOutlined } from '@ant-design/icons'`
- **AND** 不再引入 `lucide-react`

#### Scenario: 自绘补充图标
- **WHEN** 需要一个 `@ant-design/icons` 中没有的自定义图标（如 `FolderSync`）
- **THEN** 在 `src/icons/FolderSyncIcon.tsx` 中实现 SVG 组件并命名导出
- **AND** 该组件接受 `size`、`color`、`className` 三个 prop，默认 `color` 使用 `currentColor`

### Requirement: 视觉规范守恒

系统 MUST 保持与老 `frontend/` 视觉一致：
- 主色 `#00b96b`
- 暗色三级背景 `#181818` / `#222222` / `#2a2a2a`
- 边框 `0.5px solid rgba(255,255,255,0.1)`（暗）或 `rgba(0,0,0,0.14)`（亮）
- Sidebar 宽度 52px；TitleBar 高度 44px
- 圆角：基础控件 7px，卡片 10px
- 图标按钮 28×28（内部）/ 36×36（Sidebar）
- 无装饰性动画，仅保留状态反馈（loading spinner、进度条、fade-in）

#### Scenario: 像素级比对
- **WHEN** 新老两版同一页面（如 Cleaner 首页空态）并排截图比对
- **THEN** 标题栏、侧边栏、卡片、按钮的尺寸 / 圆角 / 主色均与老版本一致
- **AND** 无任何新增的装饰性动画
