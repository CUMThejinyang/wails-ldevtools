## Why

当前 `frontend/` 目录的 UI 全部用 inline style + 手写原子 CSS 拼装，缺乏设计系统沉淀：按钮、表单、表格、弹窗、通知等基础控件到处重复实现，样式逻辑散落，复用性差。随着 Cleaner / Sync / Settings 三个模块叠加，维护成本已开始显现，后续再加模块会更糟。需要引入成熟组件库（Ant Design）来统一交互语言，同时保留 Tailwind 做布局/间距/微调，让后续新增页面和组件有稳定的底座。

## What Changes

- 新建独立目录 `frontend-antd/`（与现有 `frontend/` 并存，保证老版本仍可构建），作为基于 Ant Design 的新一代前端实现。
- 技术栈：React 18 + TypeScript + Vite + **Ant Design 5** + **Tailwind CSS v4**；图标优先 `@ant-design/icons`，缺失时用内联 SVG 组件补齐。
- 重新规划目录结构：分层为 `app/`（入口与路由）、`components/`（纯展示复用组件）、`features/`（按业务领域划分，每个 feature 自带页面、子组件、hooks、types）、`services/`（Wails bridge 封装）、`hooks/`、`theme/`、`styles/`、`icons/`、`types/`。
- 以 `ConfigProvider` + CSS 变量双通道驱动主题，继承现有 `#00b96b` 主色、`#181818 / #222 / #2a2a2a` 三级深色背景、`0.5px rgba(255,255,255,0.1)` 边框、50px 侧边栏、36×36 圆形图标按钮等视觉规范，确保 **新界面与老版本像素级一致**。
- 抽象通用复用组件：`PageShell`（页面容器 + 标题栏槽位）、`SectionCard`、`IconButton`、`StatRow`、`EmptyState`、`PathPicker`、`ProgressPanel`、`PatternInput` 等，供三个模块共享。
- 保持 Go 侧零改动：Wails 绑定、`~/.devtools/config.json` 协议、`cleaner:progress` / `cleaner:completed` 事件全部沿用；仅替换前端消费层。
- 提供切换开关：构建脚本/`wails.json` 指向新目录；老目录作为回滚保留一个版本周期后再清理。
- **BREAKING**：`wails dev` / `wails build` 实际构建的前端切换到 `frontend-antd/`（开发者本地需 `pnpm install` 新目录依赖）。

## Capabilities

### New Capabilities
- `frontend-shell`: 新前端工程骨架——目录分层、Vite/TS/Tailwind/Antd 配置、主题与全局样式、Wails bridge 封装规范。
- `ui-component-library`: 项目内复用组件库——跨模块共享的 UI 原子与分子（`PageShell`、`SectionCard`、`IconButton`、`PathPicker`、`ProgressPanel` 等）与图标约定。
- `cleaner-module-antd`: Cleaner 模块在新架构下的实现，功能对齐老版本。
- `sync-module-antd`: Sync 模块在新架构下的实现，功能对齐老版本。
- `settings-module-antd`: Settings 模块在新架构下的实现，功能对齐老版本。

### Modified Capabilities
<!-- 无现有 openspec/specs/，此处为空 -->

## Impact

- **新增目录**：`frontend-antd/`（完整新工程，含 `package.json`、`vite.config.ts`、`tsconfig.json`、`tailwind.config.*`、`src/**`）。
- **配置**：`wails.json` 的 `frontend:install` / `frontend:build` / `frontend:dev:watcher` 指向 `frontend-antd/`；`main.go` 的 `//go:embed frontend/dist` 改为 `frontend-antd/dist`。
- **依赖新增**：`antd@^5`、`@ant-design/icons`、`dayjs`（antd peer）。保留 `tailwindcss@^4`、`@tailwindcss/vite`、`clsx`、`tailwind-merge`、`react-activation`。
- **Go 层**：不修改业务代码；仅 `embed` 路径变动。
- **旧 `frontend/`**：保留在仓库中作为回滚基线，不再参与构建；进入冻结状态。
- **开发流程**：首次使用需 `cd frontend-antd && pnpm install`；`wails dev` 入口不变。
